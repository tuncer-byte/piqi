import { describe, expect, it } from 'vitest'
import { EchoFilter } from './echo'

describe('EchoFilter', () => {
  it('karşı tarafın cümlesinin mikrofondaki yankısını tanır (tanıma farklı duysa da)', () => {
    let t = 0
    const echo = new EchoFilter(() => t)
    echo.heardTheirs('SLA oranınız nedir kesinti olursa ne oluyor')
    t = 500
    expect(echo.isEcho('Organımız nedir kesinti olur ne oluyor')).toBe(true)
  })

  it('kullanıcının kendi farklı cümlesini ve kısa onayları yankı saymaz', () => {
    let t = 0
    const echo = new EchoFilter(() => t)
    echo.heardTheirs('SLA oranınız nedir kesinti olursa ne oluyor')
    expect(echo.isEcho('Yüzde doksan dokuz virgül dokuz taahhüt ediyoruz')).toBe(false)
    expect(echo.isEcho('Evet tamam')).toBe(false)
  })

  it('zaman penceresi geçince eşleştirmez', () => {
    let t = 0
    const echo = new EchoFilter(() => t)
    echo.heardTheirs('Verileri Türkiye’deki veri merkezinde tutabiliyor musunuz')
    t = 10_000
    expect(echo.isEcho('Verileri Türkiye’deki veri merkezinde tutabiliyor musunuz')).toBe(false)
  })
})
