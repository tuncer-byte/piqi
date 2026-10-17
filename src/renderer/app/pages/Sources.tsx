import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import type { SourceKind, SourceRecord } from '@shared/knowledge'
import { useKnowledge } from '../../shared/hooks'
import { Upload } from '../../shared/icons'
import type { PageProps } from '../App'
import { AddSourceDialog } from '../sources/AddSourceDialog'
import { formatCount } from '../sources/common'
import { Badge, Button, Card, PageHeader } from '../ui'

const TILE: Record<SourceKind, string> = { files: 'DOK', code: 'KOD', web: 'WEB', confluence: 'CNF', notion: 'NOT', faq: 'SSS' }
const SOURCE_KIND_LABEL: Record<Exclude<SourceKind, 'faq'>, string> = {
  code: 'Kod depoları',
  files: 'Doküman kaynakları',
  web: 'Web kaynakları',
  confluence: 'Confluence',
  notion: 'Notion'
}
const SOURCE_KIND_COLOR: Record<Exclude<SourceKind, 'faq'>, string> = {
  code: '#4E9BC4',
  files: '#91A66A',
  web: '#D29B58',
  confluence: '#8B929D',
  notion: '#D47A63'
}

function ago(ts: number | null): string {
  if (!ts) return 'henüz senkron yok'
  const minutes = Math.round((Date.now() - ts) / 60_000)
  if (minutes < 1) return 'az önce'
  if (minutes < 60) return `${minutes} dk önce`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} sa önce` : `${Math.round(hours / 24)} gün önce`
}

export function SourcesPage({ settings }: PageProps): ReactNode {
  const product = settings.product
  const overview = useKnowledge()
  const [dialog, setDialog] = useState<{ kind?: SourceKind; paths?: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [faqCount, setFaqCount] = useState(0)
  const sources = overview?.sources ?? []
  const codeLines = sources.filter((source) => source.kind === 'code').reduce((sum, source) => sum + source.stats.lines, 0)
  const sourceKinds = (Object.keys(SOURCE_KIND_LABEL) as Exclude<SourceKind, 'faq'>[]).map((kind) => ({
    kind,
    count: sources.filter((source) => source.kind === kind).length
  }))

  useEffect(() => {
    void window.piqi.knowledge.faq().then((entries) => setFaqCount(entries.length))
  }, [overview])

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const paths = [...e.dataTransfer.files].map((f) => window.piqi.knowledge.pathForFile(f)).filter(Boolean)
    if (paths.length) setDialog({ kind: 'files', paths })
  }

  return (
    <div
      className="flex flex-col gap-[22px]"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <PageHeader
        title="Kaynaklar"
        subtitle={
          overview
            ? `${product.name} · ${overview.totals.sources} kaynak · ${overview.totals.chunks.toLocaleString('tr-TR')} parça · son senkron ${ago(overview.lastSyncAt)}`
            : product.name
        }
        actions={
          <>
            <Button disabled={!sources.length} onClick={() => sources.forEach((s) => window.piqi.knowledge.reindex(s.id))}>
              Yeniden indeksle
            </Button>
            <Button variant="primary" onClick={() => setDialog({})}>
              + Kaynak ekle
            </Button>
          </>
        }
      />

      <button
        type="button"
        onClick={() => setDialog({ kind: 'files' })}
        className={`flex h-[76px] items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed text-[14px] transition-colors ${
          dragging ? 'border-lime bg-lime/10 text-ink' : 'border-line-2 bg-fill-2 text-muted'
        }`}
      >
        <Upload size={18} />
        PDF, DOCX, PPTX, XLSX, MD, TXT, HTML, görsel dosyalarını veya bir kod klasörünü buraya sürükleyin
      </button>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-2.5">
          {sources.length === 0 ? (
            <EmptySources onAdd={(kind) => setDialog({ kind })} />
          ) : (
            <AnimatePresence initial={false}>
              {sources.map((s) => (
                <motion.div key={s.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <SourceCard source={s} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <FaqCard count={faqCount} onOpen={() => setDialog({ kind: 'faq' })} />
        </div>
        <SourceOverview sources={sources} totals={overview?.totals} codeLines={codeLines} kinds={sourceKinds} />
      </div>

      <AnimatePresence>
        {dialog && (
          <AddSourceDialog productName={product.name} initialKind={dialog.kind} initialPaths={dialog.paths} onClose={() => setDialog(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function SourceOverview(props: {
  sources: SourceRecord[]
  totals?: { sources: number; chunks: number; files: number }
  codeLines: number
  kinds: { kind: Exclude<SourceKind, 'faq'>; count: number }[]
}): ReactNode {
  const active = props.sources.filter((source) => source.status === 'indexing' || source.status === 'queued').length
  const errors = props.sources.filter((source) => source.status === 'error').length
  const total = props.sources.length

  return (
    <aside className="flex flex-col gap-3.5 xl:sticky xl:top-7">
      <Card tone="dark" className="overflow-hidden px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#A9ACB3]">Bilgi havuzu</div>
          <span className="rounded-full bg-panel-3 px-2.5 py-1 font-mono text-[11px] text-[#C6C8CE]">
            {props.totals?.sources ?? 0} kaynak
          </span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <OverviewMetric value={formatCount(props.totals?.files ?? 0)} label="dosya" />
          <OverviewMetric value={formatCount(props.codeLines)} label="kod satırı" />
          <OverviewMetric value={formatCount(props.totals?.chunks ?? 0)} label="parça" />
        </div>
        <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-[#292A2F]" aria-label="Kaynak türlerine göre dağılım">
          {props.kinds.map(({ kind, count }) =>
            count ? (
              <div
                key={kind}
                className="h-full min-w-[3px]"
                style={{ width: `${(count / Math.max(1, total)) * 100}%`, background: SOURCE_KIND_COLOR[kind] }}
              />
            ) : null
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2.5">
          {props.kinds.map(({ kind, count }) => (
            <div key={kind} className="flex items-center gap-2.5 text-[12.5px]">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SOURCE_KIND_COLOR[kind] }} />
              <span className="min-w-0 flex-1 truncate text-[#E6E6E8]">{SOURCE_KIND_LABEL[kind]}</span>
              <span className="w-7 text-right font-mono tabular-nums text-[#A9ACB3]">{count}</span>
              <span className="w-10 text-right font-mono tabular-nums text-[#777B84]">{Math.round((count / Math.max(1, total)) * 100)}%</span>
            </div>
          ))}
        </div>
      </Card>
      <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-card px-4 py-3 text-[12.5px]">
        <span className="text-muted">İndeks durumu</span>
        <span className="text-right font-semibold text-ink">
          {active > 0 && <span className="text-warn">{active} işleniyor</span>}
          {active > 0 && errors > 0 && ' · '}
          {errors > 0 && <span className="text-err">{errors} hata</span>}
          {active === 0 && errors === 0 && <span className="text-ok">Tümü güncel</span>}
        </span>
      </div>
    </aside>
  )
}

function OverviewMetric({ value, label }: { value: string; label: string }): ReactNode {
  return (
    <div className="min-w-0">
      <div className="truncate text-[25px] font-bold leading-none tabular-nums text-[#F4F4F2]">{value}</div>
      <div className="mt-2 truncate text-[12px] text-[#A9ACB3]">{label}</div>
    </div>
  )
}

function EmptySources({ onAdd }: { onAdd: (kind: SourceKind) => void }): ReactNode {
  const items: { kind: SourceKind; tile: string; title: string; text: string }[] = [
    { kind: 'code', tile: 'KOD', title: 'Kod reposu', text: 'Yerel klasör veya Git. Yapay zeka nerenin taranacağını önerir.' },
    { kind: 'files', tile: 'DOK', title: 'Dokümanlar', text: 'PDF, DOCX, PPTX, XLSX, MD ve görseller — sayfa atıflı cevaplar.' },
    { kind: 'confluence', tile: 'CNF', title: 'Confluence ve Notion', text: 'Space ve sayfalar, kullanıcıya özel jetonla.' },
    { kind: 'faq', tile: 'SSS', title: 'Onaylı cevaplar', text: 'Soru → cevap çiftleri; aramada en yüksek öncelik.' }
  ]
  return (
    <>
      {items.map((item) => (
        <button key={item.kind} type="button" onClick={() => onAdd(item.kind)} className="w-full border-0 bg-transparent p-0 text-left">
          <Card className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-line-2">
            <span className={`inline-flex size-10 items-center justify-center rounded-[10px] font-mono text-[11px] font-medium ${item.tile === 'SSS' ? 'bg-lime text-on-lime' : 'bg-fill'}`}>
              {item.tile}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-ink">{item.title}</div>
              <div className="mt-0.5 text-[12.5px] text-label">{item.text}</div>
            </div>
            <Badge>Ekle</Badge>
          </Card>
        </button>
      ))}
    </>
  )
}

function SourceCard({ source }: { source: SourceRecord }): ReactNode {
  const [confirm, setConfirm] = useState(false)
  const indexing = source.status === 'indexing' || source.status === 'queued'
  const s = source.stats
  const meta =
    source.kind === 'code'
      ? `${ago(source.lastIndexedAt)} senkronlandı`
      : source.kind === 'files'
        ? `${s.files} doküman · ${s.chunks.toLocaleString('tr-TR')} parça${s.pages ? ` · ${s.pages} sayfa` : ''}`
        : `${s.files} sayfa · ${s.chunks.toLocaleString('tr-TR')} parça`

  return (
    <Card tone={source.status === 'error' ? 'error' : 'default'} className="px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-fill font-mono text-[11px] font-medium">{TILE[source.kind]}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold" title={source.location}>
            {source.kind === 'code' ? source.location.replace(/^\/Users\/[^/]+/, '~') : source.name}
          </div>
          <div className={`mt-0.5 truncate text-[12.5px] ${source.status === 'error' ? 'text-err' : 'text-label'}`}>
            {source.status === 'error'
              ? `Hata: ${source.error}`
              : indexing
                ? source.stage
                : source.kind === 'code'
                  ? meta
                  : `${meta} · ${ago(source.lastIndexedAt)} senkronlandı`}
          </div>
        </div>
        {source.kind === 'code' && (source.status === 'ready' || s.files > 0) && (
          <div className="flex shrink-0 items-center gap-4">
            <SourceMetric value={formatCount(s.files)} label="dosya" />
            <SourceMetric value={formatCount(s.lines)} label="satır" />
            <SourceMetric value={formatCount(s.chunks)} label="parça" />
          </div>
        )}
        {indexing ? (
          <Badge tone="warn">{source.status === 'queued' ? 'Sırada' : `İndeksleniyor %${Math.round(source.progress * 100)}`}</Badge>
        ) : source.status === 'error' ? (
          <Button size="sm" onClick={() => window.piqi.knowledge.reindex(source.id)}>
            Yeniden dene
          </Button>
        ) : (
          <Badge tone="ok">Hazır</Badge>
        )}
      </div>
      {indexing && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-fill">
          <motion.div className="h-full rounded-full bg-[#8DB52F] dark:bg-lime" animate={{ width: `${Math.max(4, source.progress * 100)}%` }} transition={{ duration: 0.3 }} />
        </div>
      )}
      {source.warnings.length > 0 && !indexing && (
        <div className="mt-2.5 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-warn-ink">{source.warnings.join(' · ')}</div>
      )}
      {source.focus && !indexing && <div className="mt-2 truncate text-[12px] text-muted">Odak: {source.focus}</div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
        {(source.kind === 'code' || source.kind === 'files') && (
          <Pill active={source.watch} onClick={() => window.piqi.knowledge.update(source.id, { watch: !source.watch })}>
            {source.watch ? 'İzleniyor' : 'İzleme kapalı'}
          </Pill>
        )}
        <Pill active={source.priority} onClick={() => window.piqi.knowledge.update(source.id, { priority: !source.priority })}>
          {source.priority ? 'Öncelikli' : 'Normal öncelik'}
        </Pill>
        <div className="flex-1" />
        <button type="button" disabled={indexing} onClick={() => window.piqi.knowledge.reindex(source.id)} className="rounded-md border-0 bg-transparent px-2 py-1 font-semibold text-muted hover:bg-fill hover:text-ink disabled:opacity-40">
          Yeniden indeksle
        </button>
        {confirm ? (
          <>
            <button type="button" onClick={() => window.piqi.knowledge.remove(source.id)} className="rounded-md border-0 bg-live px-2 py-1 font-semibold text-white">
              Sil
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="rounded-md border-0 bg-transparent px-2 py-1 text-muted">
              Vazgeç
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="rounded-md border-0 bg-transparent px-2 py-1 font-semibold text-muted hover:bg-fill hover:text-err">
            Kaldır
          </button>
        )}
      </div>
    </Card>
  )
}

function SourceMetric({ value, label }: { value: string; label: string }): ReactNode {
  return (
    <div className="min-w-10 text-right">
      <div className="font-mono text-[13px] font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  )
}

function Pill(props: { active: boolean; onClick: () => void; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={`rounded-full border-0 px-2.5 py-1 font-semibold ${props.active ? 'bg-ok-bg text-ok' : 'bg-fill text-muted'}`}
    >
      {props.children}
    </button>
  )
}

function FaqCard({ count, onOpen }: { count: number; onOpen: () => void }): ReactNode {
  return (
    <button type="button" onClick={onOpen} className="w-full border-0 bg-transparent p-0 text-left">
      <Card className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:border-line-2">
        <span className="inline-flex size-10 items-center justify-center rounded-[10px] bg-lime font-mono text-[11px] font-medium text-on-lime">SSS</span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-ink">Onaylı cevaplar</div>
          <div className="mt-0.5 text-[12.5px] text-label">{count} soru → cevap · aramada en yüksek öncelik</div>
        </div>
        <Badge tone={count ? 'ok' : 'neutral'}>{count ? 'Hazır' : 'Ekle'}</Badge>
      </Card>
    </button>
  )
}


