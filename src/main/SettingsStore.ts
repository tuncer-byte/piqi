import { EventEmitter } from 'node:events'
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Product, Settings } from '@shared/types'
import { newProduct } from '@shared/products'

export const DEFAULT_MODEL = 'claude-opus-5-5'

export function defaultSettings(): Settings {
  const product = newProduct('Genel')
  return {
    capture: { mic: true, system: true, bundleIds: [] },
    hideInScreenShare: true,
    product,
    speech: { locale: 'tr-TR', transcribeThem: true, wakeWord: true, alwaysListen: true, diarization: true },
    voice: { engine: 'apple', replies: 'auto', voiceId: null, rate: 0.52 },
    providers: {},
    model: { providerId: 'anthropic', id: DEFAULT_MODEL, effort: 'low' },
    policy: { allowCloud: true, maskPII: true, audit: true },
    onboarded: false
  }
}

/** userData altındaki settings.json için küçük, tipli ve atomik yazan depo. */
export class SettingsStore extends EventEmitter<{ change: [Settings] }> {
  private settings: Settings
  private needsMigration = false

  constructor(private readonly file: string) {
    super()
    this.settings = this.load()
    if (this.needsMigration) {
      this.save()
      this.needsMigration = false
    }
  }

  get(): Settings {
    return this.settings
  }

  update(patch: Partial<Settings>): Settings {
    this.settings = normalize({ ...this.settings, ...patch })
    this.save()
    this.emit('change', this.settings)
    return this.settings
  }

  private load(): Settings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Settings> & {
        activeWorkspaceName?: string
        products?: (Product & { id?: string })[]
        activeProductId?: string
      }
      this.needsMigration = Boolean(raw.products || raw.activeProductId || raw.activeWorkspaceName || 'practice' in raw)
      const defaults = defaultSettings()
      // M0 → M1.5 göçü: tek workspace adı ilk ürün olur.
      if (!raw.products?.length && raw.activeWorkspaceName) {
        defaults.product.name = raw.activeWorkspaceName
      }
      // Kaldırılan alanlar: activeWorkspaceName (0.1), practice ve ürün personası (0.3).
      const {
        activeWorkspaceName: _legacyWorkspace,
        practice: _legacyPractice,
        products: _legacyProducts,
        activeProductId: _legacyActiveProduct,
        ...rest
      } = raw as typeof raw & { practice?: unknown }
      return normalize({
        ...defaults,
        ...rest,
        capture: { ...defaults.capture, ...raw.capture },
        speech: { ...defaults.speech, ...raw.speech },
        voice: { ...defaults.voice, ...raw.voice },
        model: { ...defaults.model, ...raw.model },
        policy: { ...defaults.policy, ...raw.policy },
        providers: { ...raw.providers },
        // 0.2 göçü: sektör alanı yoktu.
        product: normalizeProduct(
          raw.products?.find((p) => p.id === raw.activeProductId) ?? raw.products?.[0] ?? (raw.product as (Product & { id?: string }) | undefined) ?? defaults.product
        )
      })
    } catch {
      return defaultSettings()
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.settings, null, 2))
    renameSync(tmp, this.file)
  }
}

function normalizeProduct(product: Product & { id?: string; initials?: string; createdAt?: number; persona?: unknown }): Product {
  const { id: _legacyId, initials: _legacyInitials, createdAt: _legacyCreatedAt, persona: _legacyPersona, ...rest } = product
  return { ...rest, sector: product.sector ?? 'genel' }
}

/** Geriye dönük uyumluluk için ayar nesnesini normalize eder. */
function normalize(settings: Settings): Settings {
  return { ...settings, product: settings.product ?? defaultSettings().product }
}
