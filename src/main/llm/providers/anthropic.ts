import Anthropic from '@anthropic-ai/sdk'
import type { ModelInfo } from '@shared/types'
import { presetById } from '@shared/providers'
import { LlmError, parseJsonText, type ChatProvider, type ChatRequest } from '../types'

// Güvenlik sınıflandırıcısı bir isteği reddederse API isteği uygun bir modelde yeniden çalıştırır.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** Haiku 4.5 effort ve uyarlanabilir düşünmeyi desteklemez; sunucu taraflı yedek de yalnızca güncel modellerde. */
const isLegacy = (model: string): boolean => model.startsWith('claude-haiku')

export class AnthropicProvider implements ChatProvider {
  private readonly client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async stream(request: ChatRequest, onText: (delta: string) => void): Promise<string> {
    try {
      const stream = this.client.beta.messages.stream(this.params(request), { signal: request.signal })
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text)
      }
      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') throw new LlmError('refusal', 'Model bu isteği yanıtlamadı.')
      return message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    } catch (error) {
      throw toLlmError(error)
    }
  }

  async json(request: ChatRequest, schema: { jsonSchema: Record<string, unknown> }): Promise<unknown> {
    try {
      const base = this.params(request)
      const response = await this.client.beta.messages.create(
        {
          ...base,
          stream: false,
          output_config: {
            ...base.output_config,
            format: { type: 'json_schema', schema: schema.jsonSchema }
          }
        },
        { signal: request.signal }
      )
      if (response.stop_reason === 'refusal') throw new LlmError('refusal', 'Model bu isteği yanıtlamadı.')
      return parseJsonText(response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
    } catch (error) {
      throw toLlmError(error)
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const models: ModelInfo[] = []
      for await (const model of this.client.models.list()) models.push({ id: model.id, label: model.display_name })
      return models
    } catch {
      return presetById('anthropic')!.models
    }
  }

  private params(request: ChatRequest) {
    const legacy = isLegacy(request.model)
    return {
      model: request.model,
      max_tokens: request.maxTokens,
      ...(legacy ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
      output_config: legacy ? {} : { effort: request.effort },
      // Ürün talimatı gibi sabit kısım önbelleğe alınır; değişken bağlam mesajlarda durur.
      system: [{ type: 'text' as const, text: request.system, cache_control: { type: 'ephemeral' as const } }],
      messages: request.messages.map((m) =>
        m.images?.length
          ? {
              role: m.role,
              content: [
                ...m.images.map((image) => ({
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: image.mediaType, data: image.data }
                })),
                { type: 'text' as const, text: m.content }
              ]
            }
          : { role: m.role, content: m.content }
      )
    }
  }
}

function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  if (error instanceof Anthropic.AuthenticationError) return new LlmError('auth', 'Anthropic API anahtarı geçersiz.')
  if (error instanceof Anthropic.PermissionDeniedError) return new LlmError('auth', 'Bu anahtarın modele erişimi yok.')
  if (error instanceof Anthropic.RateLimitError) return new LlmError('rate_limit', 'Hız sınırına takıldı, biraz sonra tekrar deneyin.')
  if (error instanceof Anthropic.APIConnectionError) return new LlmError('network', 'Anthropic’e bağlanılamadı.')
  if (error instanceof Anthropic.APIError) return new LlmError('api', `Anthropic hatası (${error.status}): ${error.message}`)
  return new LlmError('api', (error as Error)?.message ?? String(error))
}
