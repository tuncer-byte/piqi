import { useEffect, useState, type ReactNode } from 'react'
import type { MeetingListItem, MeetingRecord, MeetingSummary } from '@shared/meetings'
import { ArrowLeft } from '../../shared/icons'
import { Badge, Button, Card, EmptyState, Label } from '../ui'

const STATUS: Record<MeetingListItem['status'], { label: string; tone: 'ok' | 'warn' | 'neutral' | 'err' | 'lime' }> = {
  live: { label: 'Kaydediliyor', tone: 'lime' },
  summarizing: { label: 'Özetleniyor', tone: 'neutral' },
  ready: { label: 'Hazır', tone: 'ok' },
  error: { label: 'Özet yok', tone: 'warn' }
}

const dateLabel = (t: number): string =>
  new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' })

function duration(start: number, end: number | null): string {
  const minutes = Math.max(1, Math.round(((end ?? Date.now()) - start) / 60_000))
  return minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`
}

const fallbackTitle = (m: Pick<MeetingListItem, 'app' | 'startedAt'>): string =>
  `${m.app ? `${m.app} görüşmesi` : 'Toplantı'} · ${new Date(m.startedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`

export function useMeetings(): MeetingListItem[] | null {
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null)
  useEffect(() => {
    void window.piqi.meetings.list().then(setMeetings)
    return window.piqi.meetings.onChange(setMeetings)
  }, [])
  return meetings
}

export function MeetingHistoryList(props: { meetings: MeetingListItem[] | null; enabled: boolean; onOpen: (id: string) => void }): ReactNode {
  const { meetings } = props
  if (!meetings) return null
  if (meetings.length === 0) {
    return (
      <EmptyState title="Henüz kayıtlı toplantı yok">
        {props.enabled
          ? 'Dinleme açıkken yapılan her toplantının transkripti ve Piqi’nin cevapları burada saklanır; toplantı bitince özet, kararlar, aksiyonlar ve takip e-postası taslağı hazırlanır.'
          : 'Toplantı geçmişi kapalı. Ayarlar → Gizlilik ve uyum’dan açabilirsin.'}
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <Label>Geçmiş toplantılar</Label>
      {meetings.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => props.onOpen(m.id)}
          className="rounded-[14px] border border-line bg-card px-5 py-4 text-left transition-colors hover:bg-fill-2"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-[15.5px] font-semibold">{m.title ?? fallbackTitle(m)}</div>
              <div className="mt-1 text-[12.5px] text-muted">
                {dateLabel(m.startedAt)} · {duration(m.startedAt, m.endedAt)}
                {m.app ? ` · ${m.app}` : ''} · {m.lineCount} cümle
                {m.answerCount > 0 ? ` · ${m.answerCount} cevap` : ''}
                {m.actionCount > 0 ? ` · ${m.actionCount} aksiyon` : ''}
              </div>
              {m.overview && <div className="mt-2 line-clamp-2 text-[13.5px] leading-normal text-ink-2">{m.overview}</div>}
            </div>
            <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
          </div>
        </button>
      ))}
    </div>
  )
}

/** Panoya kopyalanacak düz metin özet. */
export function summaryText(record: MeetingRecord, summary: MeetingSummary): string {
  const list = (title: string, items: string[]): string => (items.length ? `\n\n${title}\n${items.map((i) => `- ${i}`).join('\n')}` : '')
  return (
    `${summary.title}\n${dateLabel(record.startedAt)}\n\n${summary.overview}` +
    list('Kararlar', summary.decisions) +
    list('Aksiyonlar', summary.actions.map((a) => (a.owner ? `${a.owner}: ${a.text}` : a.text))) +
    list('Açık sorular', summary.openQuestions)
  )
}

export function MeetingDetail(props: { id: string; onBack: () => void }): ReactNode {
  const [record, setRecord] = useState<MeetingRecord | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    const load = (): void => void window.piqi.meetings.get(props.id).then(setRecord)
    load()
    return window.piqi.meetings.onChange(load)
  }, [props.id])

  const copy = (key: string, text: string): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 1_500)
    })
  }

  if (!record) return null
  const summary = record.summary
  const status = STATUS[record.status]

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={props.onBack}
            className="mb-2 flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft size={14} /> Toplantılar
          </button>
          <h1 className="m-0 text-[26px] font-bold tracking-[-0.02em]">{summary?.title ?? fallbackTitle(record)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
            <span>
              {dateLabel(record.startedAt)} · {duration(record.startedAt, record.endedAt)}
              {record.app ? ` · ${record.app}` : ''}
            </span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {summary && (
            <Button size="sm" onClick={() => copy('summary', summaryText(record, summary))}>
              {copied === 'summary' ? 'Kopyalandı' : 'Özeti kopyala'}
            </Button>
          )}
          {record.status !== 'live' && (
            <Button size="sm" disabled={record.status === 'summarizing'} onClick={() => window.piqi.meetings.resummarize(record.id)}>
              {summary ? 'Yeniden özetle' : 'Özetle'}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={record.status === 'live'}
            onClick={() => void window.piqi.meetings.remove(record.id).then(props.onBack)}
          >
            Sil
          </Button>
        </div>
      </div>

      {record.status === 'summarizing' && <Card className="px-5 py-4 text-[14px] text-muted">Özet hazırlanıyor…</Card>}
      {record.note && <Card className="px-5 py-4 text-[14px] text-muted">{record.note}</Card>}

      {summary && (
        <Card className="flex flex-col gap-5 px-6 py-5">
          <p className="m-0 text-[15px] leading-relaxed">{summary.overview}</p>
          <Section title="Kararlar" items={summary.decisions} />
          <Section title="Aksiyonlar" items={summary.actions.map((a) => (a.owner ? `${a.owner}: ${a.text}` : a.text))} />
          <Section title="Açık sorular" items={summary.openQuestions} />
        </Card>
      )}

      {summary?.followUpEmail && (
        <Card className="flex flex-col gap-3 px-6 py-5">
          <div className="flex items-center justify-between">
            <Label>Takip e-postası taslağı</Label>
            <Button size="sm" onClick={() => copy('email', summary.followUpEmail)}>
              {copied === 'email' ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
          <div className="selectable whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{summary.followUpEmail}</div>
        </Card>
      )}

      {record.answers.length > 0 && (
        <Card className="flex flex-col gap-3 px-6 py-5">
          <Label>Piqi’nin cevapları</Label>
          {record.answers.map((a, i) => (
            <div key={i} className={i ? 'border-t border-line pt-3' : ''}>
              <div className="text-[12.5px] text-muted">
                {new Date(a.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {a.askedBy} sordu
              </div>
              <div className="mt-0.5 text-[14.5px] font-semibold">{a.question}</div>
              <div className="selectable mt-1 whitespace-pre-wrap text-[14px] leading-normal text-ink-2">{a.answer}</div>
              {a.sources.length > 0 && <div className="mt-1 font-mono text-[11.5px] text-label">{a.sources.map((s) => s.label).join(' · ')}</div>}
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-3 px-6 py-5">
        <div className="flex items-center justify-between">
          <Label>Transkript · {record.lines.length} cümle</Label>
          <Button size="sm" variant="ghost" onClick={() => setShowTranscript(!showTranscript)}>
            {showTranscript ? 'Gizle' : 'Göster'}
          </Button>
        </div>
        {showTranscript && (
          <div className="selectable flex max-h-[480px] flex-col gap-2 overflow-y-auto">
            {record.lines.map((l, i) => (
              <div key={i} className="flex items-baseline gap-3 text-[14px] leading-normal">
                <span className="w-12 shrink-0 font-mono text-[11.5px] text-label">
                  {new Date(l.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`w-[104px] shrink-0 truncate text-[12.5px] font-semibold ${l.channel === 'me' ? 'text-ink' : 'text-muted'}`}>{l.speaker}</span>
                <span className="min-w-0 flex-1">{l.text}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

function Section({ title, items }: { title: string; items: string[] }): ReactNode {
  if (!items.length) return null
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-bold">{title}</div>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-normal text-ink-2">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
