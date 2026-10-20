import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import type { Settings } from '@shared/types'
import { useCaptureStatus, useSettings } from '../shared/hooks'
import { ArrowLeft } from '../shared/icons'
import { HealthBanner } from './HealthBanner'
import { Onboarding } from './Onboarding'
import { PiqiMark, Wordmark } from '../shared/PiqiMark'
import { GapsPage, MeetingsPage } from './pages/Meetings'
import { SourcesPage } from './pages/Sources'
import { ProductsPage } from './settings/Products'
import { ModelsPage } from './settings/Models'
import { PrivacyPage } from './settings/Privacy'
import { AboutPage, AudioPage, GeneralPage, ShortcutsPage, SpeechPage } from './settings/SettingsPages'

export type Page =
  | 'sources'
  | 'meetings'
  | 'gaps'
  | `settings/${SettingsSection}`

type SettingsSection = 'general' | 'product' | 'audio' | 'speech' | 'models' | 'privacy' | 'shortcuts' | 'about'

export interface PageProps {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  navigate: (page: Page) => void
  /** Sayfa açılınca yapılacak iş (ör. kurulumdan sonra kaynak ekleme penceresini aç). */
  intent?: 'add-source' | null
  clearIntent?: () => void
}

const MENU: { page: Page; label: string }[] = [
  { page: 'sources', label: 'Kaynaklar' },
  { page: 'meetings', label: 'Toplantılar' },
  { page: 'gaps', label: 'Doküman eksikleri' },
  { page: 'settings/general', label: 'Ayarlar' }
]

const SETTINGS_MENU: { section: SettingsSection; label: string }[] = [
  { section: 'general', label: 'Genel' },
  { section: 'product', label: 'Ürün ve Piqi' },
  { section: 'audio', label: 'Ses' },
  { section: 'speech', label: 'Konuşma tanıma' },
  { section: 'models', label: 'Modeller ve sağlayıcılar' },
  { section: 'privacy', label: 'Gizlilik ve uyum' },
  { section: 'shortcuts', label: 'Kısayollar' },
  { section: 'about', label: 'Hakkında ve güncellemeler' }
]

export function App(): ReactNode {
  const [settings, update] = useSettings()
  const [page, setPage] = useState<Page>('sources')
  const [intent, setIntent] = useState<PageProps['intent']>(null)

  useEffect(() => window.piqi.app.onNavigate((p) => setPage(p as Page)), [])

  if (!settings) return null
  // İlk açılış: izinler, model ve toplantı algılama bir kez kurulur.
  if (!settings.onboarded) {
    return (
      <Shell title="Piqi · Kurulum">
        <Onboarding
          settings={settings}
          update={update}
          onFinish={(openSources) => {
            update({ onboarded: true })
            setPage('sources')
            if (openSources) setIntent('add-source')
          }}
        />
      </Shell>
    )
  }
  const props: PageProps = { settings, update, navigate: setPage, intent, clearIntent: () => setIntent(null) }
  const inSettings = page.startsWith('settings/')

  return (
    <Shell title={inSettings ? 'Piqi · Ayarlar' : 'Piqi'}>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[248px] shrink-0 flex-col gap-[22px] border-r border-line bg-side px-3.5 py-[18px]">
          {inSettings ? <SettingsNav page={page} navigate={setPage} /> : <MainNav {...props} page={page} />}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              className="mx-auto flex max-w-[1120px] flex-col gap-[22px] px-8 py-7"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <HealthBanner navigate={setPage} />
              <PageContent page={page} props={props} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </Shell>
  )
}

function PageContent({ page, props }: { page: Page; props: PageProps }): ReactNode {
  switch (page) {
    case 'sources':
      return <SourcesPage {...props} />
    case 'meetings':
      return <MeetingsPage {...props} />
    case 'gaps':
      return <GapsPage {...props} />
    case 'settings/general':
      return <GeneralPage {...props} />
    case 'settings/product':
      return <ProductsPage {...props} />
    case 'settings/audio':
      return <AudioPage {...props} />
    case 'settings/speech':
      return <SpeechPage {...props} />
    case 'settings/models':
      return <ModelsPage {...props} />
    case 'settings/privacy':
      return <PrivacyPage {...props} />
    case 'settings/shortcuts':
      return <ShortcutsPage />
    case 'settings/about':
      return <AboutPage />
    default:
      return null
  }
}

