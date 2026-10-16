import { useEffect, useState, type ReactNode } from 'react'
import type { FaqEntry } from '@shared/knowledge'
import { Trash } from '../../shared/icons'
import { Button, Card, Segmented, Switch, TextField } from '../ui'
import type { PanelProps } from './AddSourceDialog'
import { DialogFooter, SectionTitle } from './common'

function Body({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto px-2 py-2">{children}</div>
}

function Intro({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <div className="text-[22px] font-bold tracking-[-0.01em]">{title}</div>
      <div className="mt-1.5 max-w-[720px] text-[14px] leading-normal text-muted">{children}</div>
    </div>
  )
}

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }): ReactNode {
  return (
    <TextField
      label="Bu kaynak hakkında (isteğe bağlı)"
      multiline
      value={value}
      onChange={onChange}
      placeholder="ör. Ürün dokümantasyonu; fiyatlar ve limitler için ana kaynak."
    />
  )
}

// ── Web ───────────────────────────────────────────────────────────────────

export function WebPanel({ close }: PanelProps): ReactNode {
  const [url, setUrl] = useState('')
  const [sitemap, setSitemap] = useState(true)
  const [maxPages, setMaxPages] = useState('25')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim())

  const submit = async (): Promise<void> => {
    setBusy(true)
    const host = new URL(url.trim()).host
    await window.piqi.knowledge.add({
      kind: 'web',
      name: host,
      location: url.trim(),
      config: { kind: 'web', web: { url: url.trim(), crawlSitemap: sitemap, maxPages: Number(maxPages) } },
      note,
      focus: '',
      watch: false,
      priority: false
    })
    close()
  }

  return (
    <>
      <Body>
        <Intro title="Web sayfası">Herkese açık dokümantasyon, API referansı ya da ürün sayfası. Site haritası açıksa aynı alan adındaki sayfalar da alınır.</Intro>
        <Card className="flex flex-col gap-5 p-6">
          <TextField label="Adres" mono value={url} onChange={setUrl} placeholder="https://docs.acme.com/api" />
          <div className="flex flex-wrap items-center gap-8">
            <label className="flex items-center gap-3 text-[15px]">
              <Switch label="Site haritasını tara" checked={sitemap} onChange={setSitemap} />
              Site haritasını da tara (sitemap.xml)
            </label>
            <div className="flex items-center gap-3 text-[14px] text-muted">
              En fazla
              <Segmented
                value={maxPages}
                options={['10', '25', '50', '100'].map((v) => ({ value: v, label: v }))}
                onChange={setMaxPages}
              />
              sayfa
            </div>
          </div>
          <NoteField value={note} onChange={setNote} />
        </Card>
      </Body>
      <DialogFooter
        summary={valid ? `${sitemap ? `En fazla ${maxPages} sayfa` : '1 sayfa'} indekslenecek` : 'Adres girin'}
        canSubmit={valid}
        busy={busy}
        onCancel={close}
        onSubmit={() => void submit()}
      />
    </>
  )
}

// ── Confluence ────────────────────────────────────────────────────────────

export function ConfluencePanel({ close }: PanelProps): ReactNode {
  const [deployment, setDeployment] = useState<'cloud' | 'datacenter'>('cloud')
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [space, setSpace] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = /^https?:\/\//.test(baseUrl) && space.trim() && token.trim() && (deployment === 'datacenter' || email.includes('@'))

  const submit = async (): Promise<void> => {
    setBusy(true)
    await window.piqi.knowledge.add({
      kind: 'confluence',
      name: `Confluence · ${space.trim()}`,
      location: baseUrl.trim(),
      config: { kind: 'confluence', confluence: { baseUrl: baseUrl.trim(), email: email.trim(), spaceKey: space.trim(), deployment } },
      note,
      focus: '',
      watch: false,
      priority: false,
      token: token.trim()
    })
    close()
  }

  return (
    <>
      <Body>
        <Intro title="Confluence">
          Bir space’teki tüm sayfalar. Jeton macOS Keychain’de şifreli saklanır ve yalnızca bu kullanıcı tarafından kullanılabilir.
        </Intro>
        <Card className="flex flex-col gap-5 p-6">
          <Segmented
            value={deployment}
            options={[
              { value: 'cloud', label: 'Confluence Cloud' },
              { value: 'datacenter', label: 'Data Center / Server' }
            ]}
            onChange={setDeployment}
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Adres"
              mono
              value={baseUrl}
              onChange={setBaseUrl}
              placeholder={deployment === 'cloud' ? 'https://acme.atlassian.net' : 'https://wiki.kurum.local'}
            />
            <TextField label="Space anahtarı" mono value={space} onChange={setSpace} placeholder="GATEWAY" />
            {deployment === 'cloud' && <TextField label="E-posta" value={email} onChange={setEmail} placeholder="ad.soyad@architecht.com" />}
            <TextField
              label={deployment === 'cloud' ? 'API jetonu' : 'Kişisel erişim jetonu (PAT)'}
              type="password"
              mono
              value={token}
              onChange={setToken}
            />
          </div>
          <NoteField value={note} onChange={setNote} />
        </Card>
      </Body>
      <DialogFooter summary={valid ? `${space} space’i indekslenecek` : 'Bağlantı bilgilerini girin'} canSubmit={Boolean(valid)} busy={busy} onCancel={close} onSubmit={() => void submit()} />
    </>
  )
}

