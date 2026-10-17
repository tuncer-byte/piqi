import { useEffect, useState, type ReactNode } from 'react'
import type { AudioProcessInfo, PermissionStatus, VoiceInfo, VoiceReplies } from '@shared/types'
import { useCaptureStatus, useLevels, useTtsStatus } from '../../shared/hooks'
import { Mic, Speaker } from '../../shared/icons'
import type { PageProps } from '../App'
import { MEETING_APPS } from '@shared/meetingApps'
import { Badge, Button, Card, Kbd, Label, PageHeader, Segmented, SettingRow, Switch } from '../ui'

// ── Genel ─────────────────────────────────────────────────────────────────

const REPLIES: { value: VoiceReplies; label: string }[] = [
  { value: 'auto', label: 'Otomatik' },
  { value: 'always', label: 'Her zaman' },
  { value: 'never', label: 'Asla' }
]

export function GeneralPage({ settings, update, navigate }: PageProps): ReactNode {
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  useEffect(() => void window.piqi.voice.list().then(setVoices), [])
  const language = settings.speech.locale.slice(0, 2)
  const options = voices.filter((v) => v.language.startsWith(language))

  return (
    <>
      <PageHeader title="Genel" subtitle="Piqi’yle nasıl konuşacağını ayarla." />
      <Card className="flex flex-col gap-5 px-5 py-[18px]">
        <SettingRow
          title={`“Selam ${settings.product.character.name}” ile uyandır`}
          description={`Dinleme açıkken mikrofonda “Selam ${settings.product.character.name}” ya da “Selam Piqi” deyince soruyu dinler; karşı taraf kanalında tetiklenmez.`}
        >
          <Switch label="Selam Piqi" checked={settings.speech.wakeWord} onChange={(wakeWord) => update({ speech: { ...settings.speech, wakeWord } })} />
        </SettingRow>
        <SettingRow
          title="Uygulama açıkken her zaman dinle"
          description="“Selam Piqi” uygulamayı açar, “Görüşürüz Piqi” kapatır. Yalnızca mikrofon dinlenir, konuşma tanıma Mac’te çalışır ve ses kaydedilmez; macOS mikrofon göstergesi açık kalır."
        >
          <Switch
            label="Her zaman dinle"
            checked={settings.speech.alwaysListen}
            onChange={(alwaysListen) => update({ speech: { ...settings.speech, alwaysListen } })}
          />
        </SettingRow>
        <SettingRow
          title="Sesli cevap"
          description="Otomatik: toplantı uygulaması (Teams, Zoom, Webex, Slack) ses üretirken sessiz, değilse sesli. Prova her zaman sesli."
        >
          <Segmented value={settings.voice.replies} options={REPLIES} onChange={(replies) => update({ voice: { ...settings.voice, replies } })} />
        </SettingRow>
      </Card>
      <VoiceEngineCard settings={settings} update={update} />
      <Card className="flex flex-col gap-4 px-5 py-[18px]">
        <Label>Apple sesi (İngilizce ve yedek)</Label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[260px] flex-1">
            <div className="mb-1.5 text-[12.5px] text-muted">Piqi’nin sesi</div>
            <select
              value={settings.voice.voiceId ?? ''}
              onChange={(e) => update({ voice: { ...settings.voice, voiceId: e.target.value || null } })}
              className="h-[42px] w-full rounded-[10px] border border-line-2 bg-card px-3 text-[14px] text-ink outline-none"
            >
              <option value="">Sistem varsayılanı ({settings.speech.locale})</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.language}
                  {v.quality > 1 ? ' · gelişmiş' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-56">
            <div className="mb-1.5 text-[12.5px] text-muted">Hız · {Math.round(settings.voice.rate * 100)}</div>
            <input
              type="range"
              min={0.35}
              max={0.65}
              step={0.01}
              value={settings.voice.rate}
              onChange={(e) => update({ voice: { ...settings.voice, rate: Number(e.target.value) } })}
              className="h-[42px] w-full accent-[#16161A] dark:accent-[#C8F169]"
            />
          </label>
          <Button onClick={() => window.piqi.voice.preview('Selam, ben Piqi. Toplantıya hazır mısın?')}>
            <Speaker size={14} /> Dinle
          </Button>
        </div>
        <div className="text-[12.5px] text-muted">
          Daha doğal bir Türkçe ses için Sistem Ayarları → Erişilebilirlik → Seslendirilen İçerik’ten “gelişmiş” bir ses indirebilirsin.
        </div>
      </Card>
    </>
  )
}