/** macOS başlık çubuğu (trafik ışıkları sistemden, başlık bizden). */
function Shell({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="drag flex h-11 shrink-0 items-center gap-2 border-b border-line bg-side pl-[88px]">
        <PiqiMark size={16} tone="mono" state="idle" className="text-ink-2" />
        <span className="text-[13px] font-semibold text-ink-2">{title}</span>
      </div>
      {children}
    </div>
  )
}

function NavItem(props: { active: boolean; onClick: () => void; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-current={props.active ? 'page' : undefined}
      className={`flex h-10 w-full items-center justify-between rounded-[9px] border-0 px-2.5 text-left text-[14px] ${
        props.active ? 'bg-card font-semibold text-ink shadow-[0_0_0_1px_var(--p-line)]' : 'bg-transparent text-ink-2 hover:bg-fill'
      }`}
    >
      {props.children}
    </button>
  )
}

function MainNav({ settings, navigate, page }: PageProps & { page: Page }): ReactNode {
  const status = useCaptureStatus()
  const listening = status?.state === 'running'
  const product = settings.product
  return (
    <>
      <div className="flex items-center gap-2.5 px-2 pt-1">
        <span className="inline-flex size-9 items-center justify-center rounded-[10px] bg-[#0E0E10]">
          <PiqiMark size={24} state={listening ? 'listening' : 'ready'} tone="lime" live={listening} />
        </span>
        <div className="min-w-0">
          <Wordmark size={20} />
          <div className="truncate text-[11.5px] text-label">{`${product.character.name} · ${product.name}`}</div>
        </div>
      </div>
      <div>
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-label">Ürün</div>
        <button
          type="button"
          onClick={() => navigate('settings/product')}
          className="flex h-10 w-full items-center justify-between rounded-[9px] border-0 bg-ink px-2.5 text-left text-[14px] font-semibold text-on-ink"
        >
          <span className="truncate">{product.name}</span>
          <span className="rounded-full bg-lime px-[7px] py-[3px] text-[10px] font-bold text-on-lime">ÜRÜNÜ DÜZENLE</span>
        </button>
      </div>
      <div>
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-label">Menü</div>
        <div className="flex flex-col gap-0.5">
          {MENU.map((item) => (
            <NavItem key={item.page} active={page === item.page} onClick={() => navigate(item.page)}>
              {item.label}
            </NavItem>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void (listening ? window.piqi.capture.stop() : window.piqi.capture.start())}
        className="mt-auto flex items-center gap-2.5 rounded-[10px] border-0 bg-badge p-3 text-left text-[12.5px] text-ink-2 hover:opacity-90"
      >
        <PiqiMark size={16} tone="mono" state={listening ? 'listening' : 'idle'} live={listening} className="text-ink-2" />
        {listening ? 'Dinleniyor' : status?.state === 'starting' ? 'Başlatılıyor…' : 'Dinleme kapalı'}
        <span className="ml-auto font-mono text-[11px] text-label">⌘⇧L</span>
      </button>
    </>
  )
}

function SettingsNav({ page, navigate }: { page: Page; navigate: (p: Page) => void }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => navigate('sources')}
        className="mb-2 flex h-9 items-center gap-2 rounded-[9px] border-0 bg-transparent px-2.5 text-[13px] font-semibold text-muted hover:bg-fill"
      >
        <ArrowLeft size={14} /> Geri
      </button>
      {SETTINGS_MENU.map((item) => (
        <NavItem key={item.section} active={page === `settings/${item.section}`} onClick={() => navigate(`settings/${item.section}`)}>
          {item.label}
        </NavItem>
      ))}
    </div>
  )
}
