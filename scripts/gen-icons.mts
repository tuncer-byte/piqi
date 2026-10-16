// Uygulama ikonunu (build/icon.icns) ve dev Dock ikonunu (resources/icon.png) üretir.
// Çalıştırma: node scripts/gen-icons.mts   (Node 23+ TypeScript'i doğrudan çalıştırır)
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { BRAND } from '../src/shared/brand.ts'
import { hex, rasterizeMark } from '../src/shared/markRaster.ts'

const root = join(import.meta.dirname, '..')

function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size: number, rgba: Uint8ClampedArray): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit derinliği
  header[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** macOS ikon ızgarası: 1024 tuvalde 824'lük yuvarlatılmış kare, ana simge koyu zemin. */
function appIcon(size: number): Buffer {
  const inset = size * (100 / 1024)
  const content = size - inset * 2
  return png(
    size,
    rasterizeMark({
      size,
      markSize: content * 0.98,
      ring: hex(BRAND.lime),
      core: hex(BRAND.lime),
      graded: true,
      dotScale: size <= 32 ? 1.25 : 1,
      background: { color: hex(BRAND.ink), inset, radius: content * 0.225 }
    })
  )
}

const iconset = join(root, 'build', 'icon.iconset')
rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset, { recursive: true })
for (const base of [16, 32, 128, 256, 512]) {
  writeFileSync(join(iconset, `icon_${base}x${base}.png`), appIcon(base))
  writeFileSync(join(iconset, `icon_${base}x${base}@2x.png`), appIcon(base * 2))
}
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(root, 'build', 'icon.icns')])
rmSync(iconset, { recursive: true, force: true })

mkdirSync(join(root, 'resources'), { recursive: true })
writeFileSync(join(root, 'resources', 'icon.png'), appIcon(512))
console.log('[piqi] build/icon.icns ve resources/icon.png üretildi')
