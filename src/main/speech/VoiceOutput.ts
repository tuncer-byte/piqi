import { EventEmitter } from 'node:events'
import { rm } from 'node:fs/promises'
import type { Settings } from '@shared/types'
import type { AudioService } from '../audio/AudioService'
import type { EmaEngine } from './EmaEngine'

/** Bu uygulamalar ses üretiyorsa kullanıcı toplantıdadır; "otomatik" modda Piqi sesli konuşmaz. */
const MEETING_BUNDLES = [
  'com.microsoft.teams',
  'us.zoom.xos',
  'Cisco-Systems.Spark',
  'com.tinyspeck.slackmacgap',
  'com.apple.FaceTime'
]

/** Akan metni cümle sınırlarından bölerek seslendirme kuyruğuna verir. */
export interface SentenceSink {
  push(delta: string): void
  /** Kalan metni okutur ve tüm cümleler bitince çözülür. */
  end(): Promise<void>
}

export class VoiceOutput extends EventEmitter<{ speaking: [boolean] }> {
  private pending = new Map<string, () => void>()
  private active = new Set<string>()
  private seq = 0

  constructor(
    private readonly audio: AudioService,
    private readonly settings: () => Settings,
    private readonly ema: EmaEngine
  ) {
    super()
    audio.on('speakStart', (id) => {
      if (!this.pending.has(id)) return
      this.active.add(id)
      if (this.active.size === 1) this.emit('speaking', true)
    })
    audio.on('speakEnd', (id) => {
      const done = this.pending.get(id)
      if (!done) return
      this.pending.delete(id)
      this.active.delete(id)
      done()
      if (this.pending.size === 0) this.emit('speaking', false)
    })
  }

  get isSpeaking(): boolean {
    return this.pending.size > 0
  }

  /** Ayara ve toplantı durumuna göre sesli cevap verilip verilmeyeceği. `force` prova modu içindir. */
  async shouldSpeak(force = false): Promise<boolean> {
    if (force) return true
    const mode = this.settings().voice.replies
    if (mode === 'always') return true
    if (mode === 'never') return false
    try {
      const processes = await this.audio.listProcesses()
      return !processes.some((p) => p.isRunningOutput && MEETING_BUNDLES.some((b) => p.bundleId.startsWith(b)))
    } catch {
      return false
    }
  }

  /** Metni okur; okuma bitince çözülür. Türkçe metinde seçiliyse EMA Lightning, değilse Apple sesi. */
  async say(text: string): Promise<void> {
    const clean = forSpeech(text)
    if (!clean) return
    const { voice, speech } = this.settings()
    if (voice.engine === 'ema' && speech.locale === 'tr-TR' && this.ema.installed() && !looksEnglish(clean)) {
      try {
        const path = await this.ema.synthesize(clean, Math.min(1.6, Math.max(0.7, voice.rate / 0.5)))
        const id = `x${++this.seq}`
        const done = new Promise<void>((resolve) => this.pending.set(id, resolve))
        await this.audio.play(id, path)
        await done
        await rm(path, { force: true })
        return
      } catch (error) {
        console.warn('[piqi] EMA seslendirme başarısız, Apple sesine düşülüyor:', error)
      }
    }
    const id = await this.audio.speak({ text: clean, language: speech.locale, voice: voice.voiceId, rate: voice.rate })
    await new Promise<void>((resolve) => this.pending.set(id, resolve))
  }

  sentences(): SentenceSink {
    let buffer = ''
    const spoken: Promise<void>[] = []
    const flush = (force: boolean): void => {
      // Cümle sonu: . ! ? … veya satır sonu; sayı içindeki noktaları (1.5) bölmemek için ardından boşluk aranır.
      const pattern = force ? /[\s\S]+/ : /^[\s\S]*?[.!?…](?=\s)|^[\s\S]*?\n/
      let match = pattern.exec(buffer)
      while (match && match[0].trim()) {
        spoken.push(this.say(match[0]))
        buffer = buffer.slice(match[0].length)
        if (force) break
        match = pattern.exec(buffer)
      }
    }
    return {
      push: (delta) => {
        buffer += delta
        flush(false)
      },
      end: async () => {
        flush(true)
        await Promise.all(spoken)
      }
    }
  }

  stop(): void {
    this.audio.stopSpeaking()
  }
}

/** Markdown işaretlerini seslendirmeden önce temizler. */
export function forSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s?\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** EMA yalnızca Türkçe okur; Türkçe harf içermeyen ve İngilizce kelimeleri olan metin Apple sesine gider. */
export function looksEnglish(text: string): boolean {
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return false
  const words = text.toLowerCase().match(/\b(the|and|is|are|you|your|this|that|with|for|what|how|we|of|to)\b/g)
  return (words?.length ?? 0) >= 2
}
