import type { PiqiApi } from '@shared/ipc'

declare global {
  /** package.json sürümü; derlemede electron.vite.config.ts içinden gömülür. */
  const __APP_VERSION__: string

  interface Window {
    piqi: PiqiApi
  }
}

export {}
