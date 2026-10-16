import { Fragment, type ReactNode } from 'react'

// Cevaplar için hafif Markdown: madde işaretleri, **kalın**, `kod`, ```kod blokları```.
// HTML enjekte etmez; her şey React düğümü olarak üretilir. Island'ın koyu zemini için renklendirilmiştir.

export function Markdown({ text, className }: { text: string; className?: string }): ReactNode {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    if (line.startsWith('```')) {
      // ```dosya/yolu.ts:42 gibi bir başlık kaynak yolu olarak gösterilir.
      const header = line.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) code.push(lines[i++]!)
      i++
      blocks.push(
        <pre
          key={blocks.length}
          className="selectable m-0 overflow-x-auto rounded-xl bg-island-code px-4 py-3.5 font-mono text-[12px] leading-[1.6] text-[#C9CBD0]"
        >
          {header && /[/.:]/.test(header) && <div className="mb-1 text-[#6F727A]">{header}</div>}
          {code.join('\n')}
        </pre>
      )
      continue
    }
    if (/^\s*[-*•] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•] /.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*•] /, ''))
      blocks.push(
        <div key={blocks.length} className="flex flex-col gap-[9px]">
          {items.map((item, j) => (
            <div key={j} className="flex gap-2.5">
              <span className="text-lime">•</span>
              <span>{inline(item)}</span>
            </div>
          ))}
        </div>
      )
      continue
    }
    if (line.trim()) blocks.push(<p key={blocks.length} className="m-0">{inline(line)}</p>)
    i++
  }

  return <div className={className}>{blocks}</div>
}

/** Satır içi biçimler: **kalın** ve `kod` (lime mono). */
export function inline(text: string, codeClass = 'font-mono text-[0.88em] text-lime'): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-lime">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <span key={i} className={codeClass}>
          {part.slice(1, -1)}
        </span>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}
