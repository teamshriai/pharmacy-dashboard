# Deploying to https://www.shri-ai.org/dev/pharmacy/

The console is a static site. Build it on your machine, copy `dist/` to the EC2
server, and NGINX serves it from a sub-path of the existing `www.shri-ai.org`
site. No Node.js is needed on the server.

```
your machine                          EC2 (NGINX, Let's Encrypt already set up)
────────────                          ──────────────────────────────────────────
npm ci && npm run check  ──dist/──▶   /var/www/shri-ai/releases/<timestamp>/
                                      /var/www/shri-ai/dev/pharmacy  ─symlink─▶ current release
```

## 1. Build locally

Requires Node.js 20 or newer (`nvm use` picks it up from `.nvmrc`).

```bash
npm ci            # exact versions from package-lock.json
npm run voice-model   # once: downloads the offline voice model (~36 MB) into public/voice/
npm run check     # lint + type-check + production build into dist/
```

The build is made for `/dev/pharmacy/` (`base: '/dev/pharmacy/'` in
`vite.config.ts`); to serve it somewhere else, change `base` and rebuild.
There are no build-time environment variables to set.

Optional local check before uploading: `npm run preview` serves `dist/` at
http://localhost:4174/.

## 2. One-time server setup

```bash
# on the EC2 instance
sudo mkdir -p /var/www/shri-ai/releases /var/www/shri-ai/dev
sudo chown -R $USER:www-data /var/www/shri-ai

# NGINX snippet: copy deploy/nginx-dev-pharmacy.conf from this repo
sudo cp nginx-dev-pharmacy.conf /etc/nginx/snippets/dev-pharmacy.conf
```

Then add one line **inside** the existing HTTPS `server { … server_name www.shri-ai.org; … }`
block (usually in `/etc/nginx/sites-available/`), alongside the certbot-managed
`ssl_certificate` lines:

```nginx
include /etc/nginx/snippets/dev-pharmacy.conf;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The HTTPS certificate, HTTP→HTTPS redirect and HSTS belong to that existing
server block, so nothing about TLS changes.

## 3. Each release

From the project folder on your machine (replace `ubuntu@EC2_HOST` and the key):

```bash
REL=$(date +%Y%m%d-%H%M%S)
KEY=~/.ssh/your-ec2-key.pem
HOST=ubuntu@EC2_HOST

rsync -az --delete -e "ssh -i $KEY" dist/ $HOST:/var/www/shri-ai/releases/$REL/
ssh -i $KEY $HOST "ln -sfn /var/www/shri-ai/releases/$REL /var/www/shri-ai/dev/pharmacy.new \
  && mv -T /var/www/shri-ai/dev/pharmacy.new /var/www/shri-ai/dev/pharmacy"
```

Swapping a symlink is atomic: visitors never see a half-copied release, and no
NGINX reload is needed. Browsers pick up the new version on their next page load
(`index.html` is served with `Cache-Control: no-cache`; the hashed files in
`assets/` are cached for a year).

If you copy the folder by hand instead (e.g. WinSCP/FileZilla), copy the
**contents** of `dist/` so that `/var/www/shri-ai/dev/pharmacy/index.html` exists.

### Roll back

```bash
ssh -i $KEY $HOST "ls -1 /var/www/shri-ai/releases"          # pick the previous one
ssh -i $KEY $HOST "ln -sfn /var/www/shri-ai/releases/<previous> /var/www/shri-ai/dev/pharmacy.new \
  && mv -T /var/www/shri-ai/dev/pharmacy.new /var/www/shri-ai/dev/pharmacy"
```

Delete old releases now and then: `ls -1dt /var/www/shri-ai/releases/* | tail -n +6 | xargs rm -rf`
keeps the latest five.

## 4. Check the deployment

```bash
B=https://www.shri-ai.org/dev/pharmacy
curl -sI $B            | grep -i location        # 301 → /dev/pharmacy/
curl -sI $B/           | grep -iE "^HTTP|cache-control|content-security"
curl -s  $B/procurement-api/departments          # {"error":"Procurement Centre is not connected yet"}
```

In a browser, open https://www.shri-ai.org/dev/pharmacy/ and check:

- The dashboard loads, and the DevTools console has no errors or CSP violations.
- Switching between screens works, and Back/Forward move between them.
- Night/day mode switches, and a reload keeps your choice.
- On a phone: the ☰ button opens the menu, and pages don't scroll sideways.
- Stock → Order more shows "Procurement Centre is not connected yet".

## To-do voice (offline speech)

The Dashboard To-do takes tasks by voice with an offline engine (vosk-browser,
Indian English model): the microphone is turned into text inside the browser,
nothing is sent anywhere, and it works in Brave, Firefox, Chrome and Edge.

- The model is not in git. `npm run voice-model` puts it in `public/voice/`, and
  the build copies it to `dist/voice/`. Without it, voice falls back to the
  browser's own speech service (Chrome/Edge only, sends audio to Google/Microsoft)
  or says it is not installed.
- The build also writes `dist/voice/vosk-worker.js`. The NGINX snippet gives only
  that file a policy allowing `'unsafe-eval' 'wasm-unsafe-eval'` (the engine needs
  it); the page itself keeps `script-src 'self'`.
- Browsers allow the microphone only over https (or localhost), and the snippet's
  `Permissions-Policy` must keep `microphone=(self)`.
- On the local network, `npm run preview:https` serves the console at
  `https://<this-machine's-IP>:4443/dev/pharmacy/` with a self-signed
  certificate (accept the browser's warning once).

## Procurement Centre ("Order more")

The console sends requests to `procurement-api/…` on its own origin. In
production, `deploy/nginx-dev-pharmacy.conf` answers those with a clear 503
until the Procurement Centre is deployed. When it is:

1. In the snippet, replace the `default_type` / `add_header` / `return 503`
   lines with the commented `proxy_pass` block, and set `PROCUREMENT_HOST` to an
   address the EC2 instance can reach (a private VPC IP or internal hostname).
   The old LAN address `192.168.29.164` is not reachable from AWS.
2. `sudo nginx -t && sudo systemctl reload nginx`. No rebuild of the console is
   needed.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Blank page, 404s for `assets/…` in the console | `dist/` contents not at `/var/www/shri-ai/dev/pharmacy/`, or the snippet is not included in the HTTPS server block. |
| 403 Forbidden | NGINX can't read the files: `sudo chmod -R o+rX /var/www/shri-ai` (or give group `www-data` read access). |
| Old version still showing | A hard reload fixes it for one browser. If everyone sees it, check the symlink: `readlink /var/www/shri-ai/dev/pharmacy`. |
| `/dev/pharmacy` shows the main site | Another `location` in the server block matches first. Keep the snippet's `^~` prefixes and include it before any regex locations. |
