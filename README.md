# SHRI HEALTH Pharmacy Console

Hospital pharmacy workspace for pharmacists: a Dashboard with the prescription
queue, Needs action, New order and a voice To-do; dispensing with FEFO batch
selection and clinical checks; billing; inventory;
reports, patients, staff and settings. Inventory lists each medicine's category and
manufacturer, and both columns filter by several values at once.

> **Demo build.** All pharmacy data is sample data held in the browser. A page
> refresh resets it, and there is no login. See *Before live use* below.

The one outside connection is ordering (**New order** on the Dashboard, and
**Order more** in Inventory), which sends a request to the
Indostates Procurement Centre (see below).

Works on phones, tablets and desktops: below 1024px the sidebar becomes a menu
bar with a slide-in drawer, and wide tables scroll sideways or stack into cards.

## Run

Requires Node.js 20 or newer (see `.nvmrc`).

```bash
npm ci
npm run dev       # http://localhost:5174, development with hot reload
npm run check     # lint + type-check + build to dist/ (run before every deploy)
npm run build     # type-check and build to dist/
npm run preview   # serve dist/ on the local network at port 4174
npm run voice-model    # once: offline voice model for the Dashboard To-do (~36 MB)
npm run preview:https  # same, over https at port 4443, so the microphone works
```

`dev` and `preview` bind to every network interface, so other machines on the
same network can open the console at `http://<this-machine's-IP>:4174/`.

## Deploy

`dist/` is a static site with relative paths, so it can be served from any
folder. Production is https://www.shri-ai.org/dev/pharmacy/ behind NGINX on
EC2: see **[DEPLOY.md](DEPLOY.md)** for the step-by-step guide, and
[`deploy/nginx-dev-pharmacy.conf`](deploy/nginx-dev-pharmacy.conf) for the
NGINX config (caching, compression, security headers, procurement route).

## Procurement (New order, Order more)

New order (the Dashboard's order form, `#/order`), or Order more on the Inventory
list or a medicine's page, sends a new **Pharmacy**
request to the Procurement Centre, where it appears under *Waiting for vendor*.
Only the request fields are sent: department, requested by, priority (Urgent
when the medicine is low), and the item with its quantity. Vendor, price and
delivery date are left to Procurement. The form shows Procurement's old price
and an estimate, and converts tablets to the catalogue's strips.

- The console calls `procurement-api/*` on its own origin, and the server
  forwards that to the Procurement Centre's `/api/*`, so the browser never
  calls another origin directly.
  - In development, `vite.config.ts` does the forwarding. Point it at the
    Procurement Centre with `PROCUREMENT_URL=http://host:port npm run dev`
    (default `http://localhost:4000`; see `.env.example`).
  - In production, NGINX does it. Until the Procurement Centre is deployed,
    NGINX answers with a clear "not connected yet" message (see DEPLOY.md).
- Which of our medicines map to which catalogue SKU, and the pack size, is in
  `src/procurement.ts`. Atorvastatin 20 mg and Omeprazole 20 mg are not in the
  catalogue, so they cannot be requested until Procurement adds them.

## Layout

```
src/
  main.tsx          entry
  ErrorBoundary.tsx shows a Reload screen instead of a blank page on a crash
  PharmacyApp.tsx   shell: sidebar / mobile drawer, header search, screen switch
  store.ts          every action that changes state; each writes an audit entry
  route.ts          the address (#/stock/clp75 …) so Back/Forward and links work
  data.ts           sample data and rules (FEFO, expiry bands, sales-based
                    low-stock level, allergy and interaction checks, bill maths)
  procurement.ts    New order / Order more → Procurement Centre request
  Dashboard.tsx (with the prescription queue)  NewOrder.tsx  Todo.tsx
  NewRx.tsx (#/new)  Dispense.tsx  Billing.tsx  Stock.tsx (Inventory)
  Reports.tsx  Patients.tsx
  Staff.tsx  Settings.tsx                         one file per screen
  charts.tsx        dashboard charts
  assistant.ts      the Ask helper: answers only from the console's own records
  parts.tsx         shared badges, chips, gauges
  download.ts       saves generated PDFs and CSVs (works on iOS Safari)
  pharmacy.css      console styles
  design/           the SHRI HEALTH design system: theme, layout shell, nav,
                    icons, fonts. Shared look with the patient registration app,
                    copied here so this project stands alone.
public/
  favicon-192.png   SHRI HEALTH logo: sidebar logo, favicon, and source of
                    favicon-32.png and apple-touch-icon.png (white background for iOS)
  theme-init.js     applies the saved theme before first paint
deploy/
  nginx-dev-pharmacy.conf   NGINX location block for /dev/pharmacy/
```

## Before live use

This build is ready to host as a demo. Using it with real patients needs:

- A backend and database, so records persist and are shared between staff.
- Login, roles and an audit trail tied to real users (today the user is fixed
  as "Kumar · Pharmacist").
- A proper GST invoice: GSTIN, drug licence number and pharmacy address on the
  PDF bill. The PDF also drops patient names written in non-Latin scripts.
- A full drug-interaction database (see below).
- The Procurement Centre deployed where the EC2 server can reach it.

## Notes

- Allergy and interaction rules are samples (penicillin; clopidogrel with
  omeprazole). Production use needs a full drug-interaction database.
- New patient MRNs are generated locally; in a live system they come from
  registration, and IP numbers from admissions.
- Manufacturer names are real companies used for a recognisable demo; which
  maker a medicine is listed under, and its distributor, is sample data.
