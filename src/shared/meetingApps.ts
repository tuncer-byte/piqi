/**
 * Toplantı uygulamaları. `bundleIds` hem sistem sesi yakalamada hem algılamada önek olarak eşleşir
 * (yardımcı süreçleri de kapsar); `detect` yalnızca algılamaya eklenen ek öneklerdir.
 * Sıra önceliktir: aynı anda birden fazlası mikrofonu kullanıyorsa ilk eşleşen toplantı sayılır.
 */
export interface MeetingApp {
  id: string
  name: string
  bundleIds: readonly string[]
  detect?: readonly string[]
  /** Tarayıcılar: mikrofon kullanımı her zaman toplantı değildir (ör. dikte); "otomatik" modda yalnızca sorulur. */
  browser?: boolean
}

export const MEETING_APPS: readonly MeetingApp[] = [
  { id: 'teams', name: 'Microsoft Teams', bundleIds: ['com.microsoft.teams2', 'com.microsoft.teams'] },
  { id: 'zoom', name: 'Zoom', bundleIds: ['us.zoom.xos'], detect: ['us.zoom.'] },
  { id: 'webex', name: 'Webex', bundleIds: ['Cisco-Systems.Spark'], detect: ['com.webex.', 'com.cisco.webex'] },
  { id: 'slack', name: 'Slack', bundleIds: ['com.tinyspeck.slackmacgap'] },
  { id: 'facetime', name: 'FaceTime', bundleIds: ['com.apple.FaceTime'] },
  { id: 'chrome', name: 'Google Chrome (Meet)', bundleIds: ['com.google.Chrome'], browser: true },
  { id: 'edge', name: 'Microsoft Edge', bundleIds: ['com.microsoft.edgemac'], browser: true },
  { id: 'arc', name: 'Arc', bundleIds: ['company.thebrowser'], browser: true },
  { id: 'safari', name: 'Safari', bundleIds: ['com.apple.WebKit', 'com.apple.Safari'], browser: true }
]

/** Bu süreç hangi toplantı uygulamasına ait; değilse null. */
export function meetingAppFor(bundleId: string): MeetingApp | null {
  return MEETING_APPS.find((app) => [...app.bundleIds, ...(app.detect ?? [])].some((prefix) => bundleId.startsWith(prefix))) ?? null
}
