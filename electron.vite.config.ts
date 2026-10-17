import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = { '@shared': resolve(__dirname, 'src/shared') }
const { version } = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    resolve: { alias },
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          app: resolve(__dirname, 'src/renderer/index.html'),
          island: resolve(__dirname, 'src/renderer/island.html')
        }
      }
    }
  }
})
