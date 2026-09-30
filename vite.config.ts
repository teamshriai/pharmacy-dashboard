import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Procurement Centre that "Order more" sends requests to. Set PROCUREMENT_URL
// to point elsewhere; the console's server forwards /procurement-api/* to its /api/*.
const PROCUREMENT_URL = process.env.PROCUREMENT_URL ?? 'http://192.168.29.164:4000'
const proxy = {
  '/procurement-api': {
    target: PROCUREMENT_URL,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/procurement-api/, '/api'),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Bind to every interface so the console is reachable from other machines on
  // the same network. Ports differ from the patient app's so both can run at once.
  server: { host: true, port: 5174, proxy },
  preview: { host: true, port: 4174, proxy },
})
