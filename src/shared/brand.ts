// Piqi simgesi: "Dinleyen sekiz nokta, ortada cevap veren bir nokta."
// Geometri tasarım dosyasından ölçüldü (0 · Piqi simgesi@2x.png); 100 birimlik kare üzerinde.
// Arayüz (SVG), menü çubuğu ikonu ve uygulama ikonu bu tek kaynaktan çizilir.

export const MARK_CENTER = 50
export const MARK_RING = 25

export interface MarkDot {
  x: number
  y: number
  r: number
  /** Koyu zeminde lime noktaların görünürlüğü: tepede soluk, aşağıda parlak (perspektif hissi). */
  opacity: number
}

const RING: { r: number; opacity: number }[] = [
  { r: 2.9, opacity: 0.52 }, // tepe
  { r: 3.6, opacity: 0.6 },
  { r: 4.5, opacity: 0.68 },
  { r: 5.2, opacity: 0.82 },
  { r: 6.1, opacity: 1 }, // dip
  { r: 5.2, opacity: 0.82 },
  { r: 4.5, opacity: 0.68 },
  { r: 3.6, opacity: 0.6 }
]

/** Saat yönünde, tepeden başlayan sekiz halka noktası. */
export const MARK_DOTS: MarkDot[] = RING.map((d, i) => {
  const angle = (i * Math.PI) / 4
  return {
    x: MARK_CENTER + MARK_RING * Math.sin(angle),
    y: MARK_CENTER - MARK_RING * Math.cos(angle),
    r: d.r,
    opacity: d.opacity
  }
})

export const MARK_CORE: MarkDot = { x: MARK_CENTER, y: MARK_CENTER, r: 7, opacity: 1 }

export const BRAND = {
  lime: '#C8F169',
  ink: '#0E0E10',
  paper: '#F4F3EF',
  olive: '#8DB52F',
  live: '#FF5A4F'
} as const
