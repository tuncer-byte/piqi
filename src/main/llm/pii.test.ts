import { describe, expect, it } from 'vitest'
import { isCard, isIban, isTckn, isVkn, Masker, StreamUnmasker } from './pii'

describe('doğrulayıcılar', () => {
  it('TCKN sağlama', () => {
    expect(isTckn('10000000146')).toBe(true)
    expect(isTckn('12345678901')).toBe(false)
    expect(isTckn('01234567890')).toBe(false)
  })
  it('IBAN mod-97', () => {
    expect(isIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true)
    expect(isIban('TR33 0006 1005 1978 6457 8413 27')).toBe(false)
  })
  it('kart Luhn', () => {
    expect(isCard('4111 1111 1111 1111')).toBe(true)
    expect(isCard('4111 1111 1111 1112')).toBe(false)
  })
  it('VKN', () => {
    expect(isVkn('1234567890')).toBe(true)
    expect(isVkn('0010030006')).toBe(true)
    expect(isVkn('1234567891')).toBe(false)
  })
})

describe('Masker', () => {
  it('kişisel verileri maskeler ve geri çevirir', () => {
    const m = new Masker()
    const text =
      'Müşteri 10000000146 TCKN ile TR33 0006 1005 1978 6457 8413 26 hesabından 4111 1111 1111 1111 kartıyla ödedi; tel 0532 123 45 67, ali@ornek.com.tr'
    const masked = m.mask(text)
    expect(masked).not.toMatch(/10000000146|TR33|4111|532|ali@/)
    expect(masked).toContain('«TCKN-1»')
    expect(masked).toContain('«IBAN-1»')
    expect(masked).toContain('«KART-1»')
    expect(masked).toContain('«TELEFON-1»')
    expect(masked).toContain('«EPOSTA-1»')
    expect(m.unmask(masked)).toBe(text)
    expect(m.counts()).toEqual({ EPOSTA: 1, IBAN: 1, KART: 1, TCKN: 1, TELEFON: 1 })
  })

  it('aynı değere aynı belirteci verir, sıradan sayılara dokunmaz', () => {
    const m = new Masker()
    const masked = m.mask('10000000146 ve yine 10000000146. Limit dakikada 600 istek, 2026 yılı, 12345678901.')
    expect(masked).toBe('«TCKN-1» ve yine «TCKN-1». Limit dakikada 600 istek, 2026 yılı, 12345678901.')
  })

  it('akışta bölünmüş belirteçleri doğru geri çevirir', () => {
    const m = new Masker()
    m.mask('IBAN: TR33 0006 1005 1978 6457 8413 26')
    const s = new StreamUnmasker(m)
    const out = s.push('Hesap «IB') + s.push('AN-1» onaylandı') + s.flush()
    expect(out).toBe('Hesap TR33 0006 1005 1978 6457 8413 26 onaylandı')
  })
})
