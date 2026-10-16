import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import type { Effort, ModelInfo, ProviderStatus } from '@shared/types'
import { PROVIDER_PRESETS, presetById, type ProviderPreset } from '@shared/providers'
import { usePolicy, useProviderStatuses } from '../../shared/hooks'
import { ChevronDown, Lock } from '../../shared/icons'
import type { PageProps } from '../App'
import { Badge, Button, Card, Label, PageHeader, Segmented, SettingRow, TextField } from '../ui'

const EFFORTS: { value: Effort; label: string }[] = [
  { value: 'low', label: 'Hızlı' },
  { value: 'medium', label: 'Dengeli' },
  { value: 'high', label: 'Derin' }
]

export function ModelsPage({ settings, update }: PageProps): ReactNode {
  const [statuses, refreshStatuses] = useProviderStatuses()
  const [policy] = usePolicy()
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const selected = presetById(settings.model.providerId) ?? PROVIDER_PRESETS[0]!

  const blockedReason = (preset: ProviderPreset): string | null => {
    if (!policy) return null
    if (policy.allowedProviders && !policy.allowedProviders.includes(preset.id)) return 'Kurum politikasında izinli değil'
    if (preset.location === 'cloud' && !policy.effective.allowCloud) return 'Veri politikası yalnızca kurum içi modellere izin veriyor'
    return null
  }

  const loadModels = (): void => {
    setLoadingModels(true)
    void window.piqi.provider
      .listModels(selected.id)
      .then(setModels)
      .finally(() => setLoadingModels(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadModels, [selected.id, statuses.find((s) => s.providerId === selected.id)?.hasApiKey])

  const choose = (providerId: string): void => {
    const preset = presetById(providerId)!
    setResult(null)
    update({ model: { ...settings.model, providerId, id: preset.models[0]?.id ?? '' } })
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(await window.piqi.provider.test())
    setTesting(false)
  }

  const options = models.some((m) => m.id === settings.model.id)
    ? models
    : [{ id: settings.model.id, label: settings.model.id || '(model seçin)' }, ...models]

  return (
    <>
      <PageHeader
        title="Modeller ve sağlayıcılar"
        subtitle="Piqi’nin cevaplarını ve provayı üreten model. Claude, Gemini, Qwen, OpenAI uyumlu servisler ve kurum içi sunucular desteklenir."
      />

      {policy?.managedBy && (
        <Card tone="dark" className="flex items-center gap-4 px-5 py-4">
          <Lock size={18} className="shrink-0 text-lime" />
          <div className="flex-1 text-[13.5px] leading-normal text-[#C8C8CE]">
            Bu ayarlar kurum politikasıyla yönetiliyor
            {!policy.effective.allowCloud && ': yalnızca kurum içi modeller kullanılabilir'}.
            <span className="ml-1 font-mono text-[11.5px] text-[#8E9199]">{policy.managedBy}</span>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-5 px-5 py-[18px]">
        <Label>Etkin model</Label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.3fr]">
          <label className="block">
            <div className="mb-1.5 text-[12.5px] text-muted">Sağlayıcı</div>
            <select
              value={selected.id}
              onChange={(e) => choose(e.target.value)}
              className="h-[42px] w-full rounded-[10px] border border-line-2 bg-card px-3 text-[14px] text-ink outline-none"
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id} disabled={blockedReason(p) != null}>
                  {p.name} · {p.location === 'cloud' ? 'bulut' : 'kurum içi'}
                  {blockedReason(p) ? ' · kilitli' : ''}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted">
              Model
              <button type="button" onClick={loadModels} className="border-0 bg-transparent p-0 text-[12px] font-semibold text-ink underline">
                {loadingModels ? 'Yükleniyor…' : 'Listeyi yenile'}
              </button>
            </div>
            <div className="flex gap-2">
              <select
                value={settings.model.id}
                onChange={(e) => update({ model: { ...settings.model, id: e.target.value } })}
                className="h-[42px] min-w-0 flex-1 rounded-[10px] border border-line-2 bg-card px-3 text-[14px] text-ink outline-none"
              >
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {'note' in m && m.note ? ` · ${m.note}` : ''}
                  </option>
                ))}
              </select>
              <CustomModel onSave={(id) => update({ model: { ...settings.model, id } })} />
            </div>
          </div>
        </div>
        <SettingRow title="Düşünme derinliği" description="Hızlı: canlı toplantı ve sesli sohbet için önerilir. Derin: daha yavaş ama daha titiz.">
          <Segmented value={settings.model.effort} options={EFFORTS} onChange={(effort) => update({ model: { ...settings.model, effort } })} />
        </SettingRow>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="primary" disabled={testing || !settings.model.id} onClick={() => void test()}>
            {testing ? 'Deneniyor…' : 'Bağlantıyı test et'}
          </Button>
          {result && <span className={`text-[13px] ${result.ok ? 'text-ok' : 'text-err'}`}>{result.message}</span>}
        </div>
        <div className="rounded-[10px] bg-fill-2 px-3.5 py-3 text-[12.5px] leading-normal text-muted">
          {selected.location === 'cloud'
            ? `${selected.name} bir bulut sağlayıcısı: sorular ve seçtiğin toplantı bağlamı ${policy?.effective.maskPII ? 'kişisel veriler maskelenerek ' : ''}bu servise gider. Ham ses hiçbir zaman gitmez.`
            : `${selected.name} kurum içi: veriler bu Mac’ten veya kurumun ağından çıkmaz.`}
        </div>
      </Card>

      <Label>Sağlayıcılar</Label>
      <div className="flex flex-col gap-2.5">
        {PROVIDER_PRESETS.map((preset) => (
          <ProviderRow
            key={preset.id}
            preset={preset}
            status={statuses.find((s) => s.providerId === preset.id)}
            active={preset.id === selected.id}
            blocked={blockedReason(preset)}
            open={open === preset.id}
            onToggle={() => setOpen(open === preset.id ? null : preset.id)}
            baseUrl={settings.providers[preset.id]?.baseUrl ?? ''}
            onBaseUrl={(baseUrl) => update({ providers: { ...settings.providers, [preset.id]: { baseUrl } } })}
            onKey={(key) => void window.piqi.provider.setApiKey(preset.id, key).then(refreshStatuses)}
            onUse={() => choose(preset.id)}
          />
        ))}
      </div>
    </>
  )
}

