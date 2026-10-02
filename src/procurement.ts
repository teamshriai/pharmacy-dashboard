/**
 * Order more → a new request in the Indostates Procurement Centre, where it
 * waits for procurement to choose a vendor and price.
 *
 * Only what a "Waiting for vendor" request holds is sent: the department
 * (Pharmacy), who asked, whether it is urgent, and each item with its quantity.
 * Vendor, price and delivery date are procurement's to fill in.
 *
 * Calls go to procurement-api (relative to the page, so it also works under a
 * sub-path such as /dev/pharmacy/), which the console's own server forwards to
 * the Procurement Centre (vite.config.ts in development, NGINX in production),
 * so the browser never calls another origin directly.
 */
import { productById, productName } from './data';

const API = 'procurement-api';

/**
 * This pharmacy's medicines in the procurement catalogue, by SKU, with how many
 * of our dispensing units make one procurement unit (tablets per strip).
 * Atorvastatin 20 mg and Omeprazole 20 mg are not in the catalogue, so they are
 * left out rather than matched to a different strength or medicine.
 */
const CATALOGUE: Record<string, { sku: string; pack: number }> = {
  met500: { sku: 'MED-0021', pack: 20 },
  asp75: { sku: 'MED-0017', pack: 14 },
  clp75: { sku: 'MED-0019', pack: 15 },
  amc625: { sku: 'MED-0006', pack: 10 },
  cef1g: { sku: 'MED-0004', pack: 1 },
  pan40iv: { sku: 'MED-0026', pack: 1 },
  pcm1g: { sku: 'MED-0014', pack: 1 },
  ins40: { sku: 'MED-0023', pack: 1 },
  adr1: { sku: 'MED-0039', pack: 1 },
  atr06: { sku: 'MED-0040', pack: 1 },
};

const DEPARTMENT = 'Pharmacy';

export const inCatalogue = (productId: string) => productId in CATALOGUE;

/** Our quantity in the catalogue's units, rounded up to whole packs. */
export function packsFor(productId: string, qty: number) {
  const c = CATALOGUE[productId];
  return c ? { packs: Math.ceil(qty / c.pack), pack: c.pack } : null;
}

export interface CatalogueItem {
  id: number;
  sku: string;
  name: string;
  unit: string;
  /** Procurement's last price per unit: the "Old price" on its requests. */
  price: number;
  manufacturer: string | null;
  strength: string | null;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Procurement Centre could not be reached');
  }
  let data: unknown = null;
  // A server with no procurement route may answer with the console's own HTML page.
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  if (isJson) {
    try {
      data = await res.json();
    } catch {
      /* malformed body */
    }
  }
  if (res.ok && data === null) throw new Error('Procurement Centre could not be reached');
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new Error(msg || (res.status >= 500 || res.status === 404 ? 'Procurement Centre could not be reached' : `Procurement refused the request (${res.status})`));
  }
  return data as T;
}

/** "1 strip", "26 strips". */
export const units = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** The catalogue is read at most once a minute, so opening several order forms stays quick. */
let cached: { at: number; items: Promise<CatalogueItem[]> } | null = null;
function catalogue() {
  if (!cached || Date.now() - cached.at > 60_000) {
    const items = call<CatalogueItem[]>('GET', '/items');
    cached = { at: Date.now(), items };
    items.catch(() => (cached = null));
  }
  return cached.items;
}

/** Procurement's old price for a medicine, per its unit (e.g. ₹105 per strip), or null if unknown. */
export async function oldPrice(productId: string): Promise<{ price: number; unit: string } | null> {
  const c = CATALOGUE[productId];
  if (!c) return null;
  const item = (await catalogue()).find((i) => i.sku === c.sku);
  return item && typeof item.price === 'number' ? { price: item.price, unit: item.unit } : null;
}

/** Procurement's catalogue entry for each of these medicines (SKU, brand, strength, unit, old price). */
export async function catalogueFor(productIds: string[]): Promise<Record<string, CatalogueItem>> {
  const items = await catalogue();
  const out: Record<string, CatalogueItem> = {};
  for (const id of productIds) {
    const c = CATALOGUE[id];
    const item = c && items.find((i) => i.sku === c.sku);
    if (item) out[id] = item;
  }
  return out;
}

/** How many of our units make one catalogue unit (e.g. 15 tablets per strip). */
export const packOf = (productId: string) => CATALOGUE[productId]?.pack ?? 1;

export interface SentRequest {
  requestNo: string;
  packs: number;
  unit: string;
}

/** Sends one medicine as a new Pharmacy request. Throws with a plain message if it cannot. */
export async function sendRequest(o: { productId: string; qty: number; urgent: boolean; requestedBy: string }): Promise<SentRequest> {
  const sent = await sendOrder({ lines: [{ productId: o.productId, qty: o.qty }], urgent: o.urgent, requestedBy: o.requestedBy });
  return { requestNo: sent.requestNo, packs: sent.lines[0].packs, unit: sent.lines[0].unit };
}

export interface SentOrder {
  requestNo: string;
  lines: { productId: string; qty: number; packs: number; unit: string }[];
}

/**
 * Sends several medicines as one Pharmacy request (the New order form).
 * Quantities are in our units and converted to the catalogue's packs.
 */
export async function sendOrder(o: { lines: { productId: string; qty: number }[]; urgent: boolean; requestedBy: string; notes?: string }): Promise<SentOrder> {
  const missing = o.lines.filter((l) => !CATALOGUE[l.productId]);
  if (missing.length) throw new Error(`${missing.map((l) => productName(productById(l.productId))).join(', ')} not in the procurement catalogue`);

  const [departments, items] = await Promise.all([
    call<{ id: number; name: string }[]>('GET', '/departments'),
    catalogue(),
  ]);
  const dept = departments.find((d) => d.name === DEPARTMENT);
  if (!dept) throw new Error('Procurement has no Pharmacy department');

  const lines = o.lines.map((l) => {
    const c = CATALOGUE[l.productId];
    const item = items.find((i) => i.sku === c.sku);
    if (!item) throw new Error(`${c.sku} is no longer in the procurement catalogue`);
    return { ...l, item, packs: Math.ceil(l.qty / c.pack) };
  });
  const sent = await call<{ request_no: string }>('POST', '/requests', {
    department_id: dept.id,
    requested_by: o.requestedBy,
    priority: o.urgent ? 'URGENT' : 'NORMAL',
    ...(o.notes ? { notes: o.notes } : {}),
    items: lines.map((l) => ({ item_id: l.item.id, quantity: l.packs, brand: l.item.manufacturer ?? '', strength: l.item.strength ?? '' })),
  });
  return { requestNo: sent.request_no, lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, packs: l.packs, unit: l.item.unit })) };
}
