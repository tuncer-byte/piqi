import { describe, expect, it } from 'vitest'
import type { AudioProcessInfo } from '@shared/types'
import { END_AFTER_MS, inCall, MeetingDetector, POLL_MS, START_AFTER_MS } from './MeetingDetector'

const proc = (bundleId: string, input: boolean, output = false): AudioProcessInfo => ({
  pid: 1,
  bundleId,
  isRunningInput: input,
  isRunningOutput: output
})

function harness() {
  let t = 0
  let processes: AudioProcessInfo[] = []
  const detector = new MeetingDetector(async () => processes, () => t)
  const events: string[] = []
  detector.on('start', (app) => events.push(`start:${app.id}`))
  detector.on('end', (app) => events.push(`end:${app.id}`))
  /** `ms` boyunca yoklama aralığıyla turlar. */
  const run = async (ms: number): Promise<void> => {
    for (const end = t + ms; t < end; t += POLL_MS) await detector.poll()
    await detector.poll()
  }
  return { detector, events, run, set: (p: AudioProcessInfo[]) => (processes = p) }
}

describe('inCall', () => {
  it('mikrofonu kullanan toplantı uygulamasını yardımcı süreçleriyle tanır', () => {
    expect(inCall([proc('com.microsoft.teams2.helper', true)])?.id).toBe('teams')
    expect(inCall([proc('us.zoom.CptHost', true)])?.id).toBe('zoom')
  })

  it('yalnızca ses çalan uygulamayı ve toplantı dışı uygulamaları saymaz', () => {
    expect(inCall([proc('us.zoom.xos', false, true)])).toBeNull()
    expect(inCall([proc('com.spotify.client', true, true), proc('io.github.tuncer-byte.piqi.audio', true)])).toBeNull()
  })

  it('aynı anda birden fazlası varsa adanmış toplantı uygulamasını tarayıcıya tercih eder', () => {
    expect(inCall([proc('com.google.Chrome.helper', true), proc('us.zoom.xos', true)])?.id).toBe('zoom')
  })
})

describe('MeetingDetector', () => {
  it('kısa mikrofon kullanımını toplantı saymaz, kesintisiz kullanımda başlatır', async () => {
    const h = harness()
    h.set([proc('us.zoom.xos', true)])
    await h.detector.poll()
    h.set([])
    await h.run(POLL_MS)
    expect(h.events).toEqual([])

    h.set([proc('us.zoom.xos', true)])
    await h.run(START_AFTER_MS)
    expect(h.events).toEqual(['start:zoom'])
    expect(h.detector.current?.name).toBe('Zoom')
  })

  it('kısa kesintide toplantıyı bitirmez; mikrofon uzun süre bırakılınca bitirir', async () => {
    const h = harness()
    h.set([proc('com.microsoft.teams2', true)])
    await h.run(START_AFTER_MS)
    h.set([])
    await h.run(END_AFTER_MS / 2)
    h.set([proc('com.microsoft.teams2', true)])
    await h.run(POLL_MS)
    expect(h.events).toEqual(['start:teams'])

    h.set([])
    await h.run(END_AFTER_MS)
    expect(h.events).toEqual(['start:teams', 'end:teams'])
    expect(h.detector.current).toBeNull()
  })

  it('durdurulunca süren toplantı için bitiş bildirir', async () => {
    const h = harness()
    h.set([proc('com.microsoft.teams', true)])
    await h.run(START_AFTER_MS)
    h.detector.stop()
    expect(h.events).toEqual(['start:teams', 'end:teams'])
  })

  it('yardımcı yanıt vermezse durumu değiştirmez', async () => {
    let t = 0
    let fail = false
    const detector = new MeetingDetector(async () => {
      if (fail) throw new Error('timeout')
      return [proc('us.zoom.xos', true)]
    }, () => t)
    const events: string[] = []
    detector.on('end', () => events.push('end'))
    for (; t <= START_AFTER_MS + POLL_MS; t += POLL_MS) await detector.poll()
    fail = true
    for (const end = t + END_AFTER_MS * 2; t < end; t += POLL_MS) await detector.poll()
    expect(events).toEqual([])
    expect(detector.current?.id).toBe('zoom')
  })
})
