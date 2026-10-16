import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { DocCategory, FileScan } from '@shared/knowledge'
import { DOC_CATEGORY_LABEL } from '@shared/knowledge'
import { Upload } from '../../shared/icons'
import { Button, Switch } from '../ui'
import type { PanelProps } from './AddSourceDialog'
import { Checkbox, CategorySelect, DialogFooter, docSelect, formatDuration, sizeLabel } from './common'

interface Row extends FileScan {
  selected: boolean
  loading: boolean
}

export function FilesPanel({ close, initialPaths }: PanelProps): ReactNode {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<DocCategory | 'all'>('all')
  const [watch, setWatch] = useState(true)
  const [priority, setPriority] = useState(false)
  const [language, setLanguage] = useState<'auto' | 'tr' | 'en'>('auto')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [roots, setRoots] = useState<string[]>([])

  const addPaths = async (paths: string[]): Promise<void> => {
    if (!paths.length) return
    setRoots((r) => [...new Set([...r, ...paths])])
    const placeholders: Row[] = paths.map((path) => ({
      path,
      name: path.split('/').pop() ?? path,
      ext: (path.split('.').pop() ?? '').toLowerCase(),
      sizeBytes: 0,
      pages: null,
      pageLabel: '',
      category: 'genel',
      tags: [],
      status: 'ok',
      message: 'Okunuyor…',
      chunks: 0,
      selected: true,
      loading: true
    }))
    setRows((r) => [...r.filter((x) => !paths.includes(x.path)), ...placeholders])
    const scanned = await window.piqi.knowledge.scanFiles(paths)
    setRows((r) => {
      const others = r.filter((x) => !paths.includes(x.path) && !scanned.some((s) => s.path === x.path))
      return [...others, ...scanned.map((s) => ({ ...s, selected: s.status !== 'error', loading: false }))]
    })
  }

  useEffect(() => {
    if (initialPaths?.length) void addPaths(initialPaths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    void addPaths([...e.dataTransfer.files].map((f) => window.piqi.knowledge.pathForFile(f)).filter(Boolean))
  }

  const counts = useMemo(() => {
    const c = new Map<DocCategory, number>()
    for (const r of rows) if (!r.loading) c.set(r.category, (c.get(r.category) ?? 0) + 1)
    return c
  }, [rows])
  const visible = rows.filter((r) => filter === 'all' || r.category === filter)
  const selected = rows.filter((r) => r.selected && !r.loading)
  const chunks = selected.reduce((n, r) => n + r.chunks, 0)
  const setRow = (path: string, patch: Partial<Row>): void => setRows((rs) => rs.map((r) => (r.path === path ? { ...r, ...patch } : r)))

  const submit = async (): Promise<void> => {
    setBusy(true)
    const paths = selected.map((r) => r.path)
    const name = paths.length === 1 ? selected[0]!.name : roots.length === 1 && !roots[0]!.includes('.') ? roots[0]!.split('/').pop()! : `${paths.length} doküman`
    await window.piqi.knowledge.add({
      kind: 'files',
      name,
      location: roots.length === 1 ? roots[0]! : `${paths.length} dosya`,
      config: {
        kind: 'files',
        files: {
          paths,
          categories: Object.fromEntries(selected.map((r) => [r.path, r.category])),
          tags: Object.fromEntries(selected.map((r) => [r.path, r.tags])),
          language
        }
      },
      note: '',
      focus: '',
      watch,
      priority
    })
    close()
  }

  return (
    <>
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-2 py-2">
        <div className="flex gap-4">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex h-[104px] flex-1 items-center justify-center gap-5 rounded-[14px] border-[1.5px] border-dashed transition-colors ${
              dragging ? 'border-lime bg-lime/10' : 'border-line-2 bg-transparent'
            }`}
          >
            <Upload size={26} className="text-ink-2" />
            <div>
              <div className="text-[15px] font-bold">Dosyaları veya klasörü buraya bırakın</div>
              <div className="mt-1 text-[13px] text-muted">PDF, DOCX, PPTX, XLSX, MD, TXT, HTML · her dosya türüne göre otomatik sınıflanır</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="lg" className="h-10 px-4" onClick={() => void window.piqi.knowledge.pick('files').then(addPaths)}>
              Dosya seç
            </Button>
            <Button size="lg" className="h-10 px-4" onClick={() => void window.piqi.knowledge.pick('folder').then(addPaths)}>
              Klasör seç
            </Button>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2.5">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Tümü" count={rows.length} />
              {[...counts.entries()].map(([category, n]) => (
                <FilterChip key={category} active={filter === category} onClick={() => setFilter(category)} label={DOC_CATEGORY_LABEL[category]} count={n} />
              ))}
              <div className="flex-1" />
              <label className="relative inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-2 bg-card px-3 text-[13px] font-semibold">
                Seçililere kategori ata
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
                <select
                  aria-label="Seçililere kategori ata"
                  value=""
                  onChange={(e) => {
                    const category = e.target.value as DocCategory
                    if (category) setRows((rs) => rs.map((r) => (r.selected ? { ...r, category } : r)))
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="">—</option>
                  {docSelect.options.map((o) => (
                    <option key={o} value={o}>
                      {DOC_CATEGORY_LABEL[o]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-line">
              <div className="grid grid-cols-[32px_40px_minmax(0,1fr)_auto_190px_140px] items-center gap-3 border-b border-line bg-fill-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-label">
                <span />
                <span />
                <span>Dosya</span>
                <span className="text-right">Etiket</span>
                <span>Kategori (otomatik)</span>
                <span className="text-right">Durum</span>
              </div>
              {visible.map((r) => (
                <div
                  key={r.path}
                  className="grid grid-cols-[32px_40px_minmax(0,1fr)_auto_190px_140px] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
                >
                  <Checkbox label={r.name} checked={r.selected} disabled={r.loading} onChange={(selected) => setRow(r.path, { selected })} />
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-fill font-mono text-[10px] font-medium uppercase">
                    {r.ext.slice(0, 4)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" title={r.path}>
                      {r.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {r.loading ? '…' : [r.pageLabel !== sizeLabel(r.sizeBytes) ? r.pageLabel : '', sizeLabel(r.sizeBytes)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex justify-end gap-1.5">
                    {r.tags.map((t) => (
                      <span key={t} className="rounded-md border border-line-2 px-2 py-0.5 font-mono text-[12.5px] text-ink-2">
                        {t}
                      </span>
                    ))}
                  </div>
                  <CategorySelect {...docSelect} value={r.category} disabled={r.loading} onChange={(category) => setRow(r.path, { category })} />
                  <span
                    className={`truncate text-right text-[14px] font-semibold ${
                      r.loading ? 'text-muted' : r.status === 'ok' ? 'text-ok' : 'text-err'
                    }`}
                    title={r.message}
                  >
                    {r.loading ? 'Okunuyor…' : r.status === 'ok' ? 'Okundu' : r.message}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-8">
              <label className="flex items-center gap-2.5 text-[13.5px]">
                <Switch compact label="Değişiklikleri izle" checked={watch} onChange={setWatch} />
                Değişiklikleri izle
              </label>
              <label className="flex items-center gap-2.5 text-[13.5px]">
                <Switch compact label="Aramada öncelik ver" checked={priority} onChange={setPriority} />
                Aramada öncelik ver
              </label>
              <div className="flex-1" />
              <label className="flex items-center gap-2.5 text-[13.5px] text-muted">
                Dil:
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'auto' | 'tr' | 'en')}
                  className="h-9 rounded-[10px] border border-line-2 bg-card px-3 text-[13px] font-semibold text-ink outline-none"
                >
                  <option value="auto">Otomatik TR / EN</option>
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
          </>
        )}
      </div>
      <DialogFooter
        summary={
          selected.length ? (
            <>
              <b className="text-ink">{selected.length} dosya</b> seçili · yaklaşık {chunks} parça · tahmini {formatDuration(selected.length * 1.5 + chunks / 40)}
            </>
          ) : (
            'Dosya veya klasör seçin'
          )
        }
        canSubmit={selected.length > 0}
        busy={busy}
        onCancel={close}
        onSubmit={() => void submit()}
      />
    </>
  )
}

function FilterChip(props: { active: boolean; label: string; count: number; onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${
        props.active ? 'bg-ink text-on-ink' : 'border border-line-2 bg-transparent text-ink'
      }`}
    >
      {props.label}
      <span className={props.active ? 'opacity-60' : 'text-muted'}>{props.count}</span>
    </button>
  )
}
