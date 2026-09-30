import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Procurement Centre that "Order more" sends requests to, in development only.
// `npm run dev` / `preview` forward /procurement-api/* to its /api/*; in production
// NGINX does the same (see deploy/nginx-dev-pharmacy.conf).
const PROCUREMENT_URL = process.env.PROCUREMENT_URL ?? 'http://localhost:4000'
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
  // Relative asset URLs, so the same dist/ works at the domain root or under a
  // sub-path such as /dev/pharmacy/. Routing is hash-based, so no rewrites needed.
  base: 'dev/pharmacy',
  build: {
    sourcemap: false,
    // Emit every font as a file rather than inlining small ones as data: URIs,
    // so the server's Content-Security-Policy can stay at font-src 'self'.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rollupOptions: {
      output: {
        // React changes far less often than the app, so it gets its own cacheable file.
        manualChunks: { react: ['react', 'react-dom', 'react-dom/client'] },
      },
    },
  },
  // Bind to every interface so the console is reachable from other machines on
  // the same network. Ports differ from the patient app's so both can run at once.
  server: { host: true, port: 5174, proxy },
  preview: { host: true, port: 4174, proxy },
})
