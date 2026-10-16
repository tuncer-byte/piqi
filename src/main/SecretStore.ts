import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'
import type { ProviderStatus } from '@shared/types'

/** Ortam değişkeninden anahtar (geliştirme ve kurumsal dağıtım kolaylığı). */
const ENV_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  qwen: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  onprem: ['PIQI_ONPREM_API_KEY']
}

/**
 * Sağlayıcı API anahtarlarını macOS Keychain ile şifreleyerek (Electron safeStorage) tek dosyada tutar.
 * Düz metin anahtar hiçbir zaman diske ya da loglara yazılmaz.
 */
export class SecretStore {
  constructor(private readonly file: string) {}

  getApiKey(providerId: string): string | null {
    const stored = this.readAll()[providerId]
    if (stored) return stored
    for (const name of ENV_KEYS[providerId] ?? []) if (process.env[name]) return process.env[name]!
    return null
  }

  setApiKey(providerId: string, key: string | null): void {
    const all = this.readAll()
    if (key?.trim()) all[providerId] = key.trim()
    else delete all[providerId]
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain şifrelemesi kullanılamıyor')
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, safeStorage.encryptString(JSON.stringify(all)))
  }

  status(providerId: string): ProviderStatus {
    if (this.readAll()[providerId]) return { providerId, hasApiKey: true, source: 'keychain' }
    if ((ENV_KEYS[providerId] ?? []).some((n) => process.env[n])) return { providerId, hasApiKey: true, source: 'env' }
    return { providerId, hasApiKey: false, source: null }
  }

  private readAll(): Record<string, string> {
    if (!existsSync(this.file)) return {}
    try {
      const text = safeStorage.decryptString(readFileSync(this.file))
      try {
        return JSON.parse(text) as Record<string, string>
      } catch {
        // 0.2 göçü: dosyada yalnızca Anthropic anahtarı vardı.
        return { anthropic: text }
      }
    } catch {
      return {}
    }
  }
}
