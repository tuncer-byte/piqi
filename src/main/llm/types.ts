import type { z } from 'zod'
import type { Effort, ModelInfo } from '@shared/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  system: string
  messages: ChatMessage[]
  model: string
  effort: Effort
  maxTokens: number
  signal?: AbortSignal
}

/** Her LLM sağlayıcısının uyguladığı ortak arayüz. */
export interface ChatProvider {
  /** Yanıtı parça parça akıtır; tam metni döner. */
  stream(request: ChatRequest, onText: (delta: string) => void): Promise<string>
  /** Verilen şemaya uyan JSON üretir (doğrulanmamış; LlmService zod ile doğrular). */
  json(request: ChatRequest, schema: { name: string; jsonSchema: Record<string, unknown>; zod: z.ZodType }): Promise<unknown>
  /** Sağlayıcının sunduğu sohbet modelleri. */
  listModels(): Promise<ModelInfo[]>
}

export type LlmErrorCode = 'no_key' | 'auth' | 'rate_limit' | 'network' | 'refusal' | 'parse' | 'policy' | 'api'

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string
  ) {
    super(message)
  }
}

/** Model JSON'u bazen ```json bloğu içinde döner; içindekini ayıklar. */
export function parseJsonText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = (fenced ? fenced[1]! : text).trim()
  const start = body.search(/[[{]/)
  try {
    return JSON.parse(start > 0 ? body.slice(start) : body)
  } catch {
    throw new LlmError('parse', 'Model beklenen biçimde (JSON) cevap vermedi.')
  }
}
