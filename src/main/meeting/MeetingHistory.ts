import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listItem, type MeetingAnswer, type MeetingLine, type MeetingListItem, type MeetingRecord, type MeetingSummary } from '@shared/meetings'

/** Süren toplantı bu aralıkla diske yazılır; uygulama çökse bile transkript kaybolmaz. */
const SAVE_EVERY_MS = 5_000
const DAY_MS = 24 * 60 * 60_000

export type Summarizer = (record: MeetingRecord) => Promise<MeetingSummary | null>

/**
 * Toplantı geçmişi: her toplantı userData/meetings/<id>.json dosyasıdır (transkript, Piqi'nin cevapları, özet).
 * Toplantı bitince özet arka planda üretilir. Saklama süresi dolan kayıtlar silinir. İçerik bu Mac'ten çıkmaz;
 * yalnızca özet için seçili modele gider.
 */
export class MeetingHistory extends EventEmitter<{ change: [MeetingListItem[]]; record: [MeetingRecord] }> {
  private records = new Map<string, MeetingRecord>()
  private current: MeetingRecord | null = null
  private saveTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly dir: string,
    private readonly summarizer: Summarizer,
    private readonly now: () => number = Date.now
  ) {
    super()
    mkdirSync(dir, { recursive: true })
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const record = JSON.parse(readFileSync(join(dir, file), 'utf8')) as MeetingRecord
        // Uygulama toplantı sürerken kapandıysa kayıt kapatılır; özeti istenirse yeniden üretilebilir.
        if (record.status === 'live' || record.status === 'summarizing') {
          record.status = 'error'
          record.note = 'Uygulama toplantı sırasında kapandı; özet için “Yeniden özetle”yi kullan.'
          record.endedAt ??= record.lines.at(-1)?.t ?? record.startedAt
          this.write(record)
        }
        this.records.set(record.id, record)
      } catch {
        // bozuk dosyayı atla
      }
    }
  }

  list(): MeetingListItem[] {
    return [...this.records.values()].sort((a, b) => b.startedAt - a.startedAt).map(listItem)
  }

  get(id: string): MeetingRecord | null {
    return this.records.get(id) ?? null
  }

  get live(): MeetingRecord | null {
    return this.current
  }

  begin(app: string | null): MeetingRecord {
    if (this.current) this.end()
    const record: MeetingRecord = {
      id: randomUUID(),
      app,
      startedAt: this.now(),
      endedAt: null,
      status: 'live',
      note: null,
      lines: [],
      answers: [],
      summary: null
    }
    this.current = record
    this.records.set(record.id, record)
    this.write(record)
    this.changed(record)
    return record
  }

  addLine(line: MeetingLine): void {
    if (!this.current || !line.text.trim()) return
    this.current.lines.push(line)
    this.scheduleSave()
  }

  addAnswer(answer: MeetingAnswer): void {
    if (!this.current) return
    this.current.answers.push(answer)
    this.scheduleSave()
    this.emit('record', this.current)
  }

  /** Toplantıyı kapatır ve özeti arka planda başlatır. Boş toplantı (hiç konuşma yok) saklanmaz. */
  end(): MeetingRecord | null {
    const record = this.current
    if (!record) return null
    this.current = null
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    record.endedAt = this.now()
    if (record.lines.length === 0 && record.answers.length === 0) {
      this.delete(record.id)
      return null
    }
    void this.summarize(record.id)
    return record
  }

  async summarize(id: string): Promise<void> {
    const record = this.records.get(id)
    // Süren toplantı özetlenmez; bitince end() başlatır.
    if (!record || record === this.current) return
    this.patch(record, { status: 'summarizing', note: null })
    try {
      const summary = await this.summarizer(record)
      if (!this.records.has(id)) return
      this.patch(record, summary ? { status: 'ready', summary } : { status: 'ready', note: 'Özet için yeterli konuşma yok.' })
    } catch (error) {
      if (!this.records.has(id)) return
      this.patch(record, { status: 'error', note: `Özet üretilemedi: ${(error as Error).message}` })
    }
  }

  delete(id: string): void {
    if (this.current?.id === id) this.current = null
    this.records.delete(id)
    rmSync(this.file(id), { force: true })
    this.emit('change', this.list())
  }

  /** Saklama süresi dolan toplantıları siler (süren toplantıya dokunmaz). */
  prune(retentionDays: number): void {
    const cutoff = this.now() - retentionDays * DAY_MS
    let removed = false
    for (const record of [...this.records.values()]) {
      if (record === this.current || (record.endedAt ?? record.startedAt) >= cutoff) continue
      this.records.delete(record.id)
      rmSync(this.file(record.id), { force: true })
      removed = true
    }
    if (removed) this.emit('change', this.list())
  }

  /** Bekleyen kaydı hemen yazar (uygulama kapanırken). */
  flush(): void {
    if (this.current) this.write(this.current)
  }

  private patch(record: MeetingRecord, patch: Partial<MeetingRecord>): void {
    Object.assign(record, patch)
    this.write(record)
    this.changed(record)
  }

  private changed(record: MeetingRecord): void {
    this.emit('change', this.list())
    this.emit('record', record)
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.current) {
        this.write(this.current)
        this.changed(this.current)
      }
    }, SAVE_EVERY_MS)
  }

  private file(id: string): string {
    return join(this.dir, `${id}.json`)
  }

  private write(record: MeetingRecord): void {
    const file = this.file(record.id)
    writeFileSync(`${file}.tmp`, JSON.stringify(record))
    renameSync(`${file}.tmp`, file)
  }
}
