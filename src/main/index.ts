import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  shell
} from 'electron'
import { IPC, type NewSource, type SystemSettingsPane } from '@shared/ipc'
import type { FolderScan, Tactic } from '@shared/knowledge'
import { GapStore } from './knowledge/GapStore'
import { IMAGE_EXT } from './knowledge/vision'
import { KnowledgeDB } from './knowledge/KnowledgeDB'
import { KnowledgeService } from './knowledge/KnowledgeService'
import type {
  AskRequest,
  AudioChannel,
  CaptureStatus,
  HealthIssue,
  IslandAction,
  NotchGeometry,
  Permission,
  PermissionStatus,
  ProviderStatus,
  Settings
} from '@shared/types'
import type { MeetingApp } from '@shared/meetingApps'
import { PARTICIPATION_GLOSSARY } from '@shared/products'
import { PROVIDER_PRESETS } from '@shared/providers'
import { Assistant } from './assistant/Assistant'
import { AudioService, type ScreenInfo } from './audio/AudioService'
import { IslandController } from './island/IslandController'
import { healthIssues } from './health'
import { MeetingDetector } from './meeting/MeetingDetector'
import { MeetingHistory } from './meeting/MeetingHistory'
import { summarizeMeeting } from './meeting/summarize'
import { AuditLog } from './llm/AuditLog'
import { LlmService } from './llm/LlmService'
import { PolicyService } from './PolicyService'
import { EmaEngine } from './speech/EmaEngine'
import { EchoFilter } from './speech/echo'
import { PeopleService } from './speech/PeopleService'
import { SecretStore } from './SecretStore'
import { SettingsStore } from './SettingsStore'
import { TranscriptStore } from './speech/TranscriptStore'
import { VoiceOutput } from './speech/VoiceOutput'
import { PiqiTray } from './tray'
import { createIslandWindow } from './windows/IslandWindow'
import { getMainWindow, showMainWindow } from './windows/MainWindow'

if (!app.requestSingleInstanceLock()) app.quit()

let islandWindow: BrowserWindow | null = null

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', 'piqi-audio')
    : join(app.getAppPath(), 'native/piqi-audio/.build/release/piqi-audio')
}

function ttsPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', 'piqi-tts')
    : join(app.getAppPath(), 'native/piqi-tts/target/release/piqi-tts')
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/** Notch geometrisini yardımcıdan alır; alınamazsa Electron ekran bilgisinden tahmin eder. */
function geometryFrom(screens: ScreenInfo[]): NotchGeometry {
  const primary = screen.getPrimaryDisplay()
  const match =
    screens.find((s) => s.width === primary.bounds.width && s.height === primary.bounds.height) ??
    screens.find((s) => s.isMain)
  return {
    notch: match?.notch ?? null,
    menuBarHeight: match?.menuBarHeight ?? primary.workArea.y - primary.bounds.y
  }
}

function openMain(page?: string): void {
  void app.dock?.show()
  const existing = getMainWindow()
  const win = showMainWindow()
  if (!existing) win.once('closed', () => app.dock?.hide())
  if (page) {
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send(IPC.navigate, page))
    else win.webContents.send(IPC.navigate, page)
  }
}

