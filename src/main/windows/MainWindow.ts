import { BrowserWindow, nativeTheme, shell } from 'electron'
import { loadPage, preloadPath } from './load'

let mainWindow: BrowserWindow | null = null

export function showMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Piqi',
    titleBarStyle: 'hiddenInset',
    // 44 px başlık çubuğunda dikey ortalı trafik ışıkları (tasarım).
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131316' : '#F6F5F1',
    show: false,
    webPreferences: {
      preload: preloadPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Dış bağlantılar sistem tarayıcısında açılır; uygulama içinde gezinme engellenir.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  void loadPage(mainWindow, 'index')
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}
