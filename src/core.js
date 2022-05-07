const ffmpeg = require('fluent-ffmpeg')
const { unlinkSync, createWriteStream } = require('fs')
const ytdl = require('ytdl-core')
const { app } = require('electron')
const { join } = require('path')
const ytpl = require('ytpl')
const binaries = require('ffmpeg-static').replace(
    'app.asar',
    'app.asar.unpacked'
)

const formatSizeUnits = (bytes) => {
    if (bytes >= 1048576) bytes = (bytes / 1048576).toFixed(2) + ' MB'
    else if (bytes >= 1024) bytes = (bytes / 1024).toFixed(2) + ' KB'
    else bytes = bytes + ' bytes'

    bytes = bytes.replace('.00', '')

    return bytes
}

const startDownload = async (params, event) => {
    let playlist = await ytpl(params.url).catch((error) => console.log(error))

    if (playlist && playlist.items.length) {
        for (let i = 0; i < playlist.items.length; i++) {
            event.sender.send(
                'playlist-status',
                `Playlist ${i + 1} / ${playlist.items.length}`
            )

            let song = playlist.items[i]

            await singleDownload({ url: song.url }, event)
        }
    } else await singleDownload(params, event)
}

const singleDownload = async (params, event) => {
    const info = await ytdl
        .getInfo(params.url)
        .catch((error) => console.log(error))

    if (!info) {
        event.sender.send('download-status', 'Video not found')
        return
    }

    let title = info.videoDetails.title
        .toLowerCase()
        .replace('-', '')
        .replace(/\s{1,}/g, '_')
    let downloadPath = app.getPath('downloads')
    let paths = await getVideoAsMp4(params.url, downloadPath, title, event)

    await convertMp4ToMp3(paths, event)

    unlinkSync(paths.filePath)

    event.sender.send('download-status', 'Completed', title)
}

const getVideoAsMp4 = (urlLink, userProvidedPath, title, event) => {
    event.sender.send('download-status', 'Downloading')

    return new Promise((resolve, reject) => {
        let fullPath = join(userProvidedPath, `tmp_${title}.mp4`)
        let videoObject = ytdl(urlLink, { filter: 'audioonly' })

        videoObject
            .on('progress', (chunkLength, downloaded, total) => {
                let newVal = Math.floor((downloaded / total) * 100)
                event.sender.send('download-status', `Downloading [${newVal}%]`)
            })
            .pipe(createWriteStream(fullPath))
            .on('finish', () => {
                setTimeout(() => {
                    resolve({
                        filePath: fullPath,
                        folderPath: userProvidedPath,
                        fileTitle: `${title}.mp3`,
                    })
                }, 1000)
            })
    })
}

const convertMp4ToMp3 = (paths, event) => {
    event.sender.send('download-status', 'Converting')

    return new Promise(async (resolve, reject) => {
        ffmpeg(paths.filePath)
            .setFfmpegPath(binaries)
            .format('mp3')
            .audioBitrate(320)
            .on('progress', (progress) => {
                event.sender.send(
                    'download-status',
                    `Converting [${formatSizeUnits(
                        progress.targetSize * 1024
                    )}]`
                )
            })
            .output(createWriteStream(join(paths.folderPath, paths.fileTitle)))
            .on('end', () => {
                event.sender.send('progress-status', 100)
                resolve()
            })
            .run()
    })
}

module.exports = startDownload
