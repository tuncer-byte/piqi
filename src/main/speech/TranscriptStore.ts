import type { AudioChannel, TranscriptEvent } from '@shared/types'

const KEEP_MS = 15 * 60_000
const LABEL: Record<AudioChannel, string> = { me: 'Ben', them: 'Karşı taraf' }

/** Kesinleşmiş transkript cümlelerinin son 15 dakikası; "toplantı bağlamı" buradan üretilir. */
export class TranscriptStore {
  private finals: (TranscriptEvent & { label: string })[] = []

  /** `label`: karşı taraf için "Konuşmacı 2" / "Elif" gibi konuşmacı adı. */
  add(event: TranscriptEvent, label?: string): void {
    if (!event.final || !event.text.trim()) return
    this.finals.push({ ...event, label: event.channel === 'me' ? LABEL.me : (label ?? LABEL.them) })
    const cutoff = Date.now() - KEEP_MS
    while (this.finals.length && this.finals[0]!.t < cutoff) this.finals.shift()
  }

  /** Son `ms` milisaniyedeki konuşmayı "Ben: …" / "Konuşmacı 2: …" satırları olarak döner. */
  recent(ms: number): string {
    const cutoff = Date.now() - ms
    return this.finals
      .filter((e) => e.t >= cutoff)
      .map((e) => `${e.label}: ${e.text}`)
      .join('\n')
  }

  clear(): void {
    this.finals = []
  }
}
