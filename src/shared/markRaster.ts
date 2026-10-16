// Piqi simgesini piksel tamponuna çizer (bağımlılıksız, 4×4 süper örneklemeli kenar yumuşatma).
// Menü çubuğu ikonu (main) ve uygulama ikonu (scripts/gen-icons.ts) bunu kullanır.
import { MARK_CORE, MARK_DOTS } from './brand.ts'

export type RGBA = [number, number, number, number]

export interface RasterOptions {
  size: number
  /** Simgenin 100 birimlik alanının piksel karşılığı (varsayılan: tüm tuval). */
  markSize?: number
  ring: RGBA
  core: RGBA
  /** Nokta saydamlığını tepeden aşağı kademelendir (koyu zemin stili). */
  graded?: boolean
  /** Küçük boyutlarda okunurluk için nokta büyütme çarpanı. */
  dotScale?: number
  background?: { color: RGBA; inset: number; radius: number }
  /** Sağ üstte kırmızı "dinliyor" noktası. */
  live?: RGBA
}

interface Shape {
  hit: (x: number, y: number) => boolean
  color: RGBA
}

const SAMPLES = 4

export function rasterizeMark(o: RasterOptions): Uint8ClampedArray {
  const { size } = o
  const markSize = o.markSize ?? size
  const offset = (size - markSize) / 2
  const k = markSize / 100
  const scale = o.dotScale ?? 1
  const shapes: Shape[] = []

  if (o.background) {
    const { inset, radius, color } = o.background
    const a = inset
    const b = size - inset
    shapes.push({
      color,
      hit: (x, y) => {
        if (x < a || x > b || y < a || y > b) return false
        const cx = Math.min(Math.max(x, a + radius), b - radius)
        const cy = Math.min(Math.max(y, a + radius), b - radius)
        return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
      }
    })
  }

  const circle = (cx: number, cy: number, r: number, color: RGBA): Shape => ({
    color,
    hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  })

  for (const dot of MARK_DOTS) {
    const alpha = o.graded ? o.ring[3] * dot.opacity : o.ring[3]
    shapes.push(circle(offset + dot.x * k, offset + dot.y * k, dot.r * k * scale, [o.ring[0], o.ring[1], o.ring[2], alpha]))
  }
  shapes.push(circle(offset + MARK_CORE.x * k, offset + MARK_CORE.y * k, MARK_CORE.r * k * scale, o.core))
  if (o.live) shapes.push(circle(size * 0.86, size * 0.14, size * 0.14, o.live))

  const out = new Uint8ClampedArray(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = px + (sx + 0.5) / SAMPLES
          const y = py + (sy + 0.5) / SAMPLES
          // Katmanları sırayla "over" ile birleştir.
          let cr = 0
          let cg = 0
          let cb = 0
          let ca = 0
          for (const shape of shapes) {
            if (!shape.hit(x, y)) continue
            const [sr, sg, sb, sa] = shape.color
            const na = sa + ca * (1 - sa)
            if (na > 0) {
              cr = (sr * sa + cr * ca * (1 - sa)) / na
              cg = (sg * sa + cg * ca * (1 - sa)) / na
              cb = (sb * sa + cb * ca * (1 - sa)) / na
            }
            ca = na
          }
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const n = SAMPLES * SAMPLES
      const i = (py * size + px) * 4
      const alpha = a / n
      out[i] = alpha > 0 ? r / a : 0
      out[i + 1] = alpha > 0 ? g / a : 0
      out[i + 2] = alpha > 0 ? b / a : 0
      out[i + 3] = alpha * 255
    }
  }
  return out
}

export function hex(color: string, alpha = 1): RGBA {
  const v = color.replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), alpha]
}
