import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { KnowledgeGap } from '@shared/knowledge'
import type { MeetingPeople, TranscriptEvent } from '@shared/types'
import { useCaptureStatus, usePeople } from '../../shared/hooks'
import { PiqiMark } from '../../shared/PiqiMark'
import type { PageProps } from '../App'
import { Badge, Button, Card, EmptyState, Label, PageHeader, TextField } from '../ui'

interface Line {
  key: string
  channel: TranscriptEvent['channel']
  text: string
  final: boolean
  t: number
  speaker?: number
}

/** Canlı transkript: her kanalın her segmenti tek satır; ara sonuçlar yerinde güncellenir. */
function useLiveTranscript(limit = 80): Line[] {
  const [lines, setLines] = useState<Line[]>([])
  useEffect(
    () =>
      window.piqi.capture.onTranscript((e) => {
        const key = `${e.channel}-${e.segment}`
        setLines((prev) => {
          const index = prev.findIndex((l) => l.key === key)
          const line = { key, channel: e.channel, text: e.text, final: e.final, t: e.t, speaker: e.speaker }
          if (index === -1) return [...prev, line].slice(-limit)
          const next = [...prev]
          next[index] = line
          return next
        })
      }),
    [limit]
  )
  return lines
}

export function MeetingsPage({ settings }: PageProps): ReactNode {
  const status = useCaptureStatus()
  const lines = useLiveTranscript()
  const people = usePeople()
  const speakerName = (id?: number): string => {
    if (id == null) return 'Karşı taraf'
    return people?.speakers.find((s) => s.id === id)?.name ?? `Konuşmacı ${id}`
  }
  const end = useRef<HTMLDivElement>(null)
  const listening = status?.state === 'running'

  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [lines])

  return (
    <>
      <PageHeader
        title="Toplantılar"
        subtitle={
          status?.detectedMeeting
            ? `${settings.product.name} · ${status.detectedMeeting} görüşmesi algılandı${status.meeting ? ', dinleniyor' : ''}`
            : `${settings.product.name} · ${settings.meetingDetection === 'off' ? 'toplantı algılama kapalı' : 'görüşme bekleniyor; Teams, Zoom ve diğerleri otomatik algılanır'}`
        }
        actions={
          <Button variant={listening ? 'secondary' : 'primary'} onClick={() => void (listening ? window.piqi.capture.stop() : window.piqi.capture.start())}>
            {listening ? 'Dinlemeyi durdur' : 'Dinlemeye başla'}
          </Button>
        }
      />

      {settings.speech.diarization && <PeopleCard people={people} listening={listening} />}

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <Label>Canlı transkript</Label>
          <div className="flex items-center gap-2">
            {status?.transcribing.map((c) => (
              <Badge key={c} tone="ok">
                {c === 'me' ? 'Ben' : 'Karşı taraf'}
              </Badge>
            ))}
            {!listening && <Badge>Kapalı</Badge>}
          </div>
        </div>
        <div className="max-h-[360px] min-h-[120px] overflow-y-auto">
          {lines.length === 0 ? (
            <div className="py-6 text-[14px] text-muted">
              {listening
                ? 'Konuşma bekleniyor… “Selam Piqi” diyerek de deneyebilirsin.'
                : 'Dinlemeyi başlattığında iki kanal cihaz üzerinde yazıya dökülür. Ses Mac’inden çıkmaz.'}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lines.map((l) => (
                <div key={l.key} className="flex items-baseline gap-3 text-[14px] leading-normal">
                  <span className="w-12 shrink-0 font-mono text-[11.5px] text-label">
                    {new Date(l.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`w-[104px] shrink-0 truncate text-[12.5px] font-semibold ${l.channel === 'me' ? 'text-ink' : 'text-muted'}`}>
                    {l.channel === 'me' ? 'Ben' : speakerName(l.speaker)}
                  </span>
                  <span className={`selectable min-w-0 flex-1 ${l.final ? '' : 'text-muted'}`}>{l.text}</span>
                </div>
              ))}
              <div ref={end} />
            </div>
          )}
        </div>
      </Card>

    </>
  )
}

/** Toplantıdaki kişiler: kaç farklı kişi konuştu, ne kadar; isim verilebilir. */
function PeopleCard({ people, listening }: { people: MeetingPeople | null; listening: boolean }): ReactNode {
  const speakers = people?.speakers ?? []
  const status = people?.status ?? 'off'
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Label>Kişiler</Label>
          {speakers.length > 0 && <Badge tone="lime">{speakers.length} kişi konuştu</Badge>}
        </div>
        <span className="text-[12px] text-muted">
          {status === 'loading'
            ? 'Konuşmacı modeli hazırlanıyor…'
            : status === 'error'
              ? `Konuşmacı ayrımı çalışmıyor: ${people?.error ?? ''}`
              : 'Ses izi saklanmaz · toplantı bitince silinir'}
        </span>
      </div>
      {speakers.length === 0 ? (
        <div className="flex items-center gap-3 py-2 text-[14px] text-muted">
          <PiqiMark size={22} tone="mono" state={listening && status === 'ready' ? 'listening' : 'idle'} className="text-muted" />
          {listening
            ? 'Karşı taraf konuştukça farklı kişiler burada belirir. Tanımadığın kişiler de “Konuşmacı N” olarak ayrılır.'
            : 'Dinleme başlayınca toplantıdaki farklı kişiler burada listelenir.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {speakers.map((s) => (
            <SpeakerRow key={`${s.id}-${s.name ?? ''}`} id={s.id} name={s.name} talkSeconds={s.talkSeconds} recent={Date.now() - s.lastHeardAt < 4000} />
          ))}
        </div>
      )}
    </Card>
  )
}

