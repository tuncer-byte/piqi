import { motion, type Transition } from 'framer-motion'
import type { ReactNode } from 'react'
import { BRAND, MARK_CORE, MARK_DOTS } from '@shared/brand'

export type MarkState = 'idle' | 'listening' | 'thinking' | 'ready' | 'intro'
export type MarkTone = 'lime' | 'ink' | 'paper' | 'mono'

const TONES: Record<MarkTone, { ring: string; core: string; graded: boolean }> = {
  // Koyu zemin: lime, tepeden aşağı parlaklaşan.
  lime: { ring: BRAND.lime, core: BRAND.lime, graded: true },
  // Limon zemin: siyah noktalar.
  ink: { ring: BRAND.ink, core: BRAND.ink, graded: false },
  // Açık zemin: siyah halka, zeytin merkez.
  paper: { ring: BRAND.ink, core: BRAND.olive, graded: false },
  // Tek renk (metin rengini alır).
  mono: { ring: 'currentColor', core: 'currentColor', graded: true }
}

const IDLE_GRAY = '#8E9199'

/**
 * Animasyonlu Piqi simgesi. Durumlar tasarımdaki "canlı durumlar"dır:
 * boşta (gri, nefes alır) · dinliyor (halkada dalga dolaşır) · düşünüyor (parlaklık döner) · cevap hazır (merkez belirir).
 */
export function PiqiMark(props: {
  size?: number
  state?: MarkState
  tone?: MarkTone
  /** Menü çubuğundaki gibi köşede kırmızı "dinliyor" noktası. */
  live?: boolean
  className?: string
  title?: string
}): ReactNode {
  const { size = 24, state = 'idle', tone = 'lime', live = false } = props
  const palette = TONES[tone]
  const idle = state === 'idle'
  const ringColor = idle && tone === 'lime' ? IDLE_GRAY : palette.ring
  const coreColor = idle && tone === 'lime' ? IDLE_GRAY : palette.core

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={props.className}
      role={props.title ? 'img' : undefined}
      aria-label={props.title}
      aria-hidden={props.title ? undefined : true}
      style={{ overflow: 'visible' }}
    >
      {MARK_DOTS.map((dot, i) => {
        const base = palette.graded ? dot.opacity : 1
        return (
          <motion.circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill={ringColor}
            style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
            initial={state === 'intro' ? { scale: 0, opacity: 0, cx: 50, cy: 50 } : false}
            animate={ringAnimation(state, i, base, dot)}
            transition={ringTransition(state, i)}
          />
        )
      })}
      <motion.circle
        cx={MARK_CORE.x}
        cy={MARK_CORE.y}
        r={MARK_CORE.r}
        fill={coreColor}
        style={{ transformOrigin: '50px 50px' }}
        initial={state === 'intro' ? { scale: 0, opacity: 0 } : false}
        animate={coreAnimation(state)}
        transition={coreTransition(state)}
      />
      {live && <circle cx={92} cy={10} r={11} fill={BRAND.live} />}
    </svg>
  )
}

function ringAnimation(state: MarkState, i: number, base: number, dot: { x: number; y: number }) {
  switch (state) {
    case 'intro':
      return { scale: 1, opacity: base, cx: dot.x, cy: dot.y }
    case 'listening':
      return { scale: [1, 1.35, 1], opacity: [base * 0.75, 1, base * 0.75] }
    case 'thinking':
      return { opacity: [base * 0.35, 1, base * 0.35], scale: [0.9, 1.1, 0.9] }
    case 'ready':
      return { scale: 1, opacity: base }
    default:
      return { scale: [1, 0.92, 1], opacity: base * 0.8 }
  }
}

function ringTransition(state: MarkState, i: number): Transition {
  switch (state) {
    case 'intro':
      return { type: 'spring', stiffness: 260, damping: 18, delay: 0.08 + i * 0.06 }
    case 'listening':
      // Dalga saat yönünde dolaşır: her nokta bir öncekinden biraz sonra büyür.
      return { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }
    case 'thinking':
      return { duration: 0.96, repeat: Infinity, ease: 'linear', delay: i * 0.12 }
    case 'ready':
      return { duration: 0.3 }
    default:
      return { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
  }
}

function coreAnimation(state: MarkState) {
  switch (state) {
    case 'intro':
      return { scale: [0, 1.3, 1], opacity: 1 }
    case 'thinking':
      return { scale: [0.85, 1, 0.85], opacity: [0.6, 1, 0.6] }
    case 'ready':
      return { scale: [1, 1.35, 1], opacity: 1 }
    case 'listening':
      return { scale: 1, opacity: 1 }
    default:
      return { scale: [1, 0.94, 1], opacity: 0.9 }
  }
}

function coreTransition(state: MarkState): Transition {
  switch (state) {
    case 'intro':
      return { duration: 0.55, delay: 0.62, ease: 'easeOut' }
    case 'thinking':
      return { duration: 0.96, repeat: Infinity, ease: 'easeInOut' }
    case 'ready':
      return { duration: 0.5, ease: 'easeOut' }
    case 'listening':
      return { duration: 0.3 }
    default:
      return { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
  }
}

/** "piqi" kelime işareti (DM Sans, küçük harf). */
export function Wordmark({ size = 22, className = '' }: { size?: number; className?: string }): ReactNode {
  return (
    <span className={`font-sans font-bold leading-none tracking-[-0.04em] ${className}`} style={{ fontSize: size }}>
      piqi
    </span>
  )
}