app.whenReady().then(async () => {
  // Menü çubuğu uygulaması: Dock ikonu yalnızca ana pencere açıkken görünür.
  app.dock?.hide()
  // Paketli uygulamada ikon .icns'ten gelir; dev'de Electron simgesi yerine Piqi simgesi.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'resources', 'icon.png'))

  const userData = app.getPath('userData')
  const settings = new SettingsStore(join(userData, 'settings.json'))
  const secrets = new SecretStore(join(userData, 'secrets.bin'))
  const getSettings = (): Settings => settings.get()

  const policy = new PolicyService()
  const managedDefaults = policy.applyDefaults(settings.get())
  if (managedDefaults) settings.update(managedDefaults)
  const audit = new AuditLog(join(userData, 'audit'))

  const audio = new AudioService(helperPath(), !app.isPackaged)
  const transcripts = new TranscriptStore()
  const people = new PeopleService()
  const ema = new EmaEngine(ttsPath(), join(userData, 'models', 'ema-lightning'), join(app.getPath('temp'), 'piqi-tts'))
  const voice = new VoiceOutput(audio, getSettings, ema)
  const llm = new LlmService(secrets, getSettings, policy, audit)
  const knowledge = new KnowledgeService(
    new KnowledgeDB(join(userData, 'knowledge.db')),
    llm,
    secrets,
    getSettings,
    join(userData, 'repos')
  )
  knowledge.on('changed', () => {
    broadcast(IPC.knowledgeChanged, knowledge.overview())
  })
  const history = new MeetingHistory(join(userData, 'meetings'), (record) => summarizeMeeting(llm, record, settings.get().product))
  history.prune(settings.get().history.retentionDays)
  history.on('change', (list) => broadcast(IPC.meetingsChanged, list))
  const gaps = new GapStore(join(userData, 'gaps.json'))
  gaps.on('change', (list) => broadcast(IPC.gapsChanged, list))
  /** Onaylı cevap kaydedilince aynı soru eksiklerden düşer. */
  const saveFaq = (entry: { id?: string; question: string; answer: string }): void => {
    knowledge.saveFaq(entry)
    gaps.resolveByQuestion(entry.question)
  }

  const screens = await audio.screens().catch((error) => {
    console.warn('[piqi] ekran geometrisi alınamadı:', error)
    return [] as ScreenInfo[]
  })
  const productInfo = (): { productName: string; characterName: string } => {
    const product = settings.get().product
    return { productName: product.name, characterName: product.character.name }
  }
  const island = new IslandController(geometryFrom(screens), productInfo(), (text) => clipboard.writeText(text))

  /**
   * İki dinleme modu: "uyandırma" (yalnızca mikrofon; "Selam Piqi"yi bekler) ve "toplantı"
   * (mikrofon + sistem sesi + konuşmacı ayrımı). ⌘⇧L toplantı modunu açıp kapatır.
   */
  let meeting = false
  /** Toplantı dinlemesini kim başlattı: dedektörün başlattığı dinleme görüşme bitince kendiliğinden durur. */
  let meetingBy: 'user' | 'detector' = 'user'
  /** Algılanan görüşmenin uygulaması (toplantı geçmişinde gösterilir). */
  let meetingApp: MeetingApp | null = null
  let captureTransition: Promise<void> = Promise.resolve()
  // Kurulum bitmeden dinleme başlamaz; izinler kurulum ekranından istenir.
  const wakeAlways = (): boolean => settings.get().onboarded && settings.get().speech.wakeWord && settings.get().speech.alwaysListen

  const transcriptionConfig = (): { locale: string; channels: AudioChannel[]; contextual: string[] } => {
    const s = settings.get()
    const channels: AudioChannel[] = ['me']
    if (meeting && s.speech.transcribeThem) channels.push('them')
    const product = s.product
    const sector = product.sector === 'katilim' ? PARTICIPATION_GLOSSARY : []
    return {
      locale: s.speech.locale,
      channels,
      contextual: ['Piqi', product.character.name, ...product.character.glossary, ...sector]
    }
  }
  const diarizationModels = join(userData, 'models', 'diarizer')
  const applySpeechConfig = (): void => {
    audio.setTranscription(transcriptionConfig())
    const s = settings.get().speech
    audio.setDiarization(meeting && s.diarization && s.transcribeThem, diarizationModels)
  }
  applySpeechConfig()

  // ── İzinler ve sağlık: "dinliyor ama duymuyor" durumunu önle ve görünür kıl ──
  let permissions: { mic: Permission; speech: Permission } = { mic: 'undetermined', speech: 'undetermined' }
  // macOS 26+ SpeechAnalyzer konuşma tanıma izni istemez; yalnızca eski sürümlerde gerekir.
  const speechPermissionNeeded = Number(process.getSystemVersion().split('.')[0]) < 26
  const refreshPermissions = async (): Promise<void> => {
    const before = permissions
    permissions = await audio.permissions().catch(() => permissions)
    publishHealth()
    // İzin Sistem Ayarları'ndan sonradan açıldıysa yeniden başlatma gerekmesin.
    if (before.speech !== 'granted' && permissions.speech === 'granted') applySpeechConfig()
    if (before.mic !== 'granted' && permissions.mic === 'granted' && before.mic !== 'undetermined') void applyCapture()
  }
  const health = (): HealthIssue[] => {
    const s = settings.get()
    const preset = PROVIDER_PRESETS.find((p) => p.id === s.model.providerId)
    const ready = preset ? !preset.keyRequired || secrets.status(preset.id).hasApiKey : false
    const speech = speechPermissionNeeded ? permissions.speech : 'granted'
    return healthIssues({ ...permissions, speech, status: audio.getStatus(), model: preset ? { name: preset.name, ready } : null })
  }
  let lastHealth = ''
  const publishHealth = (): void => {
    const issues = health()
    const key = JSON.stringify(issues)
    if (key === lastHealth) return
    lastHealth = key
    broadcast(IPC.healthChanged, issues)
  }

  /** Dinleme mikrofonu ve konuşma tanımayı birlikte gerektirir; ikisini de gerekirse ister. */
  const ensureMicPermission = async (): Promise<void> => {
    await refreshPermissions()
    // İzin penceresi yanıtsız kalsa ya da hata verse de dinleme başlasın; sorun sağlık bandında görünür.
    const ask = (request: () => Promise<unknown>): Promise<unknown> =>
      request().catch((error) => console.warn('[piqi] izin isteği tamamlanmadı:', error))
    if (permissions.mic === 'undetermined') await ask(() => audio.requestMicPermission())
    if (speechPermissionNeeded && permissions.speech === 'undetermined') await ask(() => audio.requestSpeechPermission())
    await refreshPermissions()
  }

  /** Yakalamayı istenen moda getirir (gerekirse yeniden başlatır). */
  const applyCapture = (): Promise<void> => {
    const transition = captureTransition.catch(() => undefined).then(async () => {
      const capture = settings.get().capture
      const want = meeting ? capture : wakeAlways() ? { ...capture, mic: true, system: false } : null
      applySpeechConfig()
      const status = audio.getStatus()
      if (status.state === 'running' || status.state === 'starting') await audio.stop()
      if (!want) return
      if (want.mic) await ensureMicPermission()
      await audio.start(want)
    })
    captureTransition = transition.catch((error) => {
      console.warn('[piqi] ses yakalama geçişi başarısız:', error)
    })
    return captureTransition
  }

  /** Sesli soru için mikrofonun ve konuşma tanımanın açık olmasını sağlar. */
  const ensureMic = async (): Promise<void> => {
    const status = audio.getStatus()
    if (status.state === 'running' && status.mic) return
    if (!settings.get().capture.mic) settings.update({ capture: { ...settings.get().capture, mic: true } })
    if (!meeting && !wakeAlways()) {
      await ensureMicPermission()
      applySpeechConfig()
      await audio.start({ ...settings.get().capture, mic: true, system: false })
    } else await applyCapture()
    if (!audio.getStatus().mic) throw new Error('Mikrofon açılamadı. İzinleri kontrol edin.')
  }

  const setMeeting = async (on: boolean, by: 'user' | 'detector' = 'user'): Promise<void> => {
    if (meeting === on) return
    meeting = on
    meetingBy = by
    meetingApp = on ? detector.current : null
    if (on && settings.get().history.enabled) history.begin(meetingApp?.name ?? null)
    if (!on) history.end()
    // Her yeni toplantı: konuşmacı numaraları ve adları sıfırdan.
    if (on) people.reset()
    island.setListening(on)
    tray.refresh()
    await applyCapture()
  }
  const toggleListening = (): Promise<void> => setMeeting(!meeting)

  // ── Toplantı algılama: Teams/Zoom/… görüşmeye girince mikrofonu açar ──
  const detector = new MeetingDetector(() => audio.listProcesses())
  const captureStatus = (): CaptureStatus => ({ ...audio.getStatus(), meeting, detectedMeeting: detector.current?.name ?? null })
  detector.on('start', (app) => {
    tray.refresh()
    broadcast(IPC.captureStatus, captureStatus())
    if (meeting) return
    // Tarayıcıda mikrofon her zaman toplantı değildir (dikte vb.); otomatik modda bile sorulur.
    if (settings.get().meetingDetection === 'auto' && !app.browser) void setMeeting(true, 'detector')
    else island.showMeetingPrompt(app.name)
  })
  detector.on('end', () => {
    island.clearMeetingPrompt()
    if (meeting && meetingBy === 'detector') void setMeeting(false)
    tray.refresh()
    broadcast(IPC.captureStatus, captureStatus())
  })
  const syncDetector = (): void =>
    settings.get().meetingDetection === 'off' || !settings.get().onboarded ? detector.stop() : detector.start()

  const assistant = new Assistant({ llm, island, voice, transcripts, settings: getSettings, ensureMic, knowledge, gaps })
  island.on('saveFaq', (entry) => saveFaq(entry))
  assistant.on('answered', (answer) => history.addAnswer(answer))

  const toggleIsland = (): void => {
    if (!islandWindow) return
    if (islandWindow.isVisible()) islandWindow.hide()
    else islandWindow.showInactive()
  }

  const tray = new PiqiTray({
    isListening: () => meeting,
    detectedMeeting: () => detector.current?.name ?? null,
    productName: () => settings.get().product.name,
    toggleListening: () => void toggleListening(),
    openAsk: () => island.showAsk(),
    answerNow: () => assistant.answerNow(),
    toggleIsland,
    openMain: () => openMain(),
    quit: () => app.quit()
  })

  // ── Olay akışı: servisler → controller/tray → pencereler ──────────────
  audio.on('status', (status) => {
    if (status.state === 'error' && meeting) {
      meeting = false
      island.setListening(false)
    }
    tray.refresh()
    broadcast(IPC.captureStatus, { ...captureStatus(), ...status })
    publishHealth()
  })
  audio.on('levels', (levels) => broadcast(IPC.audioLevels, levels))
  audio.on('diarizer', (event) => people.setStatus(event.status, event.message))
  audio.on('speakers', (items) => people.setTalk(items))
  people.on('change', (state) => {
    island.setSpeakerCount(state.speakers.length)
    broadcast(IPC.peopleChanged, state)
  })
  ema.on('status', (status) => broadcast(IPC.ttsStatusChanged, status))
  const echo = new EchoFilter()
  audio.on('transcript', (event) => {
    if (event.channel === 'them' && event.final) echo.heardTheirs(event.text)
    // Hoparlörle yapılan toplantıda karşı tarafın sesi mikrofona sızar; aynı cümle "ben" olarak işlenmesin.
    if (meeting && event.channel === 'me' && event.final && echo.isEcho(event.text)) return
    if (event.channel === 'them' && event.speaker != null) people.heard(event.speaker)
    transcripts.add(event, people.label(event.speaker))
    if (meeting && event.final) {
      history.addLine({ t: event.t, channel: event.channel, speaker: event.channel === 'me' ? 'Ben' : people.label(event.speaker), text: event.text.trim() })
    }
    island.setTranscript(event)
    broadcast(IPC.transcript, event)
    if (event.channel === 'me') assistant.onMic(event)
    else assistant.onTheirs(event, people.label(event.speaker))
  })

  // "Selam Piqi": uygulama açılır ve soruyu dinler. "Görüşürüz Piqi": pencereler kapanır, toplantı dinlemesi biter.
  assistant.on('wake', () => openMain())
  assistant.on('sleep', () => {
    island.rest()
    getMainWindow()?.close()
    void setMeeting(false)
    void voice.shouldSpeak().then((ok) => {
      if (ok) void voice.say('Görüşürüz!')
    })
  })

  let hovering = false
  let askFocused = false
  island.on('snapshot', (snapshot) => {
    broadcast(IPC.islandSnapshot, snapshot)
    // ⌘⇧K kutusu klavye girişi ister: yalnızca o sırada Island odak alabilir.
    const wantsFocus = snapshot.view.kind === 'ask'
    if (!islandWindow || wantsFocus === askFocused) return
    askFocused = wantsFocus
    islandWindow.setFocusable(wantsFocus)
    if (wantsFocus) {
      islandWindow.setIgnoreMouseEvents(false)
      islandWindow.focus()
    } else {
      islandWindow.setIgnoreMouseEvents(!hovering, { forward: true })
      islandWindow.blur()
    }
  })

  island.on('action', (action: IslandAction) => {
    switch (action.type) {
      case 'toggleListening':
        void toggleListening()
        break
      case 'openMain':
        openMain(action.page)
        break
      case 'openAsk':
        assistant.cancel()
        island.showAsk()
        break
      case 'askSubmit':
        assistant.ask(action.request)
        break
      case 'askVoice':
        void assistant.askByVoice().catch((error) => console.warn('[piqi] sesli soru:', error))
        break
      case 'stopSpeaking':
        voice.stop()
        break
      case 'dismiss':
        assistant.cancel()
        break
      case 'meetingStart':
        void setMeeting(true, 'detector')
        break
      case 'feedback': {
        // Olumsuz geri bildirim: cevap yetersiz; soru doküman eksiklerine düşer.
        const answer = island.currentAnswer
        if (action.value === 'down' && answer) gaps.add({ question: answer.question, askedBy: answer.askedBy, reason: 'negative' })
        break
      }
    }
  })

  const captureKey = (s: Settings): string =>
    JSON.stringify([s.capture, s.speech.wakeWord, s.speech.alwaysListen, s.onboarded])
  let lastCapture = captureKey(settings.get())
  syncDetector()
  void refreshPermissions()
  // Kullanıcı izni Sistem Ayarları'ndan verip Piqi'ye döndüğünde fark et.
  app.on('browser-window-focus', () => void refreshPermissions())
  settings.on('change', (next: Settings) => {
    syncDetector()
    publishHealth()
    history.prune(next.history.retentionDays)
    const key = captureKey(next)
    // Yakalama ya da uyandırma ayarı değişti: dinlemeyi yeni ayarlarla yeniden kur.
    if (key !== lastCapture) void applyCapture()
    else applySpeechConfig()
    lastCapture = key
    islandWindow?.setContentProtection(next.hideInScreenShare)
    const info = productInfo()
    island.setProduct(info.productName, info.characterName)
    tray.refresh()
    broadcast(IPC.settingsChanged, next)
    broadcast(IPC.knowledgeChanged, knowledge.overview())
  })
  screen.on('display-metrics-changed', () => {
    void audio.screens().then((s) => island.setGeometry(geometryFrom(s))).catch(() => undefined)
  })

  // ── IPC ────────────────────────────────────────────────────────────────
  // Renderer'daki "Dinlemeye başla/durdur" toplantı dinlemesidir.
  ipcMain.handle(IPC.captureStart, async () => {
    await setMeeting(true)
    return captureStatus()
  })
  ipcMain.handle(IPC.captureStop, async () => {
    await setMeeting(false)
    return captureStatus()
  })
  ipcMain.handle(IPC.captureGetStatus, () => captureStatus())
  ipcMain.handle(IPC.captureListProcesses, () => audio.listProcesses())

  ipcMain.handle(IPC.islandGetSnapshot, () => island.get())
  ipcMain.on(IPC.islandSetHover, (_event, value: boolean) => {
    hovering = value
    if (!askFocused) islandWindow?.setIgnoreMouseEvents(!value, { forward: true })
    island.setHover(value)
  })
  ipcMain.on(IPC.islandAction, (_event, action: IslandAction) => island.handle(action))

  ipcMain.handle(IPC.settingsGet, () => settings.get())
  ipcMain.handle(IPC.settingsUpdate, (_event, patch: Partial<Settings>) => {
    const next = settings.update(patch)
    return next
  })

  ipcMain.handle(IPC.permissionsGet, async (): Promise<PermissionStatus> => {
    const p = await audio.permissions().catch(() => ({ mic: 'undetermined' as const, speech: 'undetermined' as const }))
    return { microphone: p.mic, speech: p.speech, speechRequired: speechPermissionNeeded }
  })
  ipcMain.handle(IPC.permissionsRequestMic, async () => {
    const result = await audio.requestMicPermission()
    await refreshPermissions()
    if (result === 'granted') void applyCapture()
    return result
  })
  ipcMain.handle(IPC.permissionsRequestSpeech, async () => {
    const result = await audio.requestSpeechPermission()
    await refreshPermissions()
    // İzin sonradan verildiyse tanımayı hemen kur; yeniden başlatma gerekmesin.
    if (result === 'granted') applySpeechConfig()
    return result
  })
  ipcMain.handle(IPC.permissionsTestSystemAudio, async () => {
    if (meeting) return { ok: audio.getStatus().system }
    // Toplantı sesini kısa süre yakala: izin ilk seferde burada sorulur; sonra önceki dinleme moduna dön.
    const status = await audio.start({ mic: false, system: true, bundleIds: [] })
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    const ok = audio.getStatus().system
    const error = audio.getStatus().errors.find((e) => e.startsWith('system:'))?.slice(7).trim()
    await audio.stop()
    await applyCapture()
    return { ok: ok && status.state !== 'error', error }
  })
  ipcMain.handle(IPC.healthGet, async () => {
    await refreshPermissions()
    return health()
  })
  ipcMain.on(IPC.permissionsOpenSystemSettings, (_event, pane: SystemSettingsPane) => {
    const anchor = { microphone: 'Privacy_Microphone', 'audio-capture': 'Privacy_AudioCapture', speech: 'Privacy_SpeechRecognition' }[pane]
    void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${anchor}`)
  })

  const providerStatuses = (): ProviderStatus[] => PROVIDER_PRESETS.map((p) => secrets.status(p.id))
  ipcMain.handle(IPC.providerGetStatus, () => providerStatuses())
  ipcMain.handle(IPC.providerSetApiKey, (_event, providerId: string, key: string | null) => {
    secrets.setApiKey(providerId, key)
    publishHealth()
    return providerStatuses()
  })
  ipcMain.handle(IPC.providerTest, () => llm.test())
  ipcMain.handle(IPC.providerListModels, (_event, providerId: string) => llm.listModels(providerId))

  ipcMain.handle(IPC.policyGet, () => policy.status(settings.get()))
  ipcMain.handle(IPC.auditRecent, () => audit.recent(100))
  ipcMain.on(IPC.auditReveal, () => void shell.openPath(join(userData, 'audit')))

  ipcMain.handle(IPC.ttsStatus, () => ema.status())
  ipcMain.handle(IPC.ttsInstallEma, async () => {
    await ema.install().catch(() => undefined)
    return ema.status()
  })

  ipcMain.handle(IPC.peopleGet, () => people.get())
  ipcMain.on(IPC.peopleRename, (_event, id: number, name: string) => people.rename(id, name))

  ipcMain.handle(IPC.voiceList, () => audio.voices())
  ipcMain.on(IPC.voicePreview, (_event, text: string) => void voice.say(text))

  ipcMain.on(IPC.assistantAsk, (_event, request: AskRequest) => assistant.ask(request))

  // ── Bilgi bankası ──────────────────────────────────────────────────────
  ipcMain.handle(IPC.knowledgeOverview, () => knowledge.overview())
  ipcMain.handle(IPC.knowledgeScanCode, (_e, input: { root?: string; gitUrl?: string; branch?: string; respectGitignore: boolean }) =>
    knowledge.scanCode(input, input.respectGitignore)
  )
  ipcMain.handle(IPC.knowledgeGitBranches, (_e, url: string) => knowledge.gitBranches(url))
  ipcMain.handle(IPC.knowledgeTotals, (_e, root: string, folders: FolderScan[]) => knowledge.totals(root, folders))
  ipcMain.handle(IPC.knowledgeTriage, (_e, root: string, note: string) => knowledge.triage(root, note))
  ipcMain.handle(IPC.knowledgeCardEstimate, (_e, files: number) => knowledge.cardEstimate(files))
  ipcMain.handle(IPC.knowledgeScanFiles, (_e, paths: string[]) => knowledge.scanFiles(paths))
  ipcMain.handle(IPC.knowledgeAdd, (_e, request: NewSource) => knowledge.add(request))
  ipcMain.on(IPC.knowledgeUpdate, (_e, id: string, patch: Parameters<KnowledgeService['update']>[1]) => knowledge.update(id, patch))
  ipcMain.on(IPC.knowledgeReindex, (_e, id: string) => knowledge.reindex(id))
  ipcMain.on(IPC.knowledgeRemove, (_e, id: string) => void knowledge.remove(id))
  ipcMain.handle(IPC.knowledgeSearch, (_e, question: string) => knowledge.search(question, 8))
  ipcMain.handle(IPC.knowledgeTactics, () => knowledge.tactics())
  ipcMain.on(IPC.knowledgeApplyTactic, (_e, action: NonNullable<Tactic['action']>) => {
    if (action === 'onprem') openMain('settings/models')
    else knowledge.applyTactic(action)
  })
  ipcMain.handle(IPC.faqList, () => knowledge.faq())
  ipcMain.handle(IPC.faqSave, (_e, entry: { id?: string; question: string; answer: string }) => {
    saveFaq(entry)
    return knowledge.faq()
  })
  ipcMain.handle(IPC.meetingsList, () => history.list())
  ipcMain.handle(IPC.meetingGet, (_e, id: string) => history.get(id))
  ipcMain.handle(IPC.meetingDelete, (_e, id: string) => {
    history.delete(id)
    return history.list()
  })
  ipcMain.on(IPC.meetingResummarize, (_e, id: string) => void history.summarize(id))
  ipcMain.handle(IPC.gapsList, () => gaps.list())
  ipcMain.handle(IPC.gapsRemove, (_e, id: string) => {
    gaps.remove(id)
    return gaps.list()
  })
  ipcMain.handle(IPC.faqDelete, (_e, id: string) => {
    knowledge.deleteFaq(id)
    return knowledge.faq()
  })
  ipcMain.handle(IPC.dialogPick, async (event, kind: 'files' | 'folder') => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters:
        kind === 'files'
          ? [
              {
                name: 'Dokümanlar ve görseller',
                extensions: ['pdf', 'docx', 'pptx', 'xlsx', 'md', 'txt', 'html', 'htm', 'csv', 'odt', 'rtf', ...IMAGE_EXT]
              }
            ]
          : undefined
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })


  // ── Global kısayollar (PRD §6.4) ──────────────────────────────────────
  const shortcuts: Record<string, () => void> = {
    'CommandOrControl+Shift+L': () => void toggleListening(),
    'CommandOrControl+Shift+K': () => {
      if (island.view.kind === 'ask') island.rest()
      else {
        assistant.cancel()
        island.showAsk()
      }
    },
    // Karşı tarafın son sorusunu hemen cevapla (otomatik cevap kapalı ya da atlanmış olsa da).
    'CommandOrControl+Shift+Space': () => assistant.answerNow(),
    'CommandOrControl+Shift+E': () => island.handle({ type: 'toggleExpand' }),
    'CommandOrControl+Shift+C': () => island.handle({ type: 'copy' }),
    'CommandOrControl+Shift+H': toggleIsland
  }
  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accelerator, handler)) {
      console.warn(`[piqi] kısayol kaydedilemedi (başka uygulama kullanıyor olabilir): ${accelerator}`)
    }
  }

  // Uygulama açılır açılmaz "Selam Piqi"yi dinlemeye başla (yalnızca mikrofon).
  void applyCapture().catch((error) => console.warn('[piqi] uyandırma dinlemesi başlatılamadı:', error))

  islandWindow = createIslandWindow(settings.get().hideInScreenShare)
  islandWindow.on('closed', () => {
    islandWindow = null
  })

  openMain()

  app.on('before-quit', () => {
    globalShortcut.unregisterAll()
    // Kapanışta "görüşme bitti" olayı yakalamayı yeniden kurmaya çalışmasın.
    detector.removeAllListeners()
    detector.stop()
    history.flush()
    audio.dispose()
    ema.dispose()
    knowledge.dispose()
  })
})

app.on('second-instance', () => openMain())
// Menü çubuğu uygulaması: pencereler kapansa da çalışmaya devam eder.
app.on('window-all-closed', () => undefined)
