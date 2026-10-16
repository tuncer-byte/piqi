import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { IPC, type PiqiApi, type Unsubscribe } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PiqiApi = {
  capture: {
    start: () => ipcRenderer.invoke(IPC.captureStart),
    stop: () => ipcRenderer.invoke(IPC.captureStop),
    getStatus: () => ipcRenderer.invoke(IPC.captureGetStatus),
    listProcesses: () => ipcRenderer.invoke(IPC.captureListProcesses),
    onStatus: (cb) => subscribe(IPC.captureStatus, cb),
    onLevels: (cb) => subscribe(IPC.audioLevels, cb),
    onTranscript: (cb) => subscribe(IPC.transcript, cb)
  },
  island: {
    getSnapshot: () => ipcRenderer.invoke(IPC.islandGetSnapshot),
    onSnapshot: (cb) => subscribe(IPC.islandSnapshot, cb),
    setHover: (hovering) => ipcRenderer.send(IPC.islandSetHover, hovering),
    action: (action) => ipcRenderer.send(IPC.islandAction, action),
    showDemo: () => ipcRenderer.send(IPC.islandDemo)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
    onChange: (cb) => subscribe(IPC.settingsChanged, cb)
  },
  permissions: {
    get: () => ipcRenderer.invoke(IPC.permissionsGet),
    requestMicrophone: () => ipcRenderer.invoke(IPC.permissionsRequestMic),
    requestSpeech: () => ipcRenderer.invoke(IPC.permissionsRequestSpeech),
    openSystemSettings: (pane) => ipcRenderer.send(IPC.permissionsOpenSystemSettings, pane)
  },
  provider: {
    getStatus: () => ipcRenderer.invoke(IPC.providerGetStatus),
    setApiKey: (providerId, key) => ipcRenderer.invoke(IPC.providerSetApiKey, providerId, key),
    test: () => ipcRenderer.invoke(IPC.providerTest),
    listModels: (providerId) => ipcRenderer.invoke(IPC.providerListModels, providerId)
  },
  policy: {
    get: () => ipcRenderer.invoke(IPC.policyGet),
    recentAudit: () => ipcRenderer.invoke(IPC.auditRecent),
    revealAudit: () => ipcRenderer.send(IPC.auditReveal)
  },
  tts: {
    status: () => ipcRenderer.invoke(IPC.ttsStatus),
    installEma: () => ipcRenderer.invoke(IPC.ttsInstallEma),
    onStatus: (cb) => subscribe(IPC.ttsStatusChanged, cb)
  },
  people: {
    get: () => ipcRenderer.invoke(IPC.peopleGet),
    rename: (id, name) => ipcRenderer.send(IPC.peopleRename, id, name),
    onChange: (cb) => subscribe(IPC.peopleChanged, cb)
  },
  voice: {
    list: () => ipcRenderer.invoke(IPC.voiceList),
    preview: (text) => ipcRenderer.send(IPC.voicePreview, text)
  },
  assistant: {
    ask: (request) => ipcRenderer.send(IPC.assistantAsk, request)
  },
  app: {
    onNavigate: (cb) => subscribe(IPC.navigate, cb)
  },
  knowledge: {
    overview: () => ipcRenderer.invoke(IPC.knowledgeOverview),
    onChange: (cb) => subscribe(IPC.knowledgeChanged, cb),
    scanCode: (input) => ipcRenderer.invoke(IPC.knowledgeScanCode, input),
    gitBranches: (url) => ipcRenderer.invoke(IPC.knowledgeGitBranches, url),
    totals: (root, folders) => ipcRenderer.invoke(IPC.knowledgeTotals, root, folders),
    triage: (root, note) => ipcRenderer.invoke(IPC.knowledgeTriage, root, note),
    cardEstimate: (files) => ipcRenderer.invoke(IPC.knowledgeCardEstimate, files),
    scanFiles: (paths) => ipcRenderer.invoke(IPC.knowledgeScanFiles, paths),
    add: (request) => ipcRenderer.invoke(IPC.knowledgeAdd, request),
    update: (id, patch) => ipcRenderer.send(IPC.knowledgeUpdate, id, patch),
    reindex: (id) => ipcRenderer.send(IPC.knowledgeReindex, id),
    remove: (id) => ipcRenderer.send(IPC.knowledgeRemove, id),
    search: (question) => ipcRenderer.invoke(IPC.knowledgeSearch, question),
    tactics: () => ipcRenderer.invoke(IPC.knowledgeTactics),
    applyTactic: (action) => ipcRenderer.send(IPC.knowledgeApplyTactic, action),
    faq: () => ipcRenderer.invoke(IPC.faqList),
    saveFaq: (entry) => ipcRenderer.invoke(IPC.faqSave, entry),
    deleteFaq: (id) => ipcRenderer.invoke(IPC.faqDelete, id),
    pick: (kind) => ipcRenderer.invoke(IPC.dialogPick, kind),
    pathForFile: (file) => webUtils.getPathForFile(file)
  }
}

contextBridge.exposeInMainWorld('piqi', api)
