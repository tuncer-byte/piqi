/** Dinlenebilecek toplantı uygulamaları. bundleIds önek olarak eşleşir (yardımcı süreçleri de kapsar). */
export const MEETING_APPS = [
  { id: 'teams', name: 'Microsoft Teams', bundleIds: ['com.microsoft.teams2', 'com.microsoft.teams'] },
  { id: 'zoom', name: 'Zoom', bundleIds: ['us.zoom.xos'] },
  { id: 'chrome', name: 'Google Chrome (Meet)', bundleIds: ['com.google.Chrome'] },
  { id: 'safari', name: 'Safari', bundleIds: ['com.apple.WebKit', 'com.apple.Safari'] },
  { id: 'arc', name: 'Arc', bundleIds: ['company.thebrowser'] },
  { id: 'edge', name: 'Microsoft Edge', bundleIds: ['com.microsoft.edgemac'] },
  { id: 'slack', name: 'Slack', bundleIds: ['com.tinyspeck.slackmacgap'] },
  { id: 'webex', name: 'Webex', bundleIds: ['Cisco-Systems.Spark'] }
] as const