// ── Notion ────────────────────────────────────────────────────────────────

export function NotionPanel({ close }: PanelProps): ReactNode {
  const [token, setToken] = useState('')
  const [query, setQuery] = useState('')
  const [maxPages, setMaxPages] = useState('50')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setBusy(true)
    await window.piqi.knowledge.add({
      kind: 'notion',
      name: query.trim() ? `Notion · ${query.trim()}` : 'Notion',
      location: 'notion.so',
      config: { kind: 'notion', notion: { query: query.trim(), maxPages: Number(maxPages) } },
      note,
      focus: '',
      watch: false,
      priority: false,
      token: token.trim()
    })
    close()
  }

  return (
    <>
      <Body>
        <Intro title="Notion">
          Bir Notion entegrasyonu oluşturup ilgili sayfaları ona paylaş; Piqi entegrasyonun erişebildiği sayfaları alır. Jeton Keychain’de şifreli saklanır.
        </Intro>
        <Card className="flex flex-col gap-5 p-6">
          <TextField label="Entegrasyon jetonu" type="password" mono value={token} onChange={setToken} placeholder="ntn_…" />
          <div className="grid grid-cols-2 gap-4">
            <TextField label="Arama (isteğe bağlı)" value={query} onChange={setQuery} placeholder="ör. Gateway" />
            <div>
              <div className="mb-1.5 text-[12.5px] text-muted">En fazla sayfa</div>
              <Segmented value={maxPages} options={['25', '50', '100', '200'].map((v) => ({ value: v, label: v }))} onChange={setMaxPages} />
            </div>
          </div>
          <NoteField value={note} onChange={setNote} />
        </Card>
      </Body>
      <DialogFooter summary={token ? `En fazla ${maxPages} sayfa indekslenecek` : 'Jeton girin'} canSubmit={Boolean(token.trim())} busy={busy} onCancel={close} onSubmit={() => void submit()} />
    </>
  )
}

// ── SSS ve notlar ─────────────────────────────────────────────────────────

export function FaqPanel({ close }: PanelProps): ReactNode {
  const [entries, setEntries] = useState<FaqEntry[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => void window.piqi.knowledge.faq().then(setEntries), [])

  const save = async (): Promise<void> => {
    if (!question.trim() || !answer.trim()) return
    setEntries(await window.piqi.knowledge.saveFaq({ id: editing ?? undefined, question: question.trim(), answer: answer.trim() }))
    setQuestion('')
    setAnswer('')
    setEditing(null)
  }

  return (
    <>
      <Body>
        <Intro title="SSS ve notlar">
          Onaylı soru → cevap çiftleri aramada en yüksek önceliği alır; toplantıda aynı soru geldiğinde kısa ve kesin cevap verir. Fiyat, limit, sözleşme
          maddesi gibi değişmeyen bilgiler için idealdir.
        </Intro>
        <Card className="flex flex-col gap-4 p-6">
          <TextField label="Soru" value={question} onChange={setQuestion} placeholder="Rate limit kaç, aşılırsa ne olur?" />
          <TextField label="Onaylı cevap" multiline value={answer} onChange={setAnswer} placeholder="API key başına dakikada 600 istek; aşılırsa 429 ve Retry-After döner." />
          <div className="flex justify-end gap-2">
            {editing && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setQuestion('')
                  setAnswer('')
                }}
              >
                Vazgeç
              </Button>
            )}
            <Button variant="primary" disabled={!question.trim() || !answer.trim()} onClick={() => void save()}>
              {editing ? 'Güncelle' : 'Ekle'}
            </Button>
          </div>
        </Card>
        <SectionTitle>{`Onaylı cevaplar · ${entries.length}`}</SectionTitle>
        <div className="flex flex-col gap-2.5">
          {entries.map((e) => (
            <Card key={e.id} className="flex items-start gap-4 px-5 py-4">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-lime font-mono text-[11px] font-medium text-on-lime">
                SSS
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-ink"
                onClick={() => {
                  setEditing(e.id)
                  setQuestion(e.question)
                  setAnswer(e.answer)
                }}
              >
                <div className="text-[15px] font-semibold">{e.question}</div>
                <div className="mt-1 text-[13.5px] leading-normal text-muted">{e.answer}</div>
              </button>
              <button
                type="button"
                aria-label="Sil"
                onClick={() => void window.piqi.knowledge.deleteFaq(e.id).then(setEntries)}
                className="inline-flex size-9 items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:bg-fill hover:text-err"
              >
                <Trash size={16} />
              </button>
            </Card>
          ))}
        </div>
      </Body>
      <DialogFooter summary={`${entries.length} onaylı cevap · değişiklikler anında kaydedilir`} canSubmit onCancel={close} onSubmit={close} submitLabel="Bitti" />
    </>
  )
}
