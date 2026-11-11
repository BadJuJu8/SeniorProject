import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Checked once, at build / dev-server start. Slide 4 shows the PNG when it
// exists and falls back to the text version otherwise.
const shot = (name: string) => existsSync(fileURLToPath(new URL(`./public/screenshots/${name}`, import.meta.url)))

export default defineConfig({
  plugins: [react()],
  define: {
    __SCREENSHOTS__: JSON.stringify({
      ciLog: shot('ci-log.png'),
      wazuhAlert: shot('wazuh-alert.png'),
    }),
  },
  server: { host: '127.0.0.1' },
})
