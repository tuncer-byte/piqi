import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from '@google/genai'
import type { Effort, ModelInfo } from '@shared/types'
import { presetById } from '@shared/providers'
import { LlmError, parseJsonText, type ChatProvider, type ChatRequest } from '../types'

const LEVEL: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH
}

export class GeminiProvider implements ChatProvider {
  private readonly ai: GoogleGenAI
  /** Düşünme seviyesini desteklemeyen modeller (ilk hatadan sonra bir daha gönderilmez). */
  private noThinking = new Set<string>()

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey })
  }

  async stream(request: ChatRequest, onText: (delta: string) => void): Promise<string> {
    return this.withThinkingFallback(request, async (config) => {
      const stream = await this.ai.models.generateContentStream({
        model: request.model,
        contents: contents(request),
        config
      })
      let text = ''
      for await (const chunk of stream) {
        const delta = chunk.text ?? ''
        if (delta) {
          text += delta
          onText(delta)
        }
      }
      return text
    })
  }

  async json(request: ChatRequest, schema: { jsonSchema: Record<string, unknown> }): Promise<unknown> {
    const text = await this.withThinkingFallback(request, async (config) => {
      const response = await this.ai.models.generateContent({
        model: request.model,
        contents: contents(request),
        config: { ...config, responseMimeType: 'application/json', responseJsonSchema: schema.jsonSchema }
      })
      return response.text ?? ''
    })
    return parseJsonText(text)
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const pager = await this.ai.models.list()
      const models: ModelInfo[] = []
      for await (const model of pager) {
        const id = model.name?.replace(/^models\//, '')
        if (!id || !model.supportedActions?.includes('generateContent')) continue
        // Görsel, ses (TTS/Live) ve gömme modelleri sohbet için uygun değil.
        if (/image|tts|live|embedding|aqa|banana|veo|imagen/i.test(id)) continue
        models.push({ id, label: model.displayName ?? id, note: model.description?.slice(0, 80) })
      }
      return models.length ? models : presetById('gemini')!.models
    } catch {
      return presetById('gemini')!.models
    }
  }

  private async withThinkingFallback(
    request: ChatRequest,
    run: (config: GenerateContentConfig) => Promise<string>
  ): Promise<string> {
    const base: GenerateContentConfig = {
      systemInstruction: request.system,
      maxOutputTokens: request.maxTokens,
      abortSignal: request.signal
    }
    const thinking = !this.noThinking.has(request.model)
    try {
      return await run(thinking ? { ...base, thinkingConfig: { thinkingLevel: LEVEL[request.effort] } } : base)
    } catch (error) {
      // Bazı modeller düşünme seviyesini desteklemez: bir kez onsuz dene.
      if (thinking && error instanceof ApiError && error.status === 400 && /think/i.test(error.message)) {
        this.noThinking.add(request.model)
        return this.withThinkingFallback(request, run)
      }
      throw toLlmError(error)
    }
  }
}

function contents(request: ChatRequest) {
  return request.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [...(m.images ?? []).map((image) => ({ inlineData: { mimeType: image.mediaType, data: image.data } })), { text: m.content }]
  }))
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return new LlmError('auth', 'Gemini API anahtarı geçersiz veya yetkisiz.')
    if (error.status === 429) return new LlmError('rate_limit', 'Gemini kota/hız sınırına takıldı.')
    return new LlmError('api', `Gemini hatası (${error.status}): ${error.message}`)
  }
  const message = (error as Error)?.message ?? String(error)
  if (/fetch failed|ENOTFOUND|ECONN/i.test(message)) return new LlmError('network', 'Google’a bağlanılamadı.')
  return new LlmError('api', message)
}
