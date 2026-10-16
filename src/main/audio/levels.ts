const FLOOR_DB = -60

/** Int16 PCM için RMS'i dBFS'e çevirir. */
export function rmsDb(samples: Int16Array): number {
  if (samples.length === 0) return -Infinity
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]! / 32768
    sum += v * v
  }
  return 10 * Math.log10(sum / samples.length || 1e-12)
}

/** dBFS değerini -60..0 dB aralığından 0..1 arasına eşler (UI ölçerleri için). */
export function normalizeDb(db: number): number {
  if (!Number.isFinite(db) || db <= FLOOR_DB) return 0
  return Math.min(1, (db - FLOOR_DB) / -FLOOR_DB)
}
