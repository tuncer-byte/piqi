import { useEffect, useState, type ReactNode } from 'react'
import { PROVIDER_PRESETS, presetById, type ProviderPreset } from '@shared/providers'
import type { MeetingDetection, PermissionStatus, Settings } from '@shared/types'
import { usePolicy, useProviderStatuses } from '../shared/hooks'
import { PiqiMark } from '../shared/PiqiMark'
import { Badge, Button, Card, Segmented, TextField } from './ui'

type Step = 'welcome' | 'permissions' | 'model' | 'meetings' | 'done'
const STEPS: Step[] = ['welcome', 'permissions', 'model', 'meetings', 'done']

interface Props {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  /** Kurulum bitti; `openSources` ise kullanıcı ilk kaynağını eklemek istiyor. */
  onFinish: (openSources: boolean) => void
}

/**
 * İlk açılış kurulumu: izinler, model sağlayıcısı ve toplantı algılama tek yerde ve bir kez halledilir.
 * Bitince bir daha gösterilmez (Ayarlar → Genel'den yeniden başlatılabilir).
 */
export function Onboarding({ settings, update, onFinish }: Props): ReactNode {
  const [step, setStep] = useState<Step>('welcome')
  const index = STEPS.indexOf(step)
  const next = (): void => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]!)
  const back = (): void => setStep(STEPS[Math.max(0, index - 1)]!)

  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-bg px-8 py-10">
      <div className="flex w-full max-w-[680px] flex-col gap-6">
        <div className="flex items-center gap-2" aria-label={`Adım ${index + 1} / ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-ink' : 'bg-fill'}`} />
          ))}
        </div>
        {step === 'welcome' && <Welcome onNext={next} />}
        {step === 'permissions' && <Permissions onNext={next} onBack={back} />}
        {step === 'model' && <Model settings={settings} update={update} onNext={next} onBack={back} />}
        {step === 'meetings' && <Meetings settings={settings} update={update} onNext={next} onBack={back} />}
        {step === 'done' && <Done onFinish={onFinish} onBack={back} />}
      </div>
    </div>
  )
}

function Header({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <h1 className="m-0 text-[28px] font-bold tracking-[-0.02em]">{title}</h1>
      <p className="mb-0 mt-2 text-[15px] leading-relaxed text-muted">{children}</p>
    </div>
  )
}

