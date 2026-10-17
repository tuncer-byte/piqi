import { EventEmitter } from 'node:events'
import { meetingAppFor, MEETING_APPS, type MeetingApp } from '@shared/meetingApps'
import type { AudioProcessInfo } from '@shared/types'

/** Yoklama aralığı: Core Audio süreç listesi ucuzdur; birkaç saniyelik gecikme kabul edilebilir. */
export const POLL_MS = 2_000
/** Mikrofon bu kadar süre kesintisiz kullanılırsa toplantı başladı sayılır (kısa ses testleri tetiklemesin). */
export const START_AFTER_MS = 3_000
/** Mikrofon bu kadar süre kullanılmazsa toplantı bitti sayılır (cihaz değişimi ve kısa kesilmeler için pay). */
export const END_AFTER_MS = 20_000

interface DetectorEvents {
  /** Bir toplantı uygulaması görüşmeye girdi. */
  start: [MeetingApp]
  /** Görüşme bitti (uygulama mikrofonu bıraktı). */
  end: [MeetingApp]
}

/**
 * Teams, Zoom, Webex, Slack huddle, FaceTime ve tarayıcıdaki toplantıları algılar. Sinyal, uygulamanın
 * mikrofonu kullanmasıdır (Core Audio `kAudioProcessPropertyIsRunningInput`): görüşmeye girilince açılır,
 * çıkınca kapanır. Ekran kaydı izni veya pencere başlığı gerekmez; Piqi'nin kendi süreçleri listede yer almaz.
 */
export class MeetingDetector extends EventEmitter<DetectorEvents> {
  private timer: NodeJS.Timeout | null = null
  private polling = false
  /** Mikrofonu kullanan toplantı uygulaması ilk ne zaman görüldü (başlama gecikmesi için). */
  private candidate: { app: MeetingApp; since: number } | null = null
  private active: { app: MeetingApp; lastSeen: number } | null = null

  constructor(
    private readonly list: () => Promise<AudioProcessInfo[]>,
    private readonly now: () => number = Date.now
  ) {
    super()
  }

  get current(): MeetingApp | null {
    return this.active?.app ?? null
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), POLL_MS)
    void this.poll()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.candidate = null
    if (this.active) {
      const { app } = this.active
      this.active = null
      this.emit('end', app)
    }
  }

  /** Bir yoklama turu; testte doğrudan çağrılır. */
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      this.observe(inCall(await this.list()))
    } catch {
      // Yardımcı geçici olarak yanıt vermediyse durum değiştirme; bir sonraki tur yeniden dener.
    } finally {
      this.polling = false
    }
  }

  private observe(app: MeetingApp | null): void {
    const now = this.now()
    if (this.active) {
      if (app?.id === this.active.app.id) this.active.lastSeen = now
      else if (now - this.active.lastSeen >= END_AFTER_MS) {
        const ended = this.active.app
        this.active = null
        this.candidate = null
        this.emit('end', ended)
      }
      return
    }
    if (!app) {
      this.candidate = null
      return
    }
    if (this.candidate?.app.id !== app.id) this.candidate = { app, since: now }
    if (now - this.candidate.since >= START_AFTER_MS) {
      this.active = { app, lastSeen: now }
      this.candidate = null
      this.emit('start', app)
    }
  }
}

/** Mikrofonu kullanan, öncelik sırasına göre ilk toplantı uygulaması. */
export function inCall(processes: AudioProcessInfo[]): MeetingApp | null {
  const using = new Set(processes.filter((p) => p.isRunningInput).map((p) => meetingAppFor(p.bundleId)?.id))
  return MEETING_APPS.find((app) => using.has(app.id)) ?? null
}
