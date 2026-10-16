import type { ReactNode } from 'react'
import type { DocCategory, FolderCategory } from '@shared/knowledge'
import { DOC_CATEGORY_LABEL, FOLDER_CATEGORY_LABEL } from '@shared/knowledge'
import { Check } from '../../shared/icons'
import { Button } from '../ui'

export const FOLDER_COLOR: Record<FolderCategory, string> = {
  kaynak: '#3B82F6',
  dokuman: '#A855F7',
  yapilandirma: '#D97706',
  test: '#9CA3AF',
  ci: '#EF4444',
  cikti: '#6B7280',
  diger: '#6B7280'
}

export const DOC_COLOR: Record<DocCategory, string> = {
  api: '#3B82F6',
  mimari: '#A855F7',
  fiyat: '#D97706',
  guvenlik: '#EF4444',
  sss: '#65A30D',
  genel: '#9CA3AF'
}

/** Tasarımdaki onay kutusu: koyu zeminde açık kutu, kilitliyken gri. */
export function Checkbox(props: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }): ReactNode {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
        props.disabled
          ? 'border-line bg-fill opacity-60'
          : props.checked
            ? 'border-ink bg-ink text-on-ink'
            : 'border-line-2 bg-card text-transparent hover:border-ink'
      }`}
    >
      {props.checked && <Check size={14} />}
    </button>
  )
}

/** Renkli noktalı kategori seçici (tasarımdaki "● Kaynak kod ⌄" hapı). */
export function CategorySelect<T extends string>(props: {
  value: T
  options: T[]
  labels: Record<T, string>
  colors: Record<T, string>
  onChange: (v: T) => void
  disabled?: boolean
}): ReactNode {
  return (
    <label className={`relative inline-flex h-8 items-center gap-2 rounded-lg bg-fill pl-3 pr-8 text-[12.5px] font-semibold ${props.disabled ? 'text-muted' : 'text-ink'}`}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: props.colors[props.value] }} />
      {props.labels[props.value]}
      <svg className="pointer-events-none absolute right-2.5" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select
        aria-label="Kategori"
        disabled={props.disabled}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {props.labels[o]}
          </option>
        ))}
      </select>
    </label>
  )
}

export const folderSelect = {
  labels: FOLDER_CATEGORY_LABEL,
  colors: FOLDER_COLOR,
  options: Object.keys(FOLDER_CATEGORY_LABEL) as FolderCategory[]
}

export const docSelect = {
  labels: DOC_CATEGORY_LABEL,
  colors: DOC_COLOR,
  options: Object.keys(DOC_CATEGORY_LABEL) as DocCategory[]
}

/** Pencerenin alt çubuğu: özet + İptal / Ekle ve indeksle. */
export function DialogFooter(props: {
  summary: ReactNode
  onCancel: () => void
  onSubmit: () => void
  canSubmit: boolean
  busy?: boolean
  submitLabel?: string
}): ReactNode {
  return (
    <div className="flex h-[66px] shrink-0 items-center justify-between gap-4 border-t border-line bg-bg px-7">
      <div className="min-w-0 truncate text-[14px] text-muted">{props.summary}</div>
      <div className="flex gap-2.5">
        <Button size="lg" onClick={props.onCancel}>
          İptal
        </Button>
        <Button size="lg" variant="primary" disabled={!props.canSubmit || props.busy} onClick={props.onSubmit}>
          {props.busy ? 'Ekleniyor…' : (props.submitLabel ?? 'Ekle ve indeksle')}
        </Button>
      </div>
    </div>
  )
}

export function formatCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `~${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}k`
  return n.toLocaleString('tr-TR')
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(5, Math.round(seconds / 5) * 5)} sn`
  return `${Math.round(seconds / 60)} dk`
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
}

/** Bölüm başlığı: "KLASÖRLER VE SINIFLANDIRMA". */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }): ReactNode {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-label">{children}</div>
      {right}
    </div>
  )
}
