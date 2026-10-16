import type { PiqiApi } from '@shared/ipc'

declare global {
  interface Window {
    piqi: PiqiApi
  }
}

export {}
