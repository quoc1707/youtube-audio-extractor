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

const convertVietnameseToNonAccent = (str) => {
    let text = str
        .replace(/A|Á|À|Ã|Ạ|Â|Ấ|Ầ|Ẫ|Ậ|Ă|Ắ|Ằ|Ẵ|Ặ/g, 'A')
        .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a')
        .replace(/E|É|È|Ẽ|Ẹ|Ê|Ế|Ề|Ễ|Ệ/, 'E')
        .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e')
        .replace(/I|Í|Ì|Ĩ|Ị/g, 'I')
        .replace(/ì|í|ị|ỉ|ĩ/g, 'i')
        .replace(/O|Ó|Ò|Õ|Ọ|Ô|Ố|Ồ|Ỗ|Ộ|Ơ|Ớ|Ờ|Ỡ|Ợ/g, 'O')
        .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o')
        .replace(/U|Ú|Ù|Ũ|Ụ|Ư|Ứ|Ừ|Ữ|Ự/g, 'U')
        .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u')
        .replace(/Y|Ý|Ỳ|Ỹ|Ỵ/g, 'Y')
        .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y')
        .replace(/Đ/g, 'D')
        .replace(/đ/g, 'd')
        .replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '')
        .replace(/\u02C6|\u0306|\u031B/g, '')
    return text
}

const startDownload = async (params, event) => {
    let playlist = await ytpl(params.url).catch((error) => console.log(error))

    if (!playlist) await singleDownload(params, event)
    else {
        for (let i = 0; i < playlist.items.length; i++) {
            event.sender.send(
                'playlist-status',
                `Playlist ${i + 1} / ${playlist.items.length}`
            )

            let song = playlist.items[i]

            await singleDownload({ url: song.url }, event)
        }
    }
}

const singleDownload = async (params, event) => {
    const info = await ytdl
        .getInfo(params.url)
        .catch((error) => console.log(error))

    if (!info) {
        event.sender.send('download-status', `Video can't be found.`)
        return
    }

    let title = convertVietnameseToNonAccent(info.videoDetails.title)
        .toLowerCase()
        .replace(/[^\x00-\x7F]/gm, '')
        .replace('-', ' ')
        .replace(',', ' ')
        .replace('/', ' ')
        .replace(/\s{1,}/g, '_')
    let downloadPath = app.getPath('music')
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
