import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Ana pencerenin ortak bileşenleri — ölçü ve renkler Claude Design canvas'ından (PRD §6.0).

type ButtonVariant = 'primary' | 'secondary' | 'lime' | 'ghost'

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }): ReactNode {
  const sizes = { sm: 'h-8 px-3 text-[12.5px] rounded-lg', md: 'h-10 px-4 text-[14px] rounded-[10px]', lg: 'h-11 px-6 text-[14px] rounded-[10px]' }
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-ink text-on-ink border-0 hover:opacity-90',
    secondary: 'bg-card text-ink border border-line-2 hover:bg-fill-2',
    lime: 'bg-lime text-on-lime border-0 font-bold hover:opacity-90',
    ghost: 'bg-transparent text-ink-2 border-0 hover:bg-fill'
  }
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Card(props: { children: ReactNode; className?: string; tone?: 'default' | 'dark' | 'error' | 'selected' }): ReactNode {
  const tones = {
    default: 'bg-card border border-line',
    dark: 'bg-panel text-[#F2F2F0] border border-transparent',
    error: 'bg-card border border-err-line',
    selected: 'bg-card border-[1.5px] border-ink'
  }
  return <section className={`rounded-[14px] ${tones[props.tone ?? 'default']} ${props.className ?? ''}`}>{props.children}</section>
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={`text-[12px] font-semibold uppercase tracking-[0.08em] text-label ${className}`}>{children}</div>
}

export function PageHeader(props: { title: string; subtitle?: ReactNode; actions?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{props.title}</h1>
        {props.subtitle && <div className="mt-1 text-[14px] text-muted">{props.subtitle}</div>}
      </div>
      {props.actions && <div className="flex gap-2">{props.actions}</div>}
    </div>
  )
}

type BadgeTone = 'ok' | 'warn' | 'neutral' | 'lime' | 'err'

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }): ReactNode {
  const tones: Record<BadgeTone, string> = {
    ok: 'bg-ok-bg text-ok',
    warn: 'bg-warn-bg text-warn',
    neutral: 'bg-badge text-ink-2',
    lime: 'bg-lime text-on-lime',
    err: 'bg-err-bg text-err'
  }
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${tones[tone]}`}>{children}</span>
}

export function Switch(props: { checked: boolean; onChange: (value: boolean) => void; label: string; dark?: boolean; compact?: boolean }): ReactNode {
  const trackSize = props.compact ? 'h-6 w-10 rounded-xl' : 'h-[30px] w-[52px] rounded-[15px]'
  const thumbSize = props.compact ? 'size-[18px]' : 'size-6'
  const activePosition = props.compact ? 'translate-x-4' : 'translate-x-[22px]'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      className={`relative ${trackSize} shrink-0 border-0 transition-colors ${
        props.checked ? 'bg-ink dark:bg-[#526B26]' : props.dark ? 'bg-[#3A3B41]' : 'bg-line-2'
      } ${props.dark && props.checked ? '!bg-[#F2F2F0]' : ''}`}
    >
      <span
        className={`absolute left-[3px] top-[3px] ${thumbSize} rounded-full transition-transform ${
          props.checked ? `${activePosition} bg-lime` : 'translate-x-0 bg-[#F2F2F0]'
        }`}
      />
    </button>
  )
}

/** Başlık + açıklama + sağda kontrol: ayar satırı. */
export function SettingRow(props: { title: ReactNode; description?: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-5">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold">{props.title}</div>
        {props.description && <div className="mt-1 text-[13.5px] leading-normal text-muted">{props.description}</div>}
      </div>
      {props.children}
    </div>
  )
}

export function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }): ReactNode {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`h-10 rounded-[10px] px-4 text-[14px] font-semibold ${
            props.value === o.value ? 'border border-ink bg-ink text-on-ink' : 'border border-line-2 bg-card text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TextField(props: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  mono?: boolean
  type?: string
}): ReactNode {
  const common = `selectable w-full rounded-[10px] border border-line-2 bg-card px-3 text-[14px] text-ink outline-none focus:border-ink ${
    props.mono ? 'font-mono text-[13px]' : ''
  }`
  return (
    <label className="block">
      <div className="mb-1.5 text-[12.5px] text-muted">{props.label}</div>
      {props.multiline ? (
        <textarea
          className={`${common} min-h-[64px] resize-y py-2.5 leading-normal`}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          className={`${common} h-[42px]`}
          type={props.type ?? 'text'}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          spellCheck={false}
        />
      )}
    </label>
  )
}

/** Dosya türü / avatar kutusu (PDF, KOD, SSS, AG …). */
export function Tile(props: { children: ReactNode; tone?: 'fill' | 'lime' | 'dark'; size?: number }): ReactNode {
  const tones = { fill: 'bg-fill text-ink', lime: 'bg-lime text-on-lime', dark: 'bg-ink text-lime' }
  const size = props.size ?? 40
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[10px] font-mono text-[11px] font-medium ${tones[props.tone ?? 'fill']}`}
      style={{ width: size, height: size }}
    >
      {props.children}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return <kbd className="rounded-md border border-line-2 bg-card px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{children}</kbd>
}

export function EmptyState(props: { title: string; children: ReactNode; milestone?: string; action?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[14px] border-[1.5px] border-dashed border-line-2 bg-fill-2 px-7 py-8">
      {props.milestone && <Badge>{props.milestone}</Badge>}
      <div className="text-[17px] font-bold">{props.title}</div>
      <div className="max-w-[560px] text-[14px] leading-normal text-muted">{props.children}</div>
      {props.action}
    </div>
  )
}
