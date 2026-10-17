import { Menu, Tray, nativeImage, nativeTheme, type NativeImage } from 'electron'
import { BRAND } from '@shared/brand'
import { hex, rasterizeMark, type RGBA } from '@shared/markRaster'

export interface TrayHandlers {
  isListening(): boolean
  /** Algılanan görüşmenin uygulaması ("Zoom"); yoksa null. */
  detectedMeeting(): string | null
  productName(): string
  toggleListening(): void
  openAsk(): void
  answerNow(): void
  toggleIsland(): void
  openMain(): void
  quit(): void
}

/** Menü çubuğu öğesi: Piqi simgesi ve hızlı eylemler. */
export class PiqiTray {
  private tray: Tray
  constructor(private readonly handlers: TrayHandlers) {
    this.tray = new Tray(markIcon(false))
    nativeTheme.on('updated', () => this.refresh())
    this.tray.setToolTip('Piqi')
    this.refresh()
  }

  refresh(): void {
    const listening = this.handlers.isListening()
    const detected = this.handlers.detectedMeeting()
    this.tray.setImage(markIcon(listening))
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Ürün: ${this.handlers.productName()}`, enabled: false },
        ...(detected ? [{ label: `${detected} görüşmesi algılandı`, enabled: false }] : []),
        { type: 'separator' },
        {
          label: listening ? 'Dinlemeyi durdur' : 'Dinlemeye başla',
          accelerator: 'CommandOrControl+Shift+L',
          click: () => this.handlers.toggleListening()
        },
        { label: 'Piqi’ye sor…', accelerator: 'CommandOrControl+Shift+K', click: () => this.handlers.openAsk() },
        { type: 'separator' },
        { label: 'Son soruyu şimdi cevapla', accelerator: 'CommandOrControl+Shift+Space', click: () => this.handlers.answerNow() },
        { label: 'Island’ı gizle/göster', accelerator: 'CommandOrControl+Shift+H', click: () => this.handlers.toggleIsland() },
        { type: 'separator' },
        { label: 'Piqi’yi aç…', click: () => this.handlers.openMain() },
        { type: 'separator' },
        { label: 'Çıkış', accelerator: 'CommandOrControl+Q', click: () => this.handlers.quit() }
      ])
    )
  }
}

/**
 * Menü çubuğu ikonu: Piqi simgesi. Boştayken tek renk şablon (sistem rengi alır);
 * dinlerken köşesine kırmızı nokta eklenir (tasarım: "Menü çubuğu").
 */
function markIcon(listening: boolean): NativeImage {
  const size = 36 // 18 pt @2x
  const dark = nativeTheme.shouldUseDarkColors
  const ink: RGBA = listening ? (dark ? [255, 255, 255, 1] : [0, 0, 0, 0.88]) : [0, 0, 0, 1]
  const rgba = rasterizeMark({
    size,
    markSize: 34,
    ring: ink,
    core: ink,
    graded: true,
    dotScale: 1.3,
    live: listening ? hex(BRAND.live) : undefined
  })
  // Electron ham bitmap'i önceden çarpılmış BGRA bekler.
  const bgra = Buffer.alloc(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]! / 255
    bgra[i] = rgba[i + 2]! * a
    bgra[i + 1] = rgba[i + 1]! * a
    bgra[i + 2] = rgba[i]! * a
    bgra[i + 3] = rgba[i + 3]!
  }
  const image = nativeImage.createFromBitmap(bgra, { width: size, height: size, scaleFactor: 2 })
  image.setTemplateImage(!listening)
  return image
}
