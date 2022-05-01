const { ipcRenderer } = require('electron')

const statusElement = document.querySelector('#status')

if (localStorage.getItem('theme') === 'dark-theme')
    document.documentElement.classList.add('dark')

document
    .querySelector('#download-button')
    .addEventListener('click', function () {
        this.blur()

        let url = document.querySelector('#url-input').value.replace(' ', '')

        if (!url) return

        statusElement.textContent = 'Initializing'

        let params = {
            url: url,
        }

        ipcRenderer.send('download-invoked', params)
    })

ipcRenderer.on('download-status', (event, status, songTitle) => {
    if (status === 'Completed') {
        new Notification('Successful download', {
            body: `${songTitle} has been successfully downloaded.`,
        })
        statusElement.textContent = ''
    } else statusElement.textContent = status
})

ipcRenderer.on('playlist-status', (event, status) => {
    document.querySelector('#playlist').textContent = status
})

ipcRenderer.on('theme-switch', (event, theme) => {
    let isDarkMode = document.documentElement.classList.contains('dark')

    if (theme === 'dark-theme' && !isDarkMode) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('theme', theme)
    } else if (theme === 'light-theme' && isDarkMode) {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('theme', theme)
    }
})
