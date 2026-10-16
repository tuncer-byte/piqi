import OpenAI from 'openai'
import type { ModelInfo } from '@shared/types'
import type { ProviderPreset } from '@shared/providers'
import { LlmError, parseJsonText, type ChatProvider, type ChatRequest } from '../types'

/**
 * OpenAI Chat Completions uyumlu her uç nokta: OpenAI, Qwen (QwenCloud), DeepSeek, Mistral,
 * Ollama ve bankanın kendi veri merkezindeki vLLM / LM Studio sunucuları.
 */
export class OpenAICompatibleProvider implements ChatProvider {
  private readonly client: OpenAI
  /** json_schema desteklemeyen sunucular için json_object'e düşülür. */
  private schemaUnsupported = false

  constructor(
    private readonly preset: ProviderPreset,
    baseURL: string,
    apiKey: string | null
  ) {
    // Anahtarsız yerel sunucular (Ollama) da bir değer bekler.
    this.client = new OpenAI({ baseURL, apiKey: apiKey ?? 'piqi-local', maxRetries: 1 })
  }

  async stream(request: ChatRequest, onText: (delta: string) => void): Promise<string> {
    try {
      const stream = await this.client.chat.completions.create(
        { model: request.model, messages: this.messages(request), max_tokens: request.maxTokens, stream: true },
        { signal: request.signal }
      )
      let text = ''
      const filter = new ThinkFilter()
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? ''
        if (!delta) continue
        text += delta
        const visible = filter.push(delta)
        if (visible) onText(visible)
      }
      return stripThinking(text)
    } catch (error) {
      throw this.toLlmError(error)
    }
  }

  async json(request: ChatRequest, schema: { name: string; jsonSchema: Record<string, unknown> }): Promise<unknown> {
    const instruction = `Yalnızca şu JSON şemasına uyan tek bir JSON nesnesi döndür:\n${JSON.stringify(schema.jsonSchema)}`
    const messages = this.messages({ ...request, system: `${request.system}\n\n${instruction}` })
    const run = async (structured: boolean): Promise<string> => {
      const response = await this.client.chat.completions.create(
        {
          model: request.model,
          messages,
          max_tokens: request.maxTokens,
          response_format: structured
            ? { type: 'json_schema', json_schema: { name: schema.name, schema: schema.jsonSchema } }
            : { type: 'json_object' }
        },
        { signal: request.signal }
      )
      return response.choices[0]?.message?.content ?? ''
    }
    try {
      if (!this.schemaUnsupported) {
        try {
          return parseJsonText(stripThinking(await run(true)))
        } catch (error) {
          if (!(error instanceof OpenAI.BadRequestError)) throw error
          this.schemaUnsupported = true
        }
      }
      return parseJsonText(stripThinking(await run(false)))
    } catch (error) {
      throw this.toLlmError(error)
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const models: ModelInfo[] = []
      for await (const model of this.client.models.list()) {
        if (/embed|whisper|tts|dall-e|image|audio|moderation|rerank/i.test(model.id)) continue
        models.push({ id: model.id, label: model.id })
      }
      return models.length ? models.sort((a, b) => a.id.localeCompare(b.id)) : this.preset.models
    } catch {
      return this.preset.models
    }
  }

  private messages(request: ChatRequest): OpenAI.Chat.ChatCompletionMessageParam[] {
    return [{ role: 'system', content: request.system }, ...request.messages]
  }

  private toLlmError(error: unknown): LlmError {
    const name = this.preset.name
    if (error instanceof LlmError) return error
    if (error instanceof OpenAI.AuthenticationError) return new LlmError('auth', `${name} anahtarı geçersiz.`)
    if (error instanceof OpenAI.PermissionDeniedError) return new LlmError('auth', `${name}: bu modele erişim yok.`)
    if (error instanceof OpenAI.RateLimitError) return new LlmError('rate_limit', `${name} hız sınırına takıldı.`)
    if (error instanceof OpenAI.NotFoundError) return new LlmError('api', `${name}: model bulunamadı. Model listesini yenileyin.`)
    if (error instanceof OpenAI.APIConnectionError) {
      return new LlmError(
        'network',
        this.preset.location === 'onprem' ? `${name} sunucusuna ulaşılamadı. Adresi ve ağı kontrol edin.` : `${name}’e bağlanılamadı.`
      )
    }
    if (error instanceof OpenAI.APIError) return new LlmError('api', `${name} hatası (${error.status}): ${error.message}`)
    return new LlmError('api', (error as Error)?.message ?? String(error))
  }
}

/** Qwen3 gibi modellerin <think>…</think> bölümlerini cevaptan ayıklar. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()
}

/** Akış sırasında <think>…</think> içeriğini gizler; etiketler parçalara bölünse de çalışır. */
export class ThinkFilter {
  private buffer = ''
  private inside = false

  push(delta: string): string {
    this.buffer += delta
    let out = ''
    for (;;) {
      if (this.inside) {
        const end = this.buffer.indexOf('</think>')
        if (end === -1) {
          this.buffer = this.buffer.slice(-8)
          return out
        }
        this.buffer = this.buffer.slice(end + 8).replace(/^\s+/, '')
        this.inside = false
      } else {
        const start = this.buffer.indexOf('<think>')
        if (start === -1) {
          // Sonda yarım kalmış olası bir "<thi" etiketini beklet.
          const partial = this.buffer.lastIndexOf('<')
          const keep = partial !== -1 && '<think>'.startsWith(this.buffer.slice(partial)) ? partial : this.buffer.length
          out += this.buffer.slice(0, keep)
          this.buffer = this.buffer.slice(keep)
          return out
        }
        out += this.buffer.slice(0, start)
        this.buffer = this.buffer.slice(start + 7)
        this.inside = true
      }
    }
  }
}
