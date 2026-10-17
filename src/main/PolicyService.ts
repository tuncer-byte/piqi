import { existsSync, readFileSync } from 'node:fs'
import type { DataPolicy, PolicyStatus, Settings } from '@shared/types'
import { presetById } from '@shared/providers'

/**
 * Kurumsal (MDM) politika dosyası. Kurumun BT ekibi Jamf/Intune ile dağıtır; kullanıcı değiştiremez.
 *
 * Örnek /Library/Application Support/Piqi/policy.json:
 * {
 *   "allowCloud": false,
 *   "maskPII": true,
 *   "audit": true,
 *   "allowedProviders": ["onprem", "ollama"],
 *   "defaultProvider": { "providerId": "onprem", "baseUrl": "https://llm.kurum.local/v1", "model": "qwen3.6-35b-a3b" }
 * }
 */
export const MANAGED_POLICY_PATH = '/Library/Application Support/Piqi/policy.json'

interface ManagedPolicy extends Partial<DataPolicy> {
  allowedProviders?: string[]
  defaultProvider?: { providerId: string; baseUrl?: string; model?: string }
}

export class PolicyService {
  private managed: ManagedPolicy | null

  constructor(private readonly path = MANAGED_POLICY_PATH) {
    this.managed = this.load()
  }

  status(settings: Settings): PolicyStatus {
    const m = this.managed
    return {
      effective: {
        allowCloud: m?.allowCloud ?? settings.policy.allowCloud,
        maskPII: m?.maskPII ?? settings.policy.maskPII,
        audit: m?.audit ?? settings.policy.audit
      },
      managedBy: m ? this.path : null,
      allowedProviders: m?.allowedProviders ?? null
    }
  }

  /** Sağlayıcı bu politikada kullanılabilir mi; değilse nedenini döner. */
  check(settings: Settings, providerId: string): string | null {
    const status = this.status(settings)
    const preset = presetById(providerId)
    if (!preset) return 'Bilinmeyen sağlayıcı.'
    if (status.allowedProviders && !status.allowedProviders.includes(providerId)) {
      return `${preset.name} kurum politikasında izinli değil.`
    }
    if (preset.location === 'cloud' && !status.effective.allowCloud) {
      return `${preset.name} bir bulut sağlayıcısı; veri politikası yalnızca kurum içi modellere izin veriyor.`
    }
    return null
  }

  /** Politika dosyası varsayılan bir sağlayıcı dayatıyorsa ayarlara uygular. */
  applyDefaults(settings: Settings): Partial<Settings> | null {
    const d = this.managed?.defaultProvider
    if (!d) return null
    if (settings.model.providerId === d.providerId && (!d.model || settings.model.id === d.model)) return null
    return {
      model: { ...settings.model, providerId: d.providerId, id: d.model ?? settings.model.id },
      providers: d.baseUrl ? { ...settings.providers, [d.providerId]: { baseUrl: d.baseUrl } } : settings.providers
    }
  }

  private load(): ManagedPolicy | null {
    if (!existsSync(this.path)) return null
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as ManagedPolicy
    } catch (error) {
      console.error('[piqi] politika dosyası okunamadı; en kısıtlayıcı politika uygulanıyor:', error)
      // Bozuk politika dosyası: güvenli tarafta kal.
      return { allowCloud: false, maskPII: true, audit: true }
    }
  }
}
