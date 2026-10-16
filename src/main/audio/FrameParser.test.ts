import { describe, expect, it } from 'vitest'
import { FrameParser } from './FrameParser'

function frame(type: number, channel: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt8(type, 0)
  header.writeUInt8(channel, 1)
  header.writeUInt32LE(payload.length, 2)
  return Buffer.concat([header, payload])
}

function pcm(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2)
  values.forEach((v, i) => buf.writeInt16LE(v, i * 2))
  return buf
}

describe('FrameParser', () => {
  it('ses ve olay çerçevelerini ayrıştırır', () => {
    const parser = new FrameParser()
    const data = Buffer.concat([
      frame(2, 255, Buffer.from(JSON.stringify({ event: 'ready', version: '0.1.0' }))),
      frame(1, 1, pcm([1, -2, 32767, -32768]))
    ])
    const frames = parser.push(data)
    expect(frames).toHaveLength(2)
    expect(frames[0]).toEqual({ type: 'event', event: { event: 'ready', version: '0.1.0' } })
    expect(frames[1]).toMatchObject({ type: 'audio', channel: 'them' })
    expect(Array.from((frames[1] as { samples: Int16Array }).samples)).toEqual([1, -2, 32767, -32768])
  })

  it('parçalı gelen veriyi birleştirir', () => {
    const parser = new FrameParser()
    const data = frame(1, 0, pcm([10, 20, 30]))
    expect(parser.push(data.subarray(0, 3))).toEqual([])
    expect(parser.push(data.subarray(3, 8))).toEqual([])
    const frames = parser.push(data.subarray(8))
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ type: 'audio', channel: 'me' })
  })

  it('bozuk JSON ve bilinmeyen kanalı atlar', () => {
    const parser = new FrameParser()
    const data = Buffer.concat([
      frame(2, 255, Buffer.from('{bozuk')),
      frame(1, 9, pcm([1])),
      frame(2, 255, Buffer.from('{"event":"stopped"}'))
    ])
    expect(parser.push(data)).toEqual([{ type: 'event', event: { event: 'stopped' } }])
  })
})
