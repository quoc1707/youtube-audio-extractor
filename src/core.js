const ffmpeg = require('fluent-ffmpeg')
const {
    unlinkSync,
    createWriteStream,
    readFileSync,
    writeFileSync,
} = require('fs')
const ytdl = require('ytdl-core')
const { app } = require('electron')
const { join } = require('path')
const ID3Writer = require('browser-id3-writer')
const ytpl = require('ytpl')
const { getCoverImage, getSongData } = require('./deezerApi')
const binaries = require('ffmpeg-static').replace(
    'app.asar',
    'app.asar.unpacked'
)

const formatSizeUnits = (bytes) => {
    if (bytes >= 1048576) bytes = (bytes / 1048576).toFixed(2) + ' MB'
    else if (bytes >= 1024) bytes = (bytes / 1024).toFixed(2) + ' KB'
    else bytes = bytes + ' bytes'

    return bytes.replace('.00', '')
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
        .replace(/ *\([^)]*\) */g, ' ')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .replace(/feat|feat.|ft.|[0-9]k/gi, '')
        .replace(/(?<=^| ).(?=$| )/g, '')
    let songDataFromDeezer = await getSongData(title)
    let downloadPath = app.getPath('downloads')
    let paths = await getVideoAsMp4(params.url, downloadPath, title, event)

    await convertMp4ToMp3(paths, event)

    unlinkSync(paths.filePath)

    if (songDataFromDeezer) {
        event.sender.send('download-status', 'Writing mp3 tags')
        await writeMp3TagsToFile(paths, songDataFromDeezer)
    }

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

const writeMp3TagsToFile = async (paths, songData) => {
    let coverImage = await getCoverImage(songData.cover)

    const songBuffer = readFileSync(join(paths.folderPath, paths.fileTitle))
    const writer = new ID3Writer(songBuffer)

    writer
        .setFrame('TIT2', songData.title)
        .setFrame('TPE1', songData.artist)
        .setFrame('TALB', songData.album)
        .setFrame('APIC', {
            type: 3,
            data: Buffer.from(coverImage.data, 'base64'),
            description: 'Front cover',
        })
        .addTag()

    unlinkSync(join(paths.folderPath, paths.fileTitle))

    const taggedSongBuffer = Buffer.from(writer.arrayBuffer)

    writeFileSync(join(paths.folderPath, paths.fileTitle), taggedSongBuffer)
}

module.exports = startDownload
