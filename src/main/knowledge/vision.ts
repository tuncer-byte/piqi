// Görsel kaynaklar: ekran görüntüsü, mimari diyagram, grafik, tablo fotoğrafı, taranmış sayfa…
// Görsel önce küçültülür (token ve maliyet), sonra seçili model içeriğini okuyup yapılandırılmış metne çevirir.
// Çıkan metin diğer belgeler gibi parçalanır ve indekslenir; aynı görsel değişmedikçe yeniden analiz edilmez.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { LlmService } from '../llm/LlmService'
import type { ImageInput } from '../llm/types'
import type { Extracted } from './extract'

const run = promisify(execFile)

export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic', 'heif', 'tif', 'tiff', 'bmp'])

/** Uzun kenar üst sınırı: görsel modellerin önerdiği çözünürlük; üstü token harcar, okunurluğu artırmaz. */
const MAX_EDGE = 1568
/** Bundan büyük görsel kabul edilmez. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export function isImage(path: string): boolean {
  return IMAGE_EXT.has(extname(path).slice(1).toLowerCase())
}

/**
 * Görseli modele gönderilecek JPEG'e çevirir: en fazla MAX_EDGE piksel, HEIC/TIFF/BMP dahil.
 * macOS'un yerleşik `sips` aracı kullanılır; ek bağımlılık yoktur.
 */
export async function prepareImage(path: string): Promise<ImageInput> {
  const dir = await mkdtemp(join(tmpdir(), 'piqi-image-'))
  const out = join(dir, 'image.jpg')
  try {
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', String(MAX_EDGE), path, '--out', out])
    return { mediaType: 'image/jpeg', data: (await readFile(out)).toString('base64') }
  } catch (error) {
    throw new Error(`Görsel açılamadı (${(error as Error).message.split('\n')[0]?.slice(0, 80)})`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const KINDS = ['diyagram', 'ekran görüntüsü', 'grafik', 'tablo', 'belge', 'fotoğraf', 'diğer'] as const

export const ImageAnalysis = z.object({
  title: z.string().describe('Görselin ne olduğunu anlatan kısa başlık, en fazla 10 kelime'),
  kind: z.enum(KINDS),
  summary: z.string().describe('Görselin anlattığı şey, 1-3 cümle'),
  text: z.string().describe('Görselde okunan tüm metin, okunma sırasıyla; tablolar Markdown tablo olarak. Metin yoksa boş.'),
  details: z
    .array(z.string())
    .describe('Soru cevaplamaya yarayan somut bilgiler: rakamlar, limitler, adlar, bileşenler arası ilişkiler, akış adımları, eksen ve değerler'),
  keywords: z.array(z.string()).describe('Arama için 5-15 anahtar kelime; Türkçe ve İngilizce karşılıklarıyla')
})
export type ImageAnalysis = z.infer<typeof ImageAnalysis>

const SYSTEM =
  'Bir ürün bilgi bankası için görselleri metne çeviriyorsun. Görselde gördüğünü eksiksiz ve doğru aktar; ' +
  'görselde olmayan bilgiyi ekleme, tahmin yürütme. Okunamayan kısmı "[okunamadı]" diye belirt. ' +
  'Diyagramlarda bileşenleri ve aralarındaki okları/ilişkileri, grafiklerde eksenleri ve önemli değerleri, ' +
  'ekran görüntülerinde ekranın amacını, alanları ve görünen değerleri yaz. Görseldeki metni çevirmeden, olduğu gibi aktar; ' +
  'başlık, özet ve ayrıntıları Türkçe yaz.'

/**
 * Analizi indekslenecek metne çevirir. Markdown başlığı kullanılmaz: parçalayıcı başlıklardan böler ve
 * bir görselin özeti, ayrıntıları ve metni birbirinden kopmamalı; yalnızca uzun içerik boyuta göre bölünür.
 */
export function analysisToExtracted(name: string, analysis: ImageAnalysis, sizeLabel: string): Extracted & { keywords: string } {
  const sections = [`${analysis.title.trim() || name} (${analysis.kind})`, analysis.summary.trim()]
  if (analysis.details.length) sections.push(`Ayrıntılar:\n${analysis.details.map((d) => `- ${d.trim()}`).join('\n')}`)
  if (analysis.text.trim()) sections.push(`Görseldeki metin:\n${analysis.text.trim()}`)
  return {
    units: [{ text: sections.filter(Boolean).join('\n\n') }],
    pageLabel: `görsel · ${sizeLabel}`,
    pages: null,
    warnings: [],
    keywords: analysis.keywords.join(' ')
  }
}

/** Görseli seçili modelle analiz eder. Model görsel desteklemiyorsa ya da politika engelliyorsa hata fırlatır. */
export async function extractImage(
  llm: LlmService,
  path: string,
  sizeLabel: string,
  signal?: AbortSignal
): Promise<Extracted & { keywords: string }> {
  const name = basename(path)
  const image = await prepareImage(path)
  const analysis = await llm.json({
    system: SYSTEM,
    messages: [{ role: 'user', content: `Dosya adı: ${name}\nBu görseli bilgi bankası için metne çevir.`, images: [image] }],
    purpose: 'knowledge',
    schema: ImageAnalysis,
    name: 'image_analysis',
    effort: 'low',
    maxTokens: 4_000,
    signal
  })
  return analysisToExtracted(name, analysis, sizeLabel)
}