function SpeakerRow(props: { id: number; name: string | null; talkSeconds: number; recent: boolean }): ReactNode {
  const [value, setValue] = useState(props.name ?? '')
  const minutes = Math.floor(props.talkSeconds / 60)
  const seconds = props.talkSeconds % 60
  return (
    <div className="flex items-center gap-3 rounded-xl bg-fill-2 px-3.5 py-2.5">
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold ${
          props.recent ? 'bg-lime text-on-lime' : 'bg-fill text-ink'
        }`}
      >
        {props.name ? props.name.slice(0, 1).toLocaleUpperCase('tr-TR') : props.id}
      </span>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Konuşmacı {props.id} adı</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => window.piqi.people.rename(props.id, value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={`Konuşmacı ${props.id} · isim ver`}
          className="selectable w-full border-0 bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted"
        />
      </label>
      <span className="shrink-0 font-mono text-[11.5px] text-label">
        {minutes > 0 ? `${minutes} dk ` : ''}
        {seconds} sn
      </span>
    </div>
  )
}

const GAP_REASON: Record<KnowledgeGap['reason'], { label: string; tone: 'warn' | 'err' | 'neutral' }> = {
  'no-source': { label: 'Kaynakta yok', tone: 'warn' },
  general: { label: 'Kaynaksız cevaplandı', tone: 'neutral' },
  negative: { label: 'Olumsuz geri bildirim', tone: 'err' }
}

function ago(t: number): string {
  const minutes = Math.round((Date.now() - t) / 60_000)
  if (minutes < 1) return 'az önce'
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} sa önce` : `${Math.round(hours / 24)} gün önce`
}

function useGaps(): KnowledgeGap[] | null {
  const [gaps, setGaps] = useState<KnowledgeGap[] | null>(null)
  useEffect(() => {
    void window.piqi.knowledge.gaps().then(setGaps)
    return window.piqi.knowledge.onGapsChange(setGaps)
  }, [])
  return gaps
}

export function GapsPage({ settings }: PageProps): ReactNode {
  const gaps = useGaps()
  const total = gaps?.reduce((n, g) => n + g.count, 0) ?? 0
  return (
    <>
      <PageHeader
        title="Doküman eksikleri"
        subtitle={`${settings.product.name} · ${gaps?.length ? `${gaps.length} soru · toplam ${total} kez soruldu` : 'cevaplanamayan sorular'}`}
      />
      {gaps && gaps.length === 0 && (
        <EmptyState title="Henüz eksik yok">
          Toplantıda kaynakta karşılığı bulunamayan, kaynaksız cevaplanan veya olumsuz geri bildirim alan sorular burada toplanır. Her birine onaylı cevap yazıp
          SSS’ye eklediğinde, aynı soru bir dahaki sefere model çağrılmadan anında cevaplanır.
        </EmptyState>
      )}
      {gaps && gaps.length > 0 && (
        <div className="flex flex-col gap-3">
          {gaps.map((gap) => (
            <GapRow key={gap.id} gap={gap} />
          ))}
        </div>
      )}
    </>
  )
}

function GapRow({ gap }: { gap: KnowledgeGap }): ReactNode {
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const reason = GAP_REASON[gap.reason]
  const save = async (): Promise<void> => {
    if (!answer.trim()) return
    setBusy(true)
    // Kaydedilince main eksikten düşürür ve liste kendiliğinden güncellenir.
    await window.piqi.knowledge.saveFaq({ question: gap.question, answer: answer.trim() }).finally(() => setBusy(false))
  }
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[15.5px] font-semibold leading-snug">“{gap.question}”</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <Badge tone={reason.tone}>{reason.label}</Badge>
            <span>{gap.askedBy}</span>
            <span>·</span>
            <span>{ago(gap.lastAt)}</span>
            {gap.count > 1 && (
              <>
                <span>·</span>
                <span className="font-semibold text-ink-2">{gap.count} kez soruldu</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {!open && (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              Cevap yaz
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void window.piqi.knowledge.removeGap(gap.id)}>
            Yoksay
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <TextField
            label="Onaylı cevap"
            multiline
            value={answer}
            onChange={setAnswer}
            placeholder="Müşteriye söyleyeceğin doğrulanmış cevap. Kısa ve kesin tut; ilk cümle Island’da büyük gösterilir."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button size="sm" variant="lime" disabled={!answer.trim() || busy} onClick={() => void save()}>
              SSS’ye ekle
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
