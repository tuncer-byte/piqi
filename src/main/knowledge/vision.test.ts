import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '../SettingsStore'
import type { LlmService } from '../llm/LlmService'
import { LlmError } from '../llm/types'
import type { SecretStore } from '../SecretStore'
import { KnowledgeDB } from './KnowledgeDB'
import { KnowledgeService } from './KnowledgeService'
import { analysisToExtracted, extractImage, prepareImage, type ImageAnalysis } from './vision'

/** Düz renkli gerçek bir PNG (sips'in açabildiği). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer): number => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type), data])
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 200)])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const ANALYSIS: ImageAnalysis = {
  title: 'Ödeme servisi mimarisi',
  kind: 'diyagram',
  summary: 'API Gateway istekleri ödeme servisine, ödeme servisi de kuyruk üzerinden muhasebeye iletir.',
  text: 'API Gateway → Payment Service → Kafka → Ledger',
  details: ['Gateway saniyede 2000 istek sınırı uygular', 'Ledger yazımı asenkron'],
  keywords: ['ödeme', 'payment', 'kafka', 'ledger', 'gateway']
}

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'piqi-vision-'))
  dirs.push(dir)
  return dir
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('prepareImage', () => {
  it('büyük görseli küçültülmüş JPEG’e çevirir', async () => {
    const path = join(tempDir(), 'diagram.png')
    writeFileSync(path, png(3000, 1000))
    const image = await prepareImage(path)
    expect(image.mediaType).toBe('image/jpeg')
    const jpeg = Buffer.from(image.data, 'base64')
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })

  it('görsel olmayan dosyada anlaşılır hata verir', async () => {
    const path = join(tempDir(), 'broken.png')
    writeFileSync(path, 'not an image')
    await expect(prepareImage(path)).rejects.toThrow(/Görsel açılamadı/)
  })
})

describe('extractImage', () => {
  it('görseli modele metinle birlikte gönderir ve aranabilir Markdown’a çevirir', async () => {
    const path = join(tempDir(), 'mimari.png')
    writeFileSync(path, png(400, 300))
    const json = vi.fn(async () => ANALYSIS)
    const out = await extractImage({ json } as unknown as LlmService, path, '12 KB')
    const request = (json.mock.calls[0] as unknown as [{ messages: { content: string; images: { mediaType: string }[] }[]; purpose: string }])[0]
    expect(request.purpose).toBe('knowledge')
    expect(request.messages[0]!.images).toHaveLength(1)
    expect(request.messages[0]!.content).toContain('mimari.png')
    expect(out.units[0]!.text).toContain('Ödeme servisi mimarisi (diyagram)')
    expect(out.units[0]!.text).toContain('- Gateway saniyede 2000 istek sınırı uygular')
    expect(out.units[0]!.text).toContain('API Gateway → Payment Service')
    expect(out.keywords).toBe('ödeme payment kafka ledger gateway')
  })

  it('metin içermeyen görselde boş bölüm eklemez', () => {
    const out = analysisToExtracted('foto.jpg', { ...ANALYSIS, text: '', details: [] }, '1 MB')
    expect(out.units[0]!.text).not.toContain('Görseldeki metin:')
    expect(out.units[0]!.text).not.toContain('Ayrıntılar:')
  })
})

describe('Görsel kaynak indeksleme', () => {
  function service(json: ReturnType<typeof vi.fn>): { knowledge: KnowledgeService; db: KnowledgeDB } {
    const db = new KnowledgeDB(':memory:')
    const llm = { json, target: () => ({ name: 'Test', model: 'm', location: 'onprem', blocked: null }) } as unknown as LlmService
    const knowledge = new KnowledgeService(db, llm, {} as SecretStore, () => defaultSettings(), join(tempDir(), 'repos'))
    return { knowledge, db }
  }
  const add = (knowledge: KnowledgeService, dir: string) =>
    knowledge.add({
      kind: 'files',
      name: 'Görseller',
      location: dir,
      config: { kind: 'files', files: { paths: [dir], categories: {}, tags: {}, language: 'auto' } },
      note: '',
      focus: '',
      watch: false,
      priority: false
    })

  it('görselden çıkan bilgi aranabilir; değişmeyen görsel yeniden analiz edilmez', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'mimari.png'), png(400, 300))
    const json = vi.fn(async () => ANALYSIS)
    const { knowledge, db } = service(json)
    const source = add(knowledge, dir)
    await vi.waitFor(() => expect(db.source(source.id)?.status).toBe('ready'), { timeout: 10_000 })

    const hits = knowledge.search('Gateway saniyede kaç istek sınırı uyguluyor?')
    expect(hits[0]).toMatchObject({ label: 'mimari.png' })
    expect(hits[0]!.text).toContain('2000 istek')

    knowledge.reindex(source.id)
    await vi.waitFor(() => expect(db.source(source.id)?.status).toBe('ready'), { timeout: 10_000 })
    expect(json).toHaveBeenCalledTimes(1)
  })

  it('anahtar yoksa ilk hatadan sonra kalan görseller için modeli çağırmaz', async () => {
    const dir = tempDir()
    for (const name of ['a.png', 'b.png', 'c.png']) writeFileSync(join(dir, name), png(64, 64))
    const json = vi.fn(async () => {
      throw new LlmError('no_key', 'API anahtarı yok')
    })
    const { knowledge, db } = service(json)
    const source = add(knowledge, dir)
    await vi.waitFor(() => expect(db.source(source.id)?.status).toBe('ready'), { timeout: 10_000 })
    expect(json).toHaveBeenCalledTimes(1)
    expect(db.source(source.id)!.warnings.join(' ')).toMatch(/analiz edilmedi/)
  })
})
