import { BrowserWindow, screen } from 'electron'
import { loadPage, preloadPath } from './load'

// Pencere, Island'ın en geniş hâlini (genişletilmiş cevap) alacak kadar büyük ve tamamen şeffaftır.
// Boş alanlar tıklamaları alttaki uygulamaya geçirir; yalnızca imleç Island üzerindeyken tıklama yakalanır.
const WIDTH = 720
const HEIGHT = 520

export function createIslandWindow(hideInScreenShare: boolean): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds(),
    type: 'panel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // Odak çalmaz: toplantı uygulamasındaki klavye odağı korunur.
    focusable: false,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  // Menü çubuğunun ve tam ekran uygulamaların üstünde, tüm Space'lerde görünür.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setContentProtection(hideInScreenShare)
  win.setIgnoreMouseEvents(true, { forward: true })

  const reposition = (): void => win.setBounds(bounds())
  screen.on('display-metrics-changed', reposition)
  screen.on('display-added', reposition)
  screen.on('display-removed', reposition)
  win.on('closed', () => {
    screen.off('display-metrics-changed', reposition)
    screen.off('display-added', reposition)
    screen.off('display-removed', reposition)
  })

  win.once('ready-to-show', () => {
    reposition()
    win.showInactive()
  })
  void loadPage(win, 'island')
  return win
}

/** Island her zaman birincil ekranın (notch'lu dahili ekran) üst ortasına yapışır. */
function bounds(): Electron.Rectangle {
  const display = screen.getPrimaryDisplay()
  return {
    x: Math.round(display.bounds.x + (display.bounds.width - WIDTH) / 2),
    y: display.bounds.y,
    width: WIDTH,
    height: HEIGHT
  }
}
