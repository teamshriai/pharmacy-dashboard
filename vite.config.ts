import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { connect } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'

// The Procurement Centre that "Order more" sends requests to, in development only.
// `npm run dev` / `preview` forward /procurement-api/* to its /api/*; in production
// NGINX does the same (see deploy/nginx-dev-pharmacy.conf).
const PROCUREMENT_URL = process.env.PROCUREMENT_URL ?? 'http://localhost:4000'
// The page lives at /dev/pharmacy/, so its relative procurement-api calls arrive there.
const procurement = {
  target: PROCUREMENT_URL,
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^(\/dev\/pharmacy)?\/procurement-api/, '/api'),
}
const proxy = { '/dev/pharmacy/procurement-api': procurement, '/procurement-api': procurement }

/**
 * When the Procurement Centre is not running, answer procurement-api calls the
 * way production NGINX does (a 503 with a plain message the app shows) instead
 * of letting the proxy fail with a stack trace in the terminal on every request.
 * Reachability is re-checked every 10 seconds, so starting it later just works.
 */
function procurementOffline(): Plugin {
  const target = new URL(PROCUREMENT_URL)
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
  let check: { at: number; up: Promise<boolean> } | null = null
  let lastUp: boolean | null = null
  const reachable = () => {
    if (!check || Date.now() - check.at > 10_000) {
      const up = new Promise<boolean>((resolve) => {
        const socket = connect({ host: target.hostname, port, timeout: 1500 })
        const done = (ok: boolean) => { socket.destroy(); resolve(ok) }
        socket.once('connect', () => done(true))
        socket.once('error', () => done(false))
        socket.once('timeout', () => done(false))
      })
      check = { at: Date.now(), up }
    }
    return check.up
  }
  const middleware = (log: (msg: string) => void) => (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!/^(\/dev\/pharmacy)?\/procurement-api\//.test(req.url ?? '')) return next()
    reachable().then((up) => {
      if (up !== lastUp) {
        lastUp = up
        log(up
          ? `Procurement Centre connected at ${PROCUREMENT_URL}`
          : `Procurement Centre not reachable at ${PROCUREMENT_URL}: New order / Order more will say it is not connected. Start it, or set PROCUREMENT_URL.`)
      }
      if (up) return next()
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Procurement Centre is not connected yet' }))
    })
  }
  return {
    name: 'procurement-offline',
    configureServer(server) {
      server.middlewares.use(middleware((m) => server.config.logger.warn(m, { timestamp: true })))
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware((m) => server.config.logger.warn(m, { timestamp: true })))
    },
  }
}

// HTTPS=1 serves dev/preview over https with a self-signed certificate, so the
// microphone (To-do voice) works from other machines on the network. Browsers
// warn about the certificate once; production uses the server's real one.
const https = process.env.HTTPS === '1'

/**
 * The To-do's offline speech engine (vosk-browser) ships its worker inlined and
 * starts it from a blob: URL. Its WebAssembly glue builds functions from strings,
 * which needs 'unsafe-eval'. Rather than allow that for the whole page, the build
 * writes the same worker out as voice/vosk-worker.js, the app starts it from there,
 * and only that file is served with the looser policy (deploy/nginx-dev-pharmacy.conf).
 */
function voskWorker(): Plugin {
  const source = () => {
    const js = readFileSync(new URL('./node_modules/vosk-browser/dist/vosk.js', import.meta.url), 'utf8')
    const marker = "createBase64WorkerFactory('"
    const start = js.indexOf(marker) + marker.length
    const end = js.indexOf("'", start)
    if (start < marker.length || end < 0) throw new Error('vosk-browser: inlined worker not found')
    const b64 = js.slice(start, end)
    const text = Buffer.from(b64, 'base64').toString('utf8')
    return text.substring(text.indexOf('\n', 10) + 1) // as vosk-browser does: drop its first line
  }
  return {
    name: 'vosk-worker',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'voice/vosk-worker.js', source: source() })
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('/voice/vosk-worker.js')) return next()
        res.setHeader('Content-Type', 'application/javascript')
        res.end(source())
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), voskWorker(), procurementOffline(), ...(https ? [basicSsl()] : [])],
  // The console is served at /dev/pharmacy/ (see DEPLOY.md). Leading and trailing slashes
  // matter: without them the logo and the procurement link resolved to the wrong path.
  base: '/dev/pharmacy/',
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
