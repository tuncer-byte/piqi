import { z } from 'zod'
import type { CodeScan, FolderCategory, TriagePlan } from '@shared/knowledge'
import type { LlmService } from '../llm/LlmService'
import type { ScannedFile } from './scanner'

const CATEGORIES = ['kaynak', 'dokuman', 'yapilandirma', 'test', 'ci', 'cikti', 'diger'] as const

const Plan = z.object({
  folders: z.array(
    z.object({
      path: z.string(),
      include: z.boolean(),
      category: z.enum(CATEGORIES),
      why: z.string().describe('Kısa gerekçe, en fazla 10 kelime')
    })
  ),
  focus: z.string().describe('Toplantıda en çok sorulacak konulara göre 1-2 cümlelik tarama odağı'),
  keywords: z.array(z.string()).describe('Arama için önemli alan terimleri (Türkçe ve İngilizce), en fazla 15')
})

/**
 * Yapay zekaya içerik değil yalnızca ağaç gösterilir: klasör adları, dosya sayıları, örnek dosya adları,
 * README özeti, manifest ve kullanıcının notu. Tek, ucuz bir çağrıyla hangi klasörlerin taranacağına karar verir.
 */
export async function triage(llm: LlmService, scan: CodeScan & { scanned: ScannedFile[] }, note: string): Promise<TriagePlan> {
  const listed = scan.folders.filter((f) => !f.locked)
  const tree = listed
    .map((f) => {
      const samples = scan.scanned
        .filter((s) => (f.path ? s.rel.startsWith(`${f.path}/`) : !s.rel.includes('/')))
        .slice(0, 8)
        .map((s) => s.rel.slice(f.path ? f.path.length + 1 : 0))
      return `${'  '.repeat(f.depth)}${f.path || '(kök)'}/ — ${f.files} dosya, ${f.lines} satır, şimdiki sınıf: ${f.category}; örnek: ${samples.join(', ')}`
    })
    .join('\n')

  const plan = await llm.json({
    system:
      'Bir kod tabanını, satış/teknik toplantılarda müşteri sorularına cevap verecek bir asistan için indeksliyorsun. ' +
      'Amaç: en az maliyetle en isabetli cevap. Müşterinin soracağı davranışı (API, limitler, güvenlik, entegrasyon, yapılandırma) ' +
      'anlatan klasörleri dahil et; testleri, üretilmiş kodu, örnek verileri ve iç araçları genelde hariç tut. ' +
      'Kullanıcının notu varsa ona öncelik ver. Yalnızca verilen klasör yollarını kullan.',
    messages: [
      {
        role: 'user',
        content: [
          `Repo: ${scan.name}${scan.branch ? ` (dal: ${scan.branch})` : ''}`,
          `Diller: ${scan.languages.map((l) => `${l.name} %${Math.round(l.share * 100)}`).join(', ')}`,
          scan.manifests.length ? `Manifestler: ${scan.manifests.join(', ')}` : '',
          scan.readme ? `README (özet):\n${scan.readme.slice(0, 1500)}` : '',
          `Klasörler:\n${tree}`,
          note.trim() ? `Kullanıcının notu: ${note.trim()}` : 'Kullanıcı not bırakmadı.'
        ]
          .filter(Boolean)
          .join('\n\n')
      }
    ],
    schema: Plan,
    name: 'scan_plan',
    purpose: 'knowledge',
    effort: 'low',
    maxTokens: 8_000
  })
  const known = new Set(listed.map((f) => f.path))
  return { ...plan, folders: plan.folders.filter((f) => known.has(f.path)) }
}

const Cards = z.object({
  cards: z.array(
    z.object({
      path: z.string(),
      summary: z.string().describe('Dosyanın ne yaptığı, Türkçe, en fazla 20 kelime'),
      keywords: z.array(z.string()).describe('Toplantıda bu dosyayı bulduracak Türkçe ve İngilizce terimler, en fazla 12')
    })
  )
})

export interface CardInput {
  path: string
  /** İmzalar, doküman yorumları ve ilk satırlar (tam içerik değil). */
  preview: string
}

/**
 * "Kod kartları": her dosya için Türkçe özet + TR/EN anahtar kelimeler. Toplantıda Türkçe sorulan
 * "hız sınırı"nın İngilizce `RateLimiter`'ı bulmasını sağlar. 12 dosya tek çağrıda işlenir.
 */
export async function buildCards(
  llm: LlmService,
  files: CardInput[],
  focus: string,
  model?: { providerId: string; id: string }
): Promise<{ path: string; summary: string; keywords: string[] }[]> {
  const result = await llm.json({
    system:
      'Her dosya için kısa bir Türkçe özet ve toplantıda o dosyayı bulduracak anahtar kelimeler üret. ' +
      'Anahtar kelimelere hem Türkçe kavramları (ör. "hız sınırı", "yeniden deneme") hem koddaki İngilizce terimleri (ör. "rate limit", "retry") koy. ' +
      'Yalnızca verilen dosya yollarını kullan.' +
      (focus ? ` Ürün odağı: ${focus}` : ''),
    messages: [{ role: 'user', content: files.map((f) => `### ${f.path}\n${f.preview}`).join('\n\n') }],
    schema: Cards,
    name: 'code_cards',
    purpose: 'knowledge',
    effort: 'low',
    maxTokens: 8_000,
    model
  })
  return result.cards
}

/** Karta gidecek önizleme: içe aktarmalar atlanır; bildirim satırları ve yorumlar önceliklidir. */
export function cardPreview(text: string, maxChars = 1100): string {
  const lines = text.split('\n')
  const important = lines.filter((l) =>
    /^\s{0,4}(export|public|func|def|class|interface|type|struct|fn|pub|module|namespace|\/\*\*|\s*\*|#|\/\/\/|""")/.test(l)
  )
  const preview = (important.length > 8 ? important : lines).filter((l) => !/^\s*(import|from|using|require\(|#include)/.test(l)).join('\n')
  return preview.slice(0, maxChars)
}

/** Kartların yaklaşık maliyeti (token) ve süresi. */
export function cardEstimate(files: number): { tokens: number; seconds: number } {
  return { tokens: files * 420 + Math.ceil(files / 12) * 300, seconds: Math.ceil(files / 12 / 3) * 6 }
}

export const FOLDER_CATEGORIES: FolderCategory[] = [...CATEGORIES]
