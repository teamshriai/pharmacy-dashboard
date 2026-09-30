# SHRI-AI Pharmacy Console

Hospital pharmacy workspace for pharmacists: prescription queue, dispensing
with FEFO batch selection and clinical checks, billing, stock and goods receipt,
reports, patients, manufacturers, staff and settings.

Pharmacy data is sample data held in the browser; a page refresh resets it.
The one outside connection is **Order more**, which sends a request to the
Indostates Procurement Centre (see below).

## Run

```bash
npm install
npm run dev       # http://localhost:5174, development with hot reload
npm run build     # type-check and build to dist/
npm run preview   # serve dist/ on the local network at port 4174
```

`dev` and `preview` bind to every network interface, so other machines on the
same network can open the console at `http://<this-machine's-IP>:4174/`.

## Procurement (Order more)

Order more on the Stock list, or on a medicine's page, sends a new **Pharmacy**
request to the Procurement Centre, where it appears under *Waiting for vendor*.
Only the request fields are sent: department, requested by, priority (Urgent
when the medicine is low), and the item with its quantity. Vendor, price and
delivery date are left to Procurement. The form shows Procurement's old price
and an estimate, and converts tablets to the catalogue's strips.

- The console's server forwards `/procurement-api/*` to the Procurement
  Centre's `/api/*`, so the browser only talks to its own origin. Point it at
  another address with `PROCUREMENT_URL=http://host:port npm run preview`
  (default `http://192.168.29.164:4000`).
- Which of our medicines map to which catalogue SKU, and the pack size, is in
  `src/procurement.ts`. Atorvastatin 20 mg and Omeprazole 20 mg are not in the
  catalogue, so they cannot be requested until Procurement adds them.

## Layout

```
src/
  main.tsx          entry
  PharmacyApp.tsx   shell: sidebar, header search, screen switch
  store.ts          every action that changes state; each writes an audit entry
  route.ts          the address (#/stock/clp75 …) so Back/Forward and links work
  data.ts           sample data and rules (FEFO, expiry bands, sales-based
                    low-stock level, allergy and interaction checks, bill maths)
  procurement.ts    Order more → Procurement Centre request
  Dashboard.tsx  Queue.tsx  NewRx.tsx  Dispense.tsx  Billing.tsx
  Stock.tsx  Receive.tsx  Reports.tsx  Patients.tsx  Manufacturers.tsx
  Staff.tsx  Settings.tsx                         one file per screen
  charts.tsx        dashboard charts
  assistant.ts      the Ask helper: answers only from the console's own records
  parts.tsx         shared badges, chips, gauges
  pharmacy.css      console styles
  design/           the SHRI-AI design system: theme, layout shell, nav,
                    icons, fonts. Shared look with the patient registration app,
                    copied here so this project stands alone.
```

## Notes

- Allergy and interaction rules are samples (penicillin; clopidogrel with
  omeprazole). Production use needs a full drug-interaction database.
- New patient MRNs are generated locally; in a live system they come from
  registration, and IP numbers from admissions.
- Manufacturer names are real companies used for a recognisable demo; which
  maker a medicine is listed under, and its distributor, is sample data.