function Nav(props: { onBack?: () => void; onNext: () => void; nextLabel: string; nextDisabled?: boolean; skip?: () => void }): ReactNode {
  return (
    <div className="flex items-center justify-between">
      {props.onBack ? (
        <Button variant="ghost" onClick={props.onBack}>
          Geri
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        {props.skip && (
          <Button variant="ghost" onClick={props.skip}>
            Şimdilik atla
          </Button>
        )}
        <Button variant="primary" disabled={props.nextDisabled} onClick={props.onNext}>
          {props.nextLabel}
        </Button>
      </div>
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }): ReactNode {
  return (
    <>
      <PiqiMark size={56} tone="lime" state="ready" />
      <Header title="Piqi’ye hoş geldin">
        Piqi toplantıyı dinler, karşı taraf ürünle ilgili bir soru sorduğunda kendi dokümanlarından ve kodundan kaynaklı bir cevap hazırlar.
        Cevabı sen verirsin; Piqi toplantıya katılmaz. Başlamadan önce izinleri ve model sağlayıcısını birlikte ayarlayalım; bir kez
        yapman yeterli.
      </Header>
      <Card className="flex flex-col gap-2 px-5 py-4 text-[14px] leading-normal text-ink-2">
        <div>Ham ses Mac’ten çıkmaz; konuşmalar cihaz üzerinde yazıya dökülür.</div>
        <div>Buluta yalnızca cevap için gereken metin gider; kişisel veriler maskelenir.</div>
      </Card>
      <Nav onNext={onNext} nextLabel="Başla" />
    </>
  )
}

function Permissions({ onNext, onBack }: { onNext: () => void; onBack: () => void }): ReactNode {
  const [perms, setPerms] = useState<PermissionStatus | null>(null)
  const [system, setSystem] = useState<{ ok: boolean; error?: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const refresh = (): void => void window.piqi.permissions.get().then(setPerms)
  useEffect(refresh, [])
  // Kullanıcı Sistem Ayarları'ndan dönünce durumu yenile.
  useEffect(() => {
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const run = async (key: string, action: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    try {
      await action()
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const mic = perms?.microphone
  const speech = perms?.speech
  const ready = mic === 'granted' && (!perms?.speechRequired || speech === 'granted') && system?.ok === true

  return (
    <>
      <Header title="İzinler">
        Piqi’nin seni ve toplantıyı duyabilmesi için macOS izinleri gerekiyor. Her birine bir kez izin vermen yeterli.
      </Header>
      <div className="flex flex-col gap-2.5">
        <PermissionRow
          title="Mikrofon"
          detail="Kendi sesin: “Selam Piqi” ve sorduğun sorular."
          state={mic}
          busy={busy === 'mic'}
          onGrant={() => void run('mic', () => window.piqi.permissions.requestMicrophone())}
          onOpenSettings={() => window.piqi.permissions.openSystemSettings('microphone')}
        />
        {perms?.speechRequired && (
          <PermissionRow
            title="Konuşma tanıma"
            detail="Konuşmalar cihaz üzerinde yazıya dökülür; ses Mac’ten çıkmaz."
            state={speech}
            busy={busy === 'speech'}
            onGrant={() => void run('speech', () => window.piqi.permissions.requestSpeech())}
            onOpenSettings={() => window.piqi.permissions.openSystemSettings('speech')}
          />
        )}
        <Card className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              Toplantı sesi
              {system && <Badge tone={system.ok ? 'ok' : 'warn'}>{system.ok ? 'Çalışıyor' : 'Alınamadı'}</Badge>}
            </div>
            <div className="mt-0.5 text-[13px] leading-normal text-muted">
              {system && !system.ok
                ? `Karşı tarafın sesi alınamadı. Sistem Ayarları’nda Piqi için sistem sesi kaydına izin ver.${system.error ? ` (${system.error})` : ''}`
                : 'Teams, Zoom ve diğer uygulamalardaki karşı tarafın sesi. macOS ilk denemede izin ister.'}
            </div>
          </div>
          {system && !system.ok ? (
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => window.piqi.permissions.openSystemSettings('audio-capture')}>
                Sistem Ayarları
              </Button>
              <Button size="sm" variant="primary" disabled={busy === 'system'} onClick={() => void run('system', async () => setSystem(await window.piqi.permissions.testSystemAudio()))}>
                Tekrar dene
              </Button>
            </div>
          ) : (
            !system?.ok && (
              <Button size="sm" variant="primary" disabled={busy === 'system'} onClick={() => void run('system', async () => setSystem(await window.piqi.permissions.testSystemAudio()))}>
                {busy === 'system' ? 'Deneniyor…' : 'İzin ver ve dene'}
              </Button>
            )
          )}
        </Card>
      </div>
      <Nav onBack={onBack} onNext={onNext} nextLabel={ready ? 'Devam' : 'Şimdilik devam et'} />
    </>
  )
}

function PermissionRow(props: {
  title: string
  detail: string
  state: PermissionStatus['microphone'] | undefined
  busy: boolean
  onGrant: () => void
  onOpenSettings: () => void
}): ReactNode {
  return (
    <Card className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          {props.title}
          {props.state === 'granted' && <Badge tone="ok">İzin verildi</Badge>}
          {props.state === 'denied' && <Badge tone="warn">Reddedildi</Badge>}
        </div>
        <div className="mt-0.5 text-[13px] leading-normal text-muted">
          {props.state === 'denied' ? 'Sistem Ayarları → Gizlilik ve Güvenlik’ten Piqi’yi aç, sonra buraya dön.' : props.detail}
        </div>
      </div>
      {props.state === 'undetermined' && (
        <Button size="sm" variant="primary" disabled={props.busy} onClick={props.onGrant}>
          İzin ver
        </Button>
      )}
      {props.state === 'denied' && (
        <Button size="sm" onClick={props.onOpenSettings}>
          Sistem Ayarları
        </Button>
      )}
    </Card>
  )
}

function Model(props: { settings: Settings; update: (patch: Partial<Settings>) => void; onNext: () => void; onBack: () => void }): ReactNode {
  const { settings, update } = props
  const [policy] = usePolicy()
  const [statuses, refreshStatuses] = useProviderStatuses()
  const [key, setKey] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const allowed = (p: ProviderPreset): boolean => {
    if (policy?.allowedProviders && !policy.allowedProviders.includes(p.id)) return false
    return p.location !== 'cloud' || (policy?.effective.allowCloud ?? true)
  }
  const presets = PROVIDER_PRESETS.filter(allowed)
  const selected = presetById(settings.model.providerId) ?? presets[0] ?? PROVIDER_PRESETS[0]!
  const hasKey = statuses.find((s) => s.providerId === selected.id)?.hasApiKey ?? false
  const baseUrl = settings.providers[selected.id]?.baseUrl ?? ''
  const needsUrl = Boolean(selected.customUrl)

  const choose = (preset: ProviderPreset): void => {
    setResult(null)
    setKey('')
    update({ model: { ...settings.model, providerId: preset.id, id: preset.models[0]?.id ?? '' } })
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    setResult(null)
    try {
      if (key.trim()) {
        await window.piqi.provider.setApiKey(selected.id, key.trim())
        setKey('')
        refreshStatuses()
      }
      setResult(await window.piqi.provider.test())
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <Header title="Model sağlayıcısı">
        Cevapları ve toplantı özetlerini seçtiğin model üretir. Anahtarın bu Mac’in anahtar zincirinde saklanır. Kurum içi bir sunucu (Ollama,
        vLLM) da kullanabilirsin.
      </Header>
      <div className="grid grid-cols-2 gap-2.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choose(p)}
            className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${
              p.id === selected.id ? 'border-[1.5px] border-ink bg-card' : 'border-line bg-card hover:bg-fill-2'
            }`}
          >
            <div className="text-[14px] font-semibold">{p.name}</div>
            <div className="mt-0.5 text-[12px] text-muted">{p.location === 'cloud' ? 'Bulut' : 'Kurum içi / yerel'}</div>
          </button>
        ))}
      </div>
      <Card className="flex flex-col gap-4 px-5 py-4">
        {needsUrl && (
          <TextField
            label="Sunucu adresi"
            mono
            value={baseUrl}
            placeholder={selected.baseUrl ?? 'http://localhost:11434/v1'}
            onChange={(v) => update({ providers: { ...settings.providers, [selected.id]: { baseUrl: v } } })}
          />
        )}
        {selected.keyRequired && (
          <TextField
            label={hasKey ? 'API anahtarı (kayıtlı; değiştirmek için yenisini gir)' : 'API anahtarı'}
            type="password"
            mono
            value={key}
            placeholder={selected.keyHint ?? ''}
            onChange={setKey}
          />
        )}
        {selected.models.length > 0 && (
          <label className="block">
            <div className="mb-1.5 text-[12.5px] text-muted">Model</div>
            <select
              className="h-[42px] w-full rounded-[10px] border border-line-2 bg-card px-3 text-[14px] text-ink"
              value={settings.model.id}
              onChange={(e) => update({ model: { ...settings.model, id: e.target.value } })}
            >
              {selected.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.note ? ` · ${m.note}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={testing || (selected.keyRequired && !hasKey && !key.trim()) || (needsUrl && !baseUrl.trim())} onClick={() => void test()}>
            {testing ? 'Deneniyor…' : 'Kaydet ve test et'}
          </Button>
          {result && <span className={`text-[13px] ${result.ok ? 'text-ok' : 'text-err'}`}>{result.message}</span>}
        </div>
      </Card>
      <Nav
        onBack={props.onBack}
        onNext={props.onNext}
        nextLabel="Devam"
        nextDisabled={!result?.ok}
        skip={result?.ok ? undefined : props.onNext}
      />
    </>
  )
}

function Meetings(props: { settings: Settings; update: (patch: Partial<Settings>) => void; onNext: () => void; onBack: () => void }): ReactNode {
  const options: { value: MeetingDetection; label: string }[] = [
    { value: 'ask', label: 'Sor' },
    { value: 'auto', label: 'Otomatik' },
    { value: 'off', label: 'Kapalı' }
  ]
  return (
    <>
      <Header title="Toplantı algılama">
        Teams, Zoom, Webex, Slack, FaceTime veya tarayıcıda bir görüşmeye girdiğinde Piqi bunu fark eder. Ne yapsın?
      </Header>
      <Card className="flex flex-col gap-3 px-5 py-4">
        <Segmented value={props.settings.meetingDetection} options={options} onChange={(meetingDetection) => props.update({ meetingDetection })} />
        <div className="text-[13px] leading-normal text-muted">
          {props.settings.meetingDetection === 'ask' && 'Görüşme başlayınca ekranın üstünde dinlemeye başlamak isteyip istemediğini sorar.'}
          {props.settings.meetingDetection === 'auto' && 'Görüşme başlayınca dinlemeyi kendiliğinden başlatır, bitince durdurur. Tarayıcılarda yine sorar.'}
          {props.settings.meetingDetection === 'off' && 'Dinlemeyi her seferinde kendin başlatırsın (⌘⇧L).'}
        </div>
      </Card>
      <Nav onBack={props.onBack} onNext={props.onNext} nextLabel="Devam" />
    </>
  )
}

function Done({ onFinish, onBack }: { onFinish: (openSources: boolean) => void; onBack: () => void }): ReactNode {
  return (
    <>
      <PiqiMark size={56} tone="lime" state="ready" />
      <Header title="Hazırsın">
        Son adım: Piqi’nin cevap verebilmesi için dokümanlarını, kod reposunu ya da onaylı cevaplarını ekle. Piqi menü çubuğunda çalışır;
        “Selam Piqi” diyerek ya da ⌘⇧K ile soru sorabilirsin.
      </Header>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Geri
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => onFinish(false)}>Sonra eklerim</Button>
          <Button variant="primary" onClick={() => onFinish(true)}>
            Kaynak ekle
          </Button>
        </div>
      </div>
    </>
  )
}
