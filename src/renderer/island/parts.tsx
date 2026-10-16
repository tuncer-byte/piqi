import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { AudioLevels, Confidence } from '@shared/types'
import { PiqiMark, type MarkState } from '../shared/PiqiMark'

export const act = (...args: Parameters<typeof window.piqi.island.action>): void => window.piqi.island.action(...args)

export const CONFIDENCE: Record<Confidence, { label: string; bg: string; fg: string; dot: string }> = {
  grounded: { label: 'Kaynaktan', bg: 'rgba(74,222,128,0.14)', fg: '#6EE79A', dot: '#4ADE80' },
  partial: { label: 'Kısmen kaynaktan', bg: 'rgba(250,204,21,0.14)', fg: '#F0C94A', dot: '#FACC15' },
  general: { label: 'Genel bilgi, kaynakta yok', bg: 'rgba(156,163,175,0.16)', fg: '#B4BAC4', dot: '#9CA3AF' }
}

export function Chip(props: { bg: string; fg: string; dot: string; children: ReactNode }): ReactNode {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: props.bg, color: props.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: props.dot }} />
      {props.children}
    </span>
  )
}

/** Island içindeki koyu, hap biçimli buton. */
export function PillButton(props: {
  onClick: () => void
  children: ReactNode
  label?: string
  variant?: 'dark' | 'lime'
  disabled?: boolean
  title?: string
}): ReactNode {
  const lime = props.variant === 'lime'
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-2xl border-0 px-3 text-[12px] font-semibold transition-opacity disabled:opacity-40 ${
        lime ? 'bg-lime px-3.5 text-[12.5px] font-bold text-on-lime hover:opacity-90' : 'bg-island-btn text-[#D7D9DE] hover:bg-[#2A2B30]'
      }`}
    >
      {props.children}
    </button>
  )
}

export function RoundButton(props: { onClick: () => void; label: string; active?: boolean; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      className={`inline-flex size-8 items-center justify-center rounded-full border-0 transition-colors ${
        props.active ? 'bg-[#2D3220] text-lime' : 'bg-island-btn text-[#D7D9DE] hover:bg-[#2A2B30]'
      }`}
    >
      {props.children}
    </button>
  )
}

export function GhostIcon(props: { onClick: () => void; label: string; active?: boolean; disabled?: boolean; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`inline-flex size-6 items-center justify-center border-0 bg-transparent disabled:opacity-30 ${
        props.active ? 'text-lime' : 'text-[#7B7E86] hover:text-[#D7D9DE]'
      }`}
    >
      {props.children}
    </button>
  )
}

/** Canlı Piqi simgesi ve ürün/karakter adı (Island sol kanadı). */
export function ProductTag(props: { name: string; live: boolean; state: MarkState }): ReactNode {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-[#C9CBD0]">
      <PiqiMark size={16} state={props.state} tone="lime" live={props.live} className="shrink-0" />
      <span className="truncate">{props.name}</span>
    </div>
  )
}

/** Lime ses dalgası; karşı taraf seviyesi ana çubukları, kullanıcı seviyesi ilk çubuğu sürer. */
export function LevelBars({ levels, source = 'them' }: { levels: AudioLevels; source?: 'them' | 'me' }): ReactNode {
  const weights = [0.35, 0.7, 1, 0.55, 0.8, 0.4]
  const level = source === 'me' ? levels.me : Math.max(levels.them, levels.me * 0.6)
  return (
    <span className="inline-flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {weights.map((w, i) => (
        <motion.i
          key={i}
          className="block w-[2px] rounded-[1px] bg-lime"
          animate={{ height: 3 + Math.min(1, level * w * 1.5) * 11 }}
          transition={{ duration: 0.08 }}
        />
      ))}
    </span>
  )
}

export function Shimmer({ label }: { label: string }): ReactNode {
  return (
    <div className="flex items-center gap-3">
      <motion.span
        className="size-2.5 shrink-0 rounded-full bg-lime"
        style={{ boxShadow: '0 0 0 5px rgba(200,241,105,0.18)' }}
        animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-lime/50 to-transparent"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <span className="shrink-0 font-mono text-[11px] text-[#7B7E86]">{label}</span>
    </div>
  )
}

export function Caret(): ReactNode {
  return (
    <motion.span
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-lime"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.9, repeat: Infinity }}
    />
  )
}

export function SectionLabel({ children }: { children: ReactNode }): ReactNode {
  return <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B7E86]">{children}</div>
}

export function Divider(): ReactNode {
  return <div className="h-px bg-island-line" />
}

export function formatLatency(ms: number): string {
  return `${(ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} sn`
}
