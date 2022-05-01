const { app, BrowserWindow, ipcMain } = require('electron')
const startDownload = require('./src/core')
const setMenu = require('./src/menu')

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1024,
        height: 640,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    })

    mainWindow.setAspectRatio(16 / 10)
    mainWindow.loadFile('index.html')

    setMenu()
}

app.whenReady().then(() => {
    ipcMain.on('download-invoked', (event, url) => {
        startDownload(url, event)
    })

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    // On macOS it's common for applications and their menu bar to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') app.quit()
})
