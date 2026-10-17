import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MeetingRecord, MeetingSummary } from '@shared/meetings'
import { defaultSettings } from '../SettingsStore'
import type { LlmService } from '../llm/LlmService'
import { MeetingHistory } from './MeetingHistory'
import { MIN_TRANSCRIPT_CHARS, summarizeMeeting, transcriptText } from './summarize'

const SUMMARY: MeetingSummary = {
  title: 'Entegrasyon görüşmesi',
  overview: 'Rate limit ve webhook yeniden denemeleri konuşuldu.',
  decisions: ['Pilot iki hafta sürecek'],
  actions: [{ owner: 'Ben', text: 'SLA belgesini gönder' }],
  openQuestions: ['Veri merkezi konumu'],
  followUpEmail: 'Merhaba Elif Hanım, …'
}

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'piqi-meetings-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

const line = (text: string, t = 1_000) => ({ t, channel: 'them' as const, speaker: 'Elif', text })

describe('MeetingHistory', () => {
  it('toplantıyı kaydeder, bitince özetler ve yeniden açılışta korur', async () => {
    const dir = tempDir()
    const summarizer = vi.fn(async () => SUMMARY)
    const history = new MeetingHistory(dir, summarizer)
    const record = history.begin('Zoom')
    history.addLine(line('Rate limit aşılırsa ne oluyor?'))
    history.addAnswer({ t: 2_000, question: 'Rate limit?', askedBy: 'Elif', answer: 'Dakikada 600.', sources: [], confidence: 'grounded' })
    history.end()
    await vi.waitFor(() => expect(history.get(record.id)?.status).toBe('ready'))

    const reloaded = new MeetingHistory(dir, summarizer)
    expect(reloaded.list()).toMatchObject([{ id: record.id, app: 'Zoom', title: 'Entegrasyon görüşmesi', lineCount: 1, answerCount: 1, actionCount: 1 }])
    expect(reloaded.get(record.id)?.summary?.actions[0]).toEqual({ owner: 'Ben', text: 'SLA belgesini gönder' })
  })

  it('hiç konuşma olmayan toplantıyı saklamaz', () => {
    const dir = tempDir()
    const history = new MeetingHistory(dir, vi.fn())
    history.begin('Teams')
    history.end()
    expect(history.list()).toEqual([])
    expect(readdirSync(dir)).toEqual([])
  })

  it('uygulama toplantı sırasında kapandıysa kaydı korur ve yeniden özetlemeye açar', () => {
    const dir = tempDir()
    const crashed: MeetingRecord = {
      id: 'm1',
      app: null,
      startedAt: 1_000,
      endedAt: null,
      status: 'live',
      note: null,
      lines: [line('Merhaba', 5_000)],
      answers: [],
      summary: null
    }
    writeFileSync(join(dir, 'm1.json'), JSON.stringify(crashed))
    const history = new MeetingHistory(dir, vi.fn())
    expect(history.get('m1')).toMatchObject({ status: 'error', endedAt: 5_000 })
  })

  it('özet hatasında kaydı hata durumunda bırakır; yeniden özetlenebilir', async () => {
    const summarizer = vi.fn().mockRejectedValueOnce(new Error('API anahtarı yok')).mockResolvedValueOnce(SUMMARY)
    const history = new MeetingHistory(tempDir(), summarizer)
    const record = history.begin(null)
    history.addLine(line('Konuşma'))
    history.end()
    await vi.waitFor(() => expect(history.get(record.id)?.status).toBe('error'))
    expect(history.get(record.id)?.note).toContain('API anahtarı yok')
    await history.summarize(record.id)
    expect(history.get(record.id)).toMatchObject({ status: 'ready', note: null, summary: SUMMARY })
  })

  it('saklama süresi dolan toplantıları siler, süreni korur', () => {
    let now = 0
    const history = new MeetingHistory(tempDir(), vi.fn(async () => null), () => now)
    const old = history.begin(null)
    history.addLine(line('eski'))
    history.end()
    now = 40 * 24 * 60 * 60_000
    const live = history.begin(null)
    history.prune(30)
    expect(history.get(old.id)).toBeNull()
    expect(history.get(live.id)).not.toBeNull()
  })
})

describe('summarizeMeeting', () => {
  const record = (text: string): MeetingRecord => ({
    id: 'm',
    app: 'Zoom',
    startedAt: 0,
    endedAt: 1,
    status: 'summarizing',
    note: null,
    lines: [line(text)],
    answers: [],
    summary: null
  })

  it('kısa konuşmada model çağırmaz', async () => {
    const json = vi.fn()
    expect(await summarizeMeeting({ json } as unknown as LlmService, record('Merhaba, duyuyor musunuz?'), defaultSettings().product)).toBeNull()
    expect(json).not.toHaveBeenCalled()
  })

  it('transkripti konuşmacılarla gönderir ve özet amacıyla kaydeder', async () => {
    const json = vi.fn(async () => SUMMARY)
    const summary = await summarizeMeeting({ json } as unknown as LlmService, record('Rate limit konusu. '.repeat(40)), defaultSettings().product)
    expect(summary).toEqual(SUMMARY)
    const request = (json.mock.calls[0] as unknown as [{ purpose: string; messages: { content: string }[] }])[0]
    expect(request.purpose).toBe('summary')
    expect(request.messages[0]!.content).toContain('Elif: Rate limit konusu.')
    expect(request.messages[0]!.content).toContain('Toplantı uygulaması: Zoom')
  })

  it('çok uzun transkriptin başını ve sonunu korur', () => {
    const lines = Array.from({ length: 3_000 }, (_, i) => line(`cümle ${i} ${'x'.repeat(20)}`, i))
    const text = transcriptText({ ...record(''), lines })
    expect(text.length).toBeLessThan(61_000)
    expect(text).toContain('cümle 0 ')
    expect(text).toContain('cümle 2999 ')
    expect(text).toContain('kısaltıldı')
    expect(MIN_TRANSCRIPT_CHARS).toBeGreaterThan(0)
  })
})