function CustomModel({ onSave }: { onSave: (id: string) => void }): ReactNode {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  if (!editing) {
    return (
      <Button onClick={() => setEditing(true)} title="Listede olmayan bir model kimliği gir">
        Elle gir
      </Button>
    )
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSave(value.trim())
        setEditing(false)
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ör. qwen3.6-35b-a3b"
        className="selectable h-[42px] w-48 rounded-[10px] border border-line-2 bg-card px-3 font-mono text-[13px] text-ink outline-none"
      />
      <Button variant="primary" type="submit">
        Kullan
      </Button>
    </form>
  )
}

function ProviderRow(props: {
  preset: ProviderPreset
  status: ProviderStatus | undefined
  active: boolean
  blocked: string | null
  open: boolean
  onToggle: () => void
  baseUrl: string
  onBaseUrl: (url: string) => void
  onKey: (key: string | null) => void
  onUse: () => void
}): ReactNode {
  const { preset, status } = props
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(props.baseUrl)
  const ready = status?.hasApiKey || !preset.keyRequired

  return (
    <Card tone={props.active ? 'selected' : 'default'} className={`overflow-hidden ${props.blocked ? 'opacity-55' : ''}`}>
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-3.5 text-left text-ink"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            {preset.name}
            {props.active && <Badge tone="lime">Etkin</Badge>}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-label">
            {props.blocked ?? (preset.docs ? preset.docs : preset.baseUrl ?? '')}
          </div>
        </div>
        <Badge tone={preset.location === 'cloud' ? 'warn' : 'ok'}>{preset.location === 'cloud' ? 'Bulut' : 'Kurum içi'}</Badge>
        {preset.keyRequired && (
          <Badge tone={status?.hasApiKey ? 'ok' : 'neutral'}>
            {status?.hasApiKey ? (status.source === 'env' ? 'Anahtar: ortam' : 'Anahtar kayıtlı') : 'Anahtar yok'}
          </Badge>
        )}
        <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${props.open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {props.open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
              {(preset.customUrl || preset.id === 'ollama') && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <TextField
                      label="Sunucu adresi (OpenAI uyumlu /v1)"
                      mono
                      value={url}
                      onChange={setUrl}
                      placeholder={preset.baseUrl ?? 'https://llm.kurum.local/v1'}
                    />
                  </div>
                  <Button onClick={() => props.onBaseUrl(url.trim())}>Kaydet</Button>
                </div>
              )}
              {(preset.keyRequired || preset.customUrl) && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <TextField
                      label={preset.keyRequired ? 'API anahtarı' : 'API anahtarı (isteğe bağlı)'}
                      type="password"
                      mono
                      value={key}
                      onChange={setKey}
                      placeholder={preset.keyHint}
                    />
                  </div>
                  <Button
                    variant="primary"
                    disabled={!key.trim()}
                    onClick={() => {
                      props.onKey(key)
                      setKey('')
                    }}
                  >
                    Kaydet
                  </Button>
                  {status?.source === 'keychain' && <Button onClick={() => props.onKey(null)}>Sil</Button>}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-muted">
                  Anahtarlar macOS Keychain ile şifrelenip yalnızca bu Mac’te saklanır.
                </span>
                {!props.active && (
                  <Button size="sm" disabled={!ready || props.blocked != null} onClick={props.onUse}>
                    Bunu kullan
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
