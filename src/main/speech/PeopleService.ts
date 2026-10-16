import { EventEmitter } from 'node:events'
import type { MeetingPeople, Speaker } from '@shared/types'

/**
 * Toplantıdaki konuşmacılar. Numaralar ve kullanıcının verdiği adlar yalnızca bu dinleme oturumunda
 * yaşar; ses izi tutulmaz (KVKK: biyometrik veri işlenmez). Dinleme yeniden başlayınca sıfırlanır.
 */
export class PeopleService extends EventEmitter<{ change: [MeetingPeople] }> {
  private state: MeetingPeople = { speakers: [], active: false, status: 'off' }
  private names = new Map<number, string>()

  get(): MeetingPeople {
    return this.state
  }

  /** "Konuşmacı 2" ya da kullanıcının verdiği ad. */
  label(id: number | undefined): string {
    if (id == null) return 'Karşı taraf'
    return this.names.get(id) ?? `Konuşmacı ${id}`
  }

  setStatus(status: MeetingPeople['status'], error?: string): void {
    this.update({ status, error, active: status === 'ready' })
  }

  /** Yardımcıdan gelen konuşma süreleri. */
  setTalk(items: { id: number; talkSeconds: number }[]): void {
    const now = Date.now()
    const previous = new Map(this.state.speakers.map((s) => [s.id, s]))
    const speakers: Speaker[] = items
      .map((item) => {
        const old = previous.get(item.id)
        return {
          id: item.id,
          name: this.names.get(item.id) ?? null,
          talkSeconds: Math.round(item.talkSeconds),
          lastHeardAt: old && old.talkSeconds === Math.round(item.talkSeconds) ? old.lastHeardAt : now
        }
      })
      .sort((a, b) => a.id - b.id)
    this.update({ speakers })
  }

  /** Bir cümle bir konuşmacıya atandığında listeye ekler (sayaç gelmeden önce de görünsün). */
  heard(id: number): void {
    if (this.state.speakers.some((s) => s.id === id)) return
    this.update({
      speakers: [...this.state.speakers, { id, name: this.names.get(id) ?? null, talkSeconds: 0, lastHeardAt: Date.now() }].sort(
        (a, b) => a.id - b.id
      )
    })
  }

  rename(id: number, name: string): void {
    const clean = name.trim()
    if (clean) this.names.set(id, clean)
    else this.names.delete(id)
    this.update({ speakers: this.state.speakers.map((s) => (s.id === id ? { ...s, name: clean || null } : s)) })
  }

  /** Yeni toplantı (dinleme yeniden başladı). */
  reset(): void {
    this.names.clear()
    this.update({ speakers: [] })
  }

  private update(patch: Partial<MeetingPeople>): void {
    this.state = { ...this.state, ...patch }
    this.emit('change', this.state)
  }
}
