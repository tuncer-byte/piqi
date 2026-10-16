import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanCode, totalsFor } from './scanner'

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'piqi-scan-'))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}

const many = (prefix: string, n: number, ext = 'ts'): Record<string, string> =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}/f${i}.${ext}`, `export const a${i} = ${i}\n`]))

describe('scanCode', () => {
  it('klasörleri sınıflar, gizli dosyaları ve .gitignore’u dışarıda bırakır', async () => {
    const root = repo({
      ...many('src/auth', 20),
      ...many('src/api', 25),
      'src/index.ts': 'export {}\n',
      'docs/guide.md': '# Rehber\nRate limit 600\n',
      'tests/a.test.ts': 'test()\n',
      '.github/workflows/ci.yml': 'on: push\n',
      'node_modules/x/index.js': 'x\n',
      'dist/out.js': 'y\n',
      '.gitignore': 'dist/\n',
      '.env': 'SECRET=1\n',
      'config/keys.ts': '-----BEGIN RSA PRIVATE KEY-----\nabc\n',
      'package.json': '{"name":"acme"}\n',
      'README.md': '# ACME Gateway\nÖdeme API’si\n'
    })
    const scan = await scanCode(root, { respectGitignore: true })
    const byPath = Object.fromEntries(scan.folders.map((f) => [f.path, f]))

    expect(byPath['src']).toMatchObject({ category: 'kaynak', included: true })
    expect(byPath['src/api']).toMatchObject({ depth: 1, category: 'kaynak', files: 25 })
    expect(byPath['docs']).toMatchObject({ category: 'dokuman', included: true })
    expect(byPath['tests']).toMatchObject({ category: 'test', included: false })
    expect(byPath['.github']).toMatchObject({ category: 'ci', included: false })
    expect(byPath['node_modules']).toMatchObject({ locked: true, included: false })
    expect(byPath['dist']).toMatchObject({ locked: true, reason: '.gitignore' })
    expect(byPath['']).toMatchObject({ included: true })
    expect(scan.secretsSkipped.sort()).toEqual(['.env', 'config/keys.ts'])
    expect(scan.manifests).toEqual(['package.json'])
    expect(scan.readme).toContain('ACME Gateway')
    expect(scan.languages[0]!.name).toBe('TypeScript')

    // src (46) + docs (1) + kök (package.json, README.md) = 49
    expect(scan.totals.files).toBe(49)
    const withTests = scan.folders.map((f) => (f.path === 'tests' ? { ...f, included: true } : f))
    expect(totalsFor(scan, withTests).files).toBe(50)
  })
})
