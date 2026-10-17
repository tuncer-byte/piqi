import { stem, trLower } from '../knowledge/query'

/** Karşı tarafın cümlesinin hoparlörden mikrofona sızması bu süre içinde gelir. */
const WINDOW_MS = 4_000
/** Kısa cümlelerde ("evet", "tamam") yanlış eşleşmeyi önlemek için en az bu kadar kelime. */
const MIN_WORDS = 3
/** Kelimelerin bu oranı ortaksa aynı cümle sayılır (konuşma tanıma iki kanalda farklı duyabilir). */
const OVERLAP = 0.6

/** Yankı için sık kelimeler de ayırt edicidir ("ne", "nasıl", "oluyor"); atılmaz, yalnızca köke indirilir. */
const words = (text: string): Set<string> =>
  new Set(
    trLower(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1)
      .map(stem)
  )

/**
 * Hoparlörle yapılan toplantıda karşı tarafın sesi mikrofona da sızar ve aynı cümle "ben" kanalında
 * tekrar yazıya dökülür. Bu filtre o yankıyı ayıklar: transkript ve özet kopyalanmaz, karşı tarafın
 * sesindeki bir "Selam Piqi" uyandırmayı tetiklemez.
 */
export class EchoFilter {
  private theirs: { t: number; words: Set<string> }[] = []

  constructor(private readonly now: () => number = Date.now) {}

  heardTheirs(text: string): void {
    const set = words(text)
    if (set.size < MIN_WORDS) return
    this.prune()
    this.theirs.push({ t: this.now(), words: set })
  }

  /** "Ben" kanalındaki kesin cümle, az önce karşı tarafta duyulanın yankısı mı? */
  isEcho(text: string): boolean {
    const mine = words(text)
    if (mine.size < MIN_WORDS) return false
    this.prune()
    return this.theirs.some(({ words: theirs }) => {
      let shared = 0
      for (const w of mine) if (theirs.has(w)) shared++
      return shared / Math.min(mine.size, theirs.size) >= OVERLAP
    })
  }

  private prune(): void {
    const cutoff = this.now() - WINDOW_MS
    this.theirs = this.theirs.filter((e) => e.t >= cutoff)
  }
}
