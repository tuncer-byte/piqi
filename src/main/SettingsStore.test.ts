import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { newProduct } from '@shared/products'
import { defaultSettings, SettingsStore } from './SettingsStore'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('SettingsStore single-product migration', () => {
  it('keeps the previously active product and persists a single product field', () => {
    const dir = mkdtempSync(join(tmpdir(), 'piqi-settings-'))
    dirs.push(dir)
    const file = join(dir, 'settings.json')
    const { product: _product, ...base } = defaultSettings()
    const first = { ...newProduct('Birinci'), id: 'first' }
    const active = { ...newProduct('İkinci'), id: 'active' }
    writeFileSync(file, JSON.stringify({ ...base, products: [first, active], activeProductId: active.id }))

    const settings = new SettingsStore(file).get()
    const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>

    expect(settings.product).toMatchObject({ name: 'İkinci' })
    expect(saved).not.toHaveProperty('products')
    expect(saved).not.toHaveProperty('activeProductId')
    expect(saved.product).toMatchObject({ name: 'İkinci' })
  })
})