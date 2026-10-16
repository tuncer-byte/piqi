import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

/** Dev'de Vite sunucusundan, paketli sürümde diskteki HTML'den yükler. */
export function loadPage(win: BrowserWindow, page: 'index' | 'island'): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return win.loadURL(`${devUrl}/${page}.html`)
  return win.loadFile(join(__dirname, `../renderer/${page}.html`))
}

export const preloadPath = (): string => join(__dirname, '../preload/index.js')
