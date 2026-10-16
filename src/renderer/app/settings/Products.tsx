import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Product, Sector, Tone } from '@shared/types'
import { Lock } from '../../shared/icons'
import type { PageProps } from '../App'
import { Button, Card, Label, PageHeader, Segmented, TextField } from '../ui'

const SECTORS: { value: Sector; label: string }[] = [
  { value: 'genel', label: 'Genel' },
  { value: 'bankacilik', label: 'Bankacılık' },
  { value: 'katilim', label: 'Katılım bankacılığı' }
]

const TONES: { value: Tone; label: string }[] = [
  { value: 'teknik', label: 'Teknik' },
  { value: 'satis', label: 'Satış' },
  { value: 'kisa', label: 'Kısa' }
]

export function ProductsPage({ settings, update, navigate }: PageProps): ReactNode {
  const save = (product: Product): void => update({ product })
  return (
    <>
      <PageHeader title="Ürün ve Piqi" subtitle="Piqi’nin ürün bilgisi ve cevap karakterini düzenle." />
      <ProductEditor
        product={settings.product}
        onSave={save}
        onOpenSources={() => navigate('sources')}
      />
    </>
  )
}

/** Taslak yerelde tutulur, yazmayı bırakınca kaydedilir. */
function ProductEditor(props: { product: Product; onSave: (product: Product) => void; onOpenSources: () => void }): ReactNode {
  const [draft, setDraft] = useState(props.product)
  const [term, setTerm] = useState('')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = setTimeout(() => props.onSave(draft), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const character = (patch: Partial<Product['character']>): void => setDraft({ ...draft, character: { ...draft.character, ...patch } })
  const addTerm = (): void => {
    const value = term.trim()
    if (value && !draft.character.glossary.includes(value)) character({ glossary: [...draft.character.glossary, value] })
    setTerm('')
  }

  return (
    <div className="flex w-full flex-col gap-3.5">
      <Card className="flex flex-col gap-3.5 px-5 py-[18px]">
        <Label>Ürün ve karakter</Label>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Ürün adı" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
          <div>
            <TextField label="Piqi’nin adı" value={draft.character.name} onChange={(name) => character({ name })} />
            <div className="mt-1.5 text-[12px] text-muted">
              {(draft.character.name.trim() || 'Piqi').toLocaleLowerCase('tr-TR') === 'piqi'
                ? 'Uyandırma: “Selam Piqi”.'
                : `Uyandırma: “Selam ${draft.character.name.trim()}” · “Selam Piqi” de çalışır`}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[12.5px] text-muted">Sektör</div>
          <Segmented value={draft.sector} options={SECTORS} onChange={(sector) => setDraft({ ...draft, sector })} />
          {draft.sector !== 'genel' && (
            <div className="mt-2 text-[12.5px] leading-normal text-muted">
              {draft.sector === 'katilim'
                ? 'Faiz yerine kâr payı ve sektöre özgü terimler kullanılır. Danışma Komitesi uygunluğu ve BDDK/KVKK konularında kesin hüküm verilmez.'
                : 'BDDK ve KVKK yükümlülüklerine aykırı öneride bulunulmaz; regülatif konularda uyum ekibiyle teyit istenir.'}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Karakterin rolü" value={draft.character.role} onChange={(role) => character({ role })} placeholder="teknik mimar" />
          <div>
            <div className="mb-1.5 text-[12.5px] text-muted">Ton</div>
            <Segmented value={draft.character.tone} options={TONES} onChange={(tone) => character({ tone })} />
          </div>
        </div>
        <TextField
          label="Talimat"
          multiline
          value={draft.character.instructions}
          onChange={(instructions) => character({ instructions })}
          placeholder="Ürününüzü, hedef kitlenizi ve cevap tercihlerinizi anlatın."
        />
        <div>
          <div className="mb-1.5 text-[12.5px] text-muted">Sözlük (konuşma tanımaya ipucu)</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {draft.character.glossary.map((glossaryTerm) => (
              <button
                key={glossaryTerm}
                type="button"
                title="Terimi kaldır"
                onClick={() => character({ glossary: draft.character.glossary.filter((item) => item !== glossaryTerm) })}
                className="rounded-full border-0 bg-fill px-[11px] py-[5px] font-mono text-[12px] text-ink hover:line-through"
              >
                {glossaryTerm}
              </button>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                addTerm()
              }}
            >
              <label className="sr-only" htmlFor="glossary-term">Yeni sözlük terimi</label>
              <input
                id="glossary-term"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                onBlur={addTerm}
                placeholder="+ terim"
                className="selectable w-28 rounded-full border border-dashed border-line-2 bg-transparent px-[11px] py-[5px] text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </form>
          </div>
        </div>
      </Card>

      <Card className="flex items-center justify-between gap-4 px-5 py-[18px]">
        <div>
          <Label>Bu ürünün kaynakları</Label>
          <div className="mt-1.5 text-[13px] text-muted">Dokümanlar, kod ve bağlantıları ürün bilgi havuzuna ekle.</div>
        </div>
        <Button onClick={props.onOpenSources}>Kaynakları yönet</Button>
      </Card>

      <Card tone="dark" className="flex items-center gap-[18px] px-5 py-4">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-panel-3">
          <Lock size={18} className="text-lime" />
        </span>
        <div className="flex-1">
          <div className="text-[15px] font-bold">Tek ve özel bilgi havuzu</div>
          <div className="mt-1 text-[13px] leading-[1.45] text-[#A9ACB3]">
            Kaynaklar, onaylı SSS’ler ve toplantı bağlamı bu ürün için birlikte kullanılır.
          </div>
        </div>
      </Card>
    </div>
  )
}