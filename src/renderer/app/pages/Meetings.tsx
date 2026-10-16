import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { MeetingPeople, TranscriptEvent } from '@shared/types'
import { useCaptureStatus, usePeople } from '../../shared/hooks'
import { PiqiMark } from '../../shared/PiqiMark'
import type { PageProps } from '../App'
import { Badge, Button, Card, EmptyState, Label, PageHeader } from '../ui'

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
        subtitle={`${settings.product.name} · kayıtlı toplantı yok`}
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

      <EmptyState title="Toplantı geçmişi, özet ve aksiyonlar" milestone="M4">
        Her toplantının transkripti, soru/cevap zaman çizelgesi, otomatik özet ve aksiyon listesi burada olacak. Şimdilik canlı
        transkripti yukarıda görebilirsin.
      </EmptyState>
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

export function GapsPage({ settings }: PageProps): ReactNode {
  return (
    <>
      <PageHeader title="Doküman eksikleri" subtitle={`${settings.product.name} · cevaplanamayan sorular`} />
      <EmptyState title="Henüz eksik yok" milestone="M4">
        Toplantıda kaynakta karşılığı bulunamayan veya olumsuz geri bildirim alan sorular burada toplanır; her birine onaylı cevap yazıp SSS’ye
        ekleyebilirsin. Piqi böylece her toplantıda biraz daha iyi olur.
      </EmptyState>
    </>
  )
}
