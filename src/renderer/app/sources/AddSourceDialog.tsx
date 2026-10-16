import { AnimatePresence, motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import type { SourceKind } from '@shared/knowledge'
import { Button } from '../ui'
import { CodePanel } from './CodePanel'
import { FilesPanel } from './FilesPanel'
import { ConfluencePanel, FaqPanel, NotionPanel, WebPanel } from './RemotePanels'

const KINDS: { kind: SourceKind; title: string; subtitle: string }[] = [
  { kind: 'files', title: 'Dosyalar', subtitle: 'PDF · DOCX · PPTX · XLSX · MD' },
  { kind: 'code', title: 'Kod reposu', subtitle: 'Klasör veya Git URL' },
  { kind: 'web', title: 'Web sayfası', subtitle: 'URL veya site haritası' },
  { kind: 'confluence', title: 'Confluence', subtitle: 'Space ve sayfalar' },
  { kind: 'notion', title: 'Notion', subtitle: 'Sayfa ve veritabanları' },
  { kind: 'faq', title: 'SSS ve notlar', subtitle: 'Onaylı soru → cevap' }
]

export interface PanelProps {
  close: () => void
  /** Sürükle-bırak ile gelen yollar (Dosyalar paneli). */
  initialPaths?: string[]
}

/** "Kaynak ekle · <ürün>" penceresi (tasarım: 9 · Dosyalar, 10 · Kod reposu). */
export function AddSourceDialog(props: { productName: string; initialKind?: SourceKind; initialPaths?: string[]; onClose: () => void }): ReactNode {
  const [kind, setKind] = useState<SourceKind>(props.initialKind ?? 'files')
  const panel = { close: props.onClose, initialPaths: props.initialPaths }

  return (
    <motion.div
      className="flex flex-col gap-4 border-b border-line pb-5"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      role="region"
      aria-label="Kaynak ekle"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[18px] font-bold text-ink">Kaynak ekle</div>
          <div className="mt-0.5 text-[13px] text-muted">{props.productName} · tür seçip bilgileri girin</div>
        </div>
        <Button onClick={props.onClose}>Kapat</Button>
      </div>
      <nav className="flex flex-wrap gap-1.5" aria-label="Kaynak türü">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={`rounded-[9px] border px-3 py-2 text-left transition-colors ${
              kind === k.kind ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-2 hover:bg-fill'
            }`}
          >
            <div className="text-[13px] font-semibold">{k.title}</div>
            <div className={`mt-0.5 text-[11px] ${kind === k.kind ? 'text-on-ink/70' : 'text-muted'}`}>{k.subtitle}</div>
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={kind}
          className="flex min-w-0 flex-col"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.15 }}
        >
          {kind === 'files' && <FilesPanel {...panel} />}
          {kind === 'code' && <CodePanel {...panel} />}
          {kind === 'web' && <WebPanel {...panel} />}
          {kind === 'confluence' && <ConfluencePanel {...panel} />}
          {kind === 'notion' && <NotionPanel {...panel} />}
          {kind === 'faq' && <FaqPanel {...panel} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
