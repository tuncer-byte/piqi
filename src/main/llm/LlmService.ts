import { z } from 'zod'
import type { AuditEntry, Effort, ModelInfo, Settings } from '@shared/types'
import { presetById, type ProviderPreset } from '@shared/providers'
import type { PolicyService } from '../PolicyService'
import type { SecretStore } from '../SecretStore'
import type { AuditLog } from './AuditLog'
import { Masker, StreamUnmasker } from './pii'
import { AnthropicProvider } from './providers/anthropic'
import { GeminiProvider } from './providers/gemini'
import { OpenAICompatibleProvider } from './providers/openaiCompatible'
import { LlmError, type ChatMessage, type ChatProvider, type ChatRequest } from './types'

export { LlmError } from './types'
export type { ChatMessage } from './types'

interface BaseRequest {
  system: string
  messages: ChatMessage[]
  purpose: AuditEntry['purpose']
  /** Bu istek için farklı model (ör. kod kartları için ekonomik model). Yoksa ayarlardaki model. */
  model?: { providerId: string; id: string }
  effort?: Effort
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * Tüm LLM çağrılarının tek kapısı. Seçili sağlayıcıya yönlendirir ve her çağrıda sırasıyla:
 * kurumsal politikayı denetler → buluta gidecekse kişisel verileri maskeler → cevabı geri çevirir →
 * içeriksiz denetim kaydı yazar.
 */
export class LlmService {
  private cache = new Map<string, ChatProvider>()

  constructor(
    private readonly secrets: SecretStore,
    private readonly settings: () => Settings,
    private readonly policy: PolicyService,
    private readonly audit: AuditLog
  ) {}

  async streamText(request: BaseRequest & { onText: (delta: string) => void }): Promise<string> {
    return this.call(request, async (provider, masked, masker) => {
      const unmasker = masker ? new StreamUnmasker(masker) : null
      const text = await provider.stream(masked, (delta) => {
        const visible = unmasker ? unmasker.push(delta) : delta
        if (visible) request.onText(visible)
      })
      const rest = unmasker?.flush()
      if (rest) request.onText(rest)
      return masker ? masker.unmask(text) : text
    })
  }

  async json<T>(request: BaseRequest & { schema: z.ZodType<T>; name: string }): Promise<T> {
    const jsonSchema = toJsonSchema(request.schema)
    return this.call(request, async (provider, masked, masker) => {
      const raw = await provider.json(masked, { name: request.name, jsonSchema, zod: request.schema })
      const parsed = request.schema.safeParse(masker ? unmaskDeep(raw, masker) : raw)
      if (!parsed.success) throw new LlmError('parse', 'Model beklenen biçimde cevap vermedi.')
      return parsed.data
    })
  }

  /** Etkin model nereye gidiyor ve politika izin veriyor mu (ör. görsel analizini önceden bildirmek için). */
  target(): { name: string; model: string; location: 'cloud' | 'onprem'; blocked: string | null } | null {
    const settings = this.settings()
    const preset = presetById(settings.model.providerId)
    if (!preset) return null
    return { name: preset.name, model: settings.model.id, location: preset.location, blocked: this.policy.check(settings, preset.id) }
  }

  async listModels(providerId: string): Promise<ModelInfo[]> {
    const preset = presetById(providerId)
    if (!preset) return []
    try {
      return await this.provider(preset).listModels()
    } catch {
      return preset.models
    }
  }

