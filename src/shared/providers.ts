// LLM sağlayıcı hazır ayarları. Üç adaptör tüm sağlayıcıları karşılar:
//   anthropic → Claude · gemini → Google Gemini · openai → OpenAI uyumlu her uç nokta
//   (OpenAI, Qwen/QwenCloud, DeepSeek, Mistral, Ollama, kurum içi vLLM/LM Studio …)

export type ProviderKind = 'anthropic' | 'gemini' | 'openai'
/** Veri nereye gidiyor: bulut sağlayıcısı mı, kurumun/bu Mac'in kendi sunucusu mu. */
export type ProviderLocation = 'cloud' | 'onprem'

export interface ProviderPreset {
  id: string
  kind: ProviderKind
  name: string
  location: ProviderLocation
  baseUrl?: string
  /** Kullanıcının uç nokta adresini girmesi gerekir (kurum içi). */
  customUrl?: boolean
  keyRequired: boolean
  keyHint?: string
  /** Liste API'si çalışmazsa önerilen modeller (ilk öğe varsayılan). */
  models: { id: string; label: string; note?: string }[]
  docs?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    kind: 'anthropic',
    name: 'Anthropic Claude',
    location: 'cloud',
    keyRequired: true,
    keyHint: 'sk-ant-…',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'en isabetli' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'hızlı ve dengeli' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'en hızlı' }
    ],
    docs: 'console.anthropic.com'
  },
  {
    id: 'gemini',
    kind: 'gemini',
    name: 'Google Gemini',
    location: 'cloud',
    keyRequired: true,
    keyHint: 'AIza…',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'önerilen' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'en güçlü' },
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'en hızlı/ucuz' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (önizleme)' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (önizleme)' }
    ],
    docs: 'aistudio.google.com'
  },
  {
    id: 'qwen',
    kind: 'openai',
    name: 'Qwen (QwenCloud)',
    location: 'cloud',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyRequired: true,
    keyHint: 'sk-…',
    models: [
      { id: 'qwen3.6-plus', label: 'Qwen 3.6 Plus', note: 'en güçlü' },
      { id: 'qwen3.6-flash', label: 'Qwen 3.6 Flash', note: 'hızlı' },
      { id: 'qwen3.5-plus', label: 'Qwen 3.5 Plus' },
      { id: 'qwen3.5-flash', label: 'Qwen 3.5 Flash' },
      { id: 'qwen3-max', label: 'Qwen 3 Max' }
    ],
    docs: 'Alibaba Cloud Model Studio'
  },
  {
    id: 'openai',
    kind: 'openai',
    name: 'OpenAI',
    location: 'cloud',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    keyHint: 'sk-…',
    models: []
  },
  {
    id: 'deepseek',
    kind: 'openai',
    name: 'DeepSeek',
    location: 'cloud',
    baseUrl: 'https://api.deepseek.com/v1',
    keyRequired: true,
    models: []
  },
  {
    id: 'mistral',
    kind: 'openai',
    name: 'Mistral',
    location: 'cloud',
    baseUrl: 'https://api.mistral.ai/v1',
    keyRequired: true,
    models: []
  },
  {
    id: 'ollama',
    kind: 'openai',
    name: 'Ollama (bu Mac)',
    location: 'onprem',
    baseUrl: 'http://localhost:11434/v1',
    keyRequired: false,
    models: [
      { id: 'qwen3:8b', label: 'Qwen 3 8B' },
      { id: 'qwen3:30b-a3b', label: 'Qwen 3 30B-A3B' }
    ],
    docs: 'ollama.com — örn. `ollama pull qwen3:8b`'
  },
  {
    id: 'onprem',
    kind: 'openai',
    name: 'Kurum içi sunucu (vLLM / OpenAI uyumlu)',
    location: 'onprem',
    customUrl: true,
    keyRequired: false,
    keyHint: 'isteğe bağlı',
    models: [],
    docs: 'Bankanın veri merkezindeki model sunucusu, örn. https://llm.kurum.local/v1'
  }
]

export function presetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
