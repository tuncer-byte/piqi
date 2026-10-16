import type { AudioChannel } from '@shared/types'

// piqi-audio stdout çerçeve protokolü (bkz. native/piqi-audio/Sources/piqi-audio/FrameWriter.swift):
//   [type: u8][channel: u8][length: u32 LE][payload]
const HEADER_SIZE = 6
const TYPE_AUDIO = 1
const TYPE_EVENT = 2
const CHANNELS: Record<number, AudioChannel> = { 0: 'me', 1: 'them' }

export type HelperFrame =
  | { type: 'audio'; channel: AudioChannel; samples: Int16Array }
  | { type: 'event'; event: HelperEvent }

export type HelperEvent = { event: string } & Record<string, unknown>

/** Parça parça gelen stdout verisinden tam çerçeveleri çıkarır. */
export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): HelperFrame[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const frames: HelperFrame[] = []
    let offset = 0

    while (this.buffer.length - offset >= HEADER_SIZE) {
      const type = this.buffer.readUInt8(offset)
      const channel = this.buffer.readUInt8(offset + 1)
      const length = this.buffer.readUInt32LE(offset + 2)
      const end = offset + HEADER_SIZE + length
      if (this.buffer.length < end) break

      const payload = this.buffer.subarray(offset + HEADER_SIZE, end)
      const frame = this.decode(type, channel, payload)
      if (frame) frames.push(frame)
      offset = end
    }

    this.buffer = offset === this.buffer.length ? Buffer.alloc(0) : this.buffer.subarray(offset)
    return frames
  }

  private decode(type: number, channel: number, payload: Buffer): HelperFrame | null {
    if (type === TYPE_AUDIO) {
      const ch = CHANNELS[channel]
      if (!ch) return null
      // Payload'ı kopyalıyoruz: alttaki Buffer bir sonraki push'ta yeniden kullanılabilir ve hizalı olmayabilir.
      const samples = new Int16Array(payload.length >> 1)
      for (let i = 0; i < samples.length; i++) samples[i] = payload.readInt16LE(i * 2)
      return { type: 'audio', channel: ch, samples }
    }
    if (type === TYPE_EVENT) {
      try {
        return { type: 'event', event: JSON.parse(payload.toString('utf8')) as HelperEvent }
      } catch {
        return null
      }
    }
    return null
  }
}