  /** Seçili sağlayıcı ve modeli küçük bir istekle doğrular. */
  async test(): Promise<{ ok: boolean; message: string }> {
    const { model } = this.settings()
    try {
      const text = await this.streamText({
        system: 'Kısa cevap ver.',
        messages: [{ role: 'user', content: 'Sadece "tamam" yaz.' }],
        purpose: 'test',
        maxTokens: 2_000,
        onText: () => undefined
      })
      return { ok: true, message: `Bağlantı başarılı (${presetById(model.providerId)?.name} · ${model.id}): ${text.trim().slice(0, 40)}` }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  }

  private async call<T>(
    request: BaseRequest,
    run: (provider: ChatProvider, request: ChatRequest, masker: Masker | null) => Promise<T>
  ): Promise<T> {
    const settings = this.settings()
    const model = request.model ? { ...settings.model, ...request.model } : settings.model
    const preset = presetById(model.providerId)
    if (!preset) throw new LlmError('api', 'Model sağlayıcısı seçilmemiş. Ayarlar → Modeller ve sağlayıcılar.')
    const blocked = this.policy.check(settings, preset.id)
    if (blocked) throw new LlmError('policy', blocked)

    const policy = this.policy.status(settings).effective
    const masker = preset.location === 'cloud' && policy.maskPII ? new Masker() : null
    const chat: ChatRequest = {
      system: masker ? masker.mask(request.system) : request.system,
      // Metin maskelenir; görsel içeriği maskelenemez (politika denetimi yine uygulanır).
      messages: request.messages.map((m) => ({ ...m, content: masker ? masker.mask(m.content) : m.content })),
      model: model.id,
      effort: request.effort ?? model.effort,
      maxTokens: request.maxTokens ?? 16_000,
      signal: request.signal
    }

    const started = Date.now()
    let output = ''
    let error: unknown = null
    try {
      const result = await run(this.provider(preset), chat, masker)
      output = typeof result === 'string' ? result : JSON.stringify(result)
      return result
    } catch (e) {
      error = e
      throw e
    } finally {
      if (policy.audit && !request.signal?.aborted) {
        this.audit.append({
          ts: started,
          purpose: request.purpose,
          provider: preset.id,
          model: model.id,
          location: preset.location,
          inputChars: chat.system.length + chat.messages.reduce((n, m) => n + m.content.length, 0),
          outputChars: output.length,
          masked: masker?.counts() ?? {},
          images: chat.messages.reduce((n, m) => n + (m.images?.length ?? 0), 0) || undefined,
          ms: Date.now() - started,
          ok: error == null,
          error: error ? (error as Error).message : undefined
        })
      }
    }
  }

  private provider(preset: ProviderPreset): ChatProvider {
    const key = this.secrets.getApiKey(preset.id)
    if (preset.keyRequired && !key) {
      throw new LlmError('no_key', `${preset.name} için API anahtarı yok. Ayarlar → Modeller ve sağlayıcılar’dan ekleyin.`)
    }
    const baseUrl = this.settings().providers[preset.id]?.baseUrl || preset.baseUrl
    if (preset.kind === 'openai' && !baseUrl) {
      throw new LlmError('api', `${preset.name} için sunucu adresi girilmemiş.`)
    }
    const cacheKey = `${preset.id}|${key ?? ''}|${baseUrl ?? ''}`
    let provider = this.cache.get(cacheKey)
    if (!provider) {
      provider =
        preset.kind === 'anthropic'
          ? new AnthropicProvider(key!)
          : preset.kind === 'gemini'
            ? new GeminiProvider(key!)
            : new OpenAICompatibleProvider(preset, baseUrl!, key)
      this.cache.set(cacheKey, provider)
    }
    return provider
  }
}

/** zod şemasını sağlayıcıların kabul ettiği sade JSON Schema'ya çevirir. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean)
    if (!node || typeof node !== 'object') return node
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) if (k !== '$schema') out[k] = clean(v)
    if (out['type'] === 'object' && !('additionalProperties' in out)) out['additionalProperties'] = false
    return out
  }
  return clean(json) as Record<string, unknown>
}

function unmaskDeep(value: unknown, masker: Masker): unknown {
  if (typeof value === 'string') return masker.unmask(value)
  if (Array.isArray(value)) return value.map((v) => unmaskDeep(v, masker))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unmaskDeep(v, masker)]))
  }
  return value
}