function VoiceEngineCard({ settings, update }: Pick<PageProps, 'settings' | 'update'>): ReactNode {
  const tts = useTtsStatus()
  const [installing, setInstalling] = useState(false)
  const install = async (): Promise<void> => {
    setInstalling(true)
    await window.piqi.tts.installEma()
    setInstalling(false)
  }
  return (
    <Card className="flex flex-col gap-4 px-5 py-[18px]">
      <SettingRow
        title="Seslendirme motoru"
        description="EMA Lightning: açık kaynak (Apache-2.0), 8,6M parametreli Türkçe model; bu Mac’te çalışır, gerçek zamanın onlarca katı hızlı. İngilizce cümleler Apple sesiyle okunur."
      >
        <Segmented
          value={settings.voice.engine}
          options={[
            { value: 'apple', label: 'Apple' },
            { value: 'ema', label: 'EMA Lightning' }
          ]}
          onChange={(engine) => {
            update({ voice: { ...settings.voice, engine } })
            if (engine === 'ema' && tts && !tts.emaInstalled) void install()
          }}
        />
      </SettingRow>
      {settings.voice.engine === 'ema' && tts && (
        <div className="flex items-center gap-3 rounded-[10px] bg-fill-2 px-3.5 py-3 text-[13px]">
          {tts.emaInstalled ? (
            <>
              <Badge tone="ok">Model hazır</Badge>
              <span className="flex-1 text-muted">EMA Lightning · tek ses, Türkçe · ~35 MB</span>
              <Button size="sm" onClick={() => window.piqi.voice.preview('Merhaba, ben Piqi. Toplantı cuma günü saat 14:30’da; kâr payı oranı yüzde 3,5.')}>
                <Speaker size={14} /> Dinle
              </Button>
            </>
          ) : tts.downloading != null || installing ? (
            <>
              <span className="text-muted">Model indiriliyor…</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full bg-[#8DB52F] transition-[width] dark:bg-lime" style={{ width: `${Math.round((tts.downloading ?? 0) * 100)}%` }} />
              </div>
              <span className="font-mono text-[12px]">{Math.round((tts.downloading ?? 0) * 100)}%</span>
            </>
          ) : (
            <>
              <span className="flex-1 text-muted">{tts.error ?? 'Model (~35 MB) bir kez indirilir ve SHA-256 ile doğrulanır.'}</span>
              <Button size="sm" variant="primary" onClick={() => void install()}>
                Modeli indir
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Ses ───────────────────────────────────────────────────────────────────

export function AudioPage({ settings, update }: PageProps): ReactNode {
  const status = useCaptureStatus()
  const levels = useLevels()
  const running = status?.state === 'running'
  const allSystem = settings.capture.bundleIds.length === 0

  const toggleApp = (bundleIds: readonly string[], on: boolean): void => {
    const current = new Set(settings.capture.bundleIds)
    bundleIds.forEach((id) => (on ? current.add(id) : current.delete(id)))
    update({ capture: { ...settings.capture, bundleIds: [...current] } })
  }

  const label = { stopped: 'Durduruldu', starting: 'Başlatılıyor', running: 'Dinliyor', error: 'Hata' }[status?.state ?? 'stopped']

  return (
    <>
      <PageHeader
        title="Ses"
        subtitle={
          <>
            {label}
            {status?.helperVersion && <span className="font-mono text-[12px]"> · piqi-audio {status.helperVersion}</span>}
          </>
        }
        actions={
          <Button variant={running ? 'secondary' : 'primary'} disabled={status?.state === 'starting'} onClick={() => void (running ? window.piqi.capture.stop() : window.piqi.capture.start())}>
            {running ? 'Durdur' : 'Dinlemeye başla'}
          </Button>
        }
      />
      {status && status.errors.length > 0 && (
        <Card tone="error" className="selectable flex flex-col gap-1 px-5 py-3.5 text-[13px] text-err">
          {status.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </Card>
      )}
      <Card className="flex flex-col gap-4 px-5 py-[18px]">
        <Meter icon={<Speaker size={16} />} label="Karşı taraf" sub="Sistem sesi" value={levels.them} enabled={status?.system ?? false} />
        <Meter icon={<Mic size={16} />} label="Ben" sub="Mikrofon" value={levels.me} enabled={status?.mic ?? false} />
      </Card>
      <Card className="flex flex-col gap-5 px-5 py-[18px]">
        <SettingRow
          title="Toplantıyı otomatik algıla"
          description="Teams, Zoom, Webex, Slack, FaceTime veya tarayıcı bir görüşmede mikrofonu açtığında Piqi bunu fark eder. “Sor”: Island’da dinlemeye başlamak isteyip istemediğini sorar. “Otomatik”: dinlemeyi kendiliğinden başlatır (tarayıcılarda yine sorar). Görüşme bitince Piqi’nin başlattığı dinleme durur. Ekran kaydı izni gerekmez."
        >
          <Segmented
            value={settings.meetingDetection}
            options={[
              { value: 'off', label: 'Kapalı' },
              { value: 'ask', label: 'Sor' },
              { value: 'auto', label: 'Otomatik' }
            ]}
            onChange={(meetingDetection) => update({ meetingDetection })}
          />
        </SettingRow>
        {status?.detectedMeeting && (
          <div className="text-[13px] font-semibold text-ok">{status.detectedMeeting} görüşmesi algılandı</div>
        )}
      </Card>
      <Card className="flex flex-col gap-5 px-5 py-[18px]">
        <SettingRow title="Mikrofon" description="Kendi konuşman; “Selam Piqi” ve prova cevapları buradan duyulur. Karşı tarafın soruları bu kanalda aranmaz.">
          <Switch label="Mikrofon" checked={settings.capture.mic} onChange={(mic) => update({ capture: { ...settings.capture, mic } })} />
        </SettingRow>
        <SettingRow title="Sistem sesi" description="Toplantıdaki karşı taraf.">
          <Switch label="Sistem sesi" checked={settings.capture.system} onChange={(system) => update({ capture: { ...settings.capture, system } })} />
        </SettingRow>
        <SettingRow title="Tüm sistem sesini dinle" description="Kapalıysa yalnızca seçtiğin uygulamalar dinlenir (müzik vb. karışmaz). Piqi’nin kendi sesi her durumda hariç tutulur.">
          <Switch
            label="Tüm sistem sesi"
            checked={allSystem}
            onChange={(on) => update({ capture: { ...settings.capture, bundleIds: on ? [] : ['com.microsoft.teams2', 'com.microsoft.teams', 'us.zoom.xos'] } })}
          />
        </SettingRow>
        {!allSystem && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {MEETING_APPS.map((app) => (
              <label key={app.id} className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  className="size-4 accent-[#16161A]"
                  checked={app.bundleIds.every((id) => settings.capture.bundleIds.includes(id))}
                  onChange={(e) => toggleApp(app.bundleIds, e.target.checked)}
                />
                {app.name}
              </label>
            ))}
          </div>
        )}
        <div className="text-[12.5px] text-muted">Değişiklikler dinleme sırasında otomatik uygulanır.</div>
      </Card>
      <ProcessList />
    </>
  )
}

function Meter(props: { icon: ReactNode; label: string; sub: string; value: number; enabled: boolean }): ReactNode {
  return (
    <div className={`flex items-center gap-3.5 ${props.enabled ? '' : 'opacity-45'}`}>
      <span className="inline-flex size-10 items-center justify-center rounded-[10px] bg-fill">{props.icon}</span>
      <div className="w-28">
        <div className="text-[14px] font-semibold">{props.label}</div>
        <div className="text-[12px] text-label">{props.sub}</div>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
        <div className="h-full rounded-full bg-[#8DB52F] transition-[width] duration-75 dark:bg-lime" style={{ width: `${Math.round(props.value * 100)}%` }} />
      </div>
    </div>
  )
}

function ProcessList(): ReactNode {
  const [items, setItems] = useState<AudioProcessInfo[] | null>(null)
  const refresh = (): void => void window.piqi.capture.listProcesses().then(setItems)
  const active = items?.filter((p) => p.isRunningOutput || p.isRunningInput) ?? []
  return (
    <Card className="flex flex-col gap-3 px-5 py-[18px]">
      <div className="flex items-center justify-between">
        <Label>Ses ve mikrofon kullanan uygulamalar</Label>
        <Button size="sm" onClick={refresh}>
          {items ? 'Yenile' : 'Göster'}
        </Button>
      </div>
      {items && (
        <>
          <div className="text-[12.5px] text-muted">
            {items.length} ses süreci, {active.length} aktif
          </div>
          <ul className="selectable m-0 max-h-48 list-none overflow-y-auto p-0 font-mono text-[12px]">
            {[...items]
              .sort((a, b) => Number(b.isRunningInput) * 2 + Number(b.isRunningOutput) - (Number(a.isRunningInput) * 2 + Number(a.isRunningOutput)))
              .map((p) => (
                <li key={p.pid} className={`flex items-center gap-2 py-0.5 ${p.isRunningOutput || p.isRunningInput ? '' : 'text-muted'}`}>
                  <span className="w-[86px] shrink-0 font-sans text-[11px] font-semibold">
                    {[p.isRunningInput && 'mikrofon', p.isRunningOutput && 'ses'].filter(Boolean).join(' + ') || '-'}
                  </span>
                  {p.bundleId} <span className="opacity-50">({p.pid})</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </Card>
  )
}

// ── Konuşma tanıma ────────────────────────────────────────────────────────

export function SpeechPage({ settings, update }: PageProps): ReactNode {
  const [perms, setPerms] = useState<PermissionStatus | null>(null)
  const refresh = (): void => void window.piqi.permissions.get().then(setPerms)
  useEffect(refresh, [])
  const status = useCaptureStatus()

  return (
    <>
      <PageHeader title="Konuşma tanıma" subtitle="Konuşmalar Apple’ın cihaz üzerindeki tanımasıyla yazıya dökülür; ses Mac’inden çıkmaz." />
      <Card className="flex flex-col gap-5 px-5 py-[18px]">
        <SettingRow title="Motor" description="Apple’ın cihaz üzerindeki konuşma tanıması; ses Mac’ten çıkmaz.">
          <Badge tone="ok">Apple · cihaz üzerinde</Badge>
        </SettingRow>
        <SettingRow title="İzin" description="macOS konuşma tanıma izni.">
          {perms?.speech === 'granted' ? (
            <Badge tone="ok">İzin verildi</Badge>
          ) : (
            <Button
              variant="primary"
              onClick={() =>
                perms?.speech === 'undetermined'
                  ? void window.piqi.permissions.requestSpeech().then(refresh)
                  : window.piqi.permissions.openSystemSettings('speech')
              }
            >
              {perms?.speech === 'undetermined' ? 'İzin ver' : 'Sistem Ayarları'}
            </Button>
          )}
        </SettingRow>
        <SettingRow title="Dil" description="Toplantının ana dili. Sorular hangi dilde sorulursa cevap o dilde gelir.">
          <Segmented
            value={settings.speech.locale}
            options={[
              { value: 'tr-TR', label: 'Türkçe' },
              { value: 'en-US', label: 'English' }
            ]}
            onChange={(locale) => update({ speech: { ...settings.speech, locale } })}
          />
        </SettingRow>
        <SettingRow title="Karşı tarafı da yazıya dök" description="Toplantı transkripti ve “toplantı bağlamı” için. Kapalıysa yalnızca senin sesin tanınır.">
          <Switch
            label="Karşı taraf transkripti"
            checked={settings.speech.transcribeThem}
            onChange={(transcribeThem) => update({ speech: { ...settings.speech, transcribeThem } })}
          />
        </SettingRow>
        <SettingRow
          title="Karşı tarafın sorularını otomatik cevapla"
          description="Karşı taraf ürünle ilgili bir soru sorduğunda Piqi bilgi bankasında arar. Güçlü bir kaynak bulursa cevabı Island’da gösterir; bulamazsa model çağırmadan soruyu Doküman eksikleri’ne yazar. “Beni duyuyor musunuz?” gibi cümleler yok sayılır."
        >
          <Switch
            label="Otomatik cevap"
            checked={settings.speech.autoAnswer}
            onChange={(autoAnswer) => update({ speech: { ...settings.speech, autoAnswer } })}
          />
        </SettingRow>
        <SettingRow
          title="Kaç kişi konuşuyor? (konuşmacı ayrımı)"
          description="Karşı taraftaki farklı kişileri ayırt eder: Konuşmacı 1, 2, 3… Toplantıda isim verebilirsin. Cihaz üzerinde çalışır (FluidAudio); ses izi saklanmaz, numaralar toplantı bitince silinir. İlk açılışta ~45 MB model indirilir."
        >
          <Switch
            label="Konuşmacı ayrımı"
            checked={settings.speech.diarization}
            onChange={(diarization) => update({ speech: { ...settings.speech, diarization } })}
          />
        </SettingRow>
        <div className="text-[12.5px] text-muted">
          Şu an yazıya dökülen kanallar:{' '}
          {status?.transcribing.length ? status.transcribing.map((c) => (c === 'me' ? 'Ben' : 'Karşı taraf')).join(', ') : 'yok (dinleme kapalı)'}
          . Ürün sözlüğündeki terimler tanımaya ipucu olarak verilir.
        </div>
      </Card>
    </>
  )
}

// ── Kısayollar ve Hakkında ────────────────────────────────────────────────

const SHORTCUTS = [
  ['⌘⇧L', 'Dinlemeyi başlat / durdur'],
  ['⌘⇧K', 'Piqi’ye sor (yazılı veya sesli)'],
  ['⌘⇧Space', 'Karşı tarafın son sorusunu şimdi cevapla'],
  ['⌘⇧E', 'Detayı aç / kapat'],
  ['⌘⇧C', 'Son cevabı kopyala'],
  ['⌘⇧H', 'Island’ı gizle / göster'],
  ['Esc', 'Sor kutusunu kapat']
]

export function ShortcutsPage(): ReactNode {
  return (
    <>
      <PageHeader title="Kısayollar" subtitle="Tüm kısayollar her uygulamanın içinden çalışır." />
      <Card className="overflow-hidden">
        {SHORTCUTS.map(([keys, label], i) => (
          <div key={keys} className={`flex items-center justify-between px-5 py-3.5 text-[14px] ${i ? 'border-t border-line' : ''}`}>
            <span>{label}</span>
            <Kbd>{keys}</Kbd>
          </div>
        ))}
      </Card>
      <div className="text-[13px] text-muted">Sesli komutlar: “Selam Piqi” (uygulamayı açar ve dinler) · “Selam Piqi, …” (doğrudan soru) · “Görüşürüz Piqi” (kapatır).</div>
    </>
  )
}

export function AboutPage(): ReactNode {
  const status = useCaptureStatus()
  return (
    <>
      <PageHeader title="Hakkında ve güncellemeler" />
      <Card className="flex flex-col gap-3 px-5 py-[18px] text-[14px]">
        <Row label="Piqi">{__APP_VERSION__}</Row>
        <Row label="Ses yardımcısı">{status?.helperVersion ? `piqi-audio ${status.helperVersion}` : 'dinleme başlayınca görünür'}</Row>
      </Card>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-[13px]">{children}</span>
    </div>
  )
}
