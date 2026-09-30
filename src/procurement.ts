/**
 * Order more → a new request in the Indostates Procurement Centre, where it
 * waits for procurement to choose a vendor and price.
 *
 * Only what a "Waiting for vendor" request holds is sent: the department
 * (Pharmacy), who asked, whether it is urgent, and each item with its quantity.
 * Vendor, price and delivery date are procurement's to fill in.
 *
 * Calls go to /procurement-api, which the console's own server forwards to the
 * Procurement Centre (see vite.config.ts), so the browser never calls another
 * origin directly.
 */
import { productById, productName } from './data';

const API = '/procurement-api';

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

interface CatalogueItem {
  id: number;
  sku: string;
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
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
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

export interface SentRequest {
  requestNo: string;
  packs: number;
  unit: string;
}

/** Sends one medicine as a new Pharmacy request. Throws with a plain message if it cannot. */
export async function sendRequest(o: { productId: string; qty: number; urgent: boolean; requestedBy: string }): Promise<SentRequest> {
  const c = CATALOGUE[o.productId];
  if (!c) throw new Error(`${productName(productById(o.productId))} is not in the procurement catalogue`);

  const [departments, items] = await Promise.all([
    call<{ id: number; name: string }[]>('GET', '/departments'),
    catalogue(),
  ]);
  const dept = departments.find((d) => d.name === DEPARTMENT);
  if (!dept) throw new Error('Procurement has no Pharmacy department');
  const item = items.find((i) => i.sku === c.sku);
  if (!item) throw new Error(`${c.sku} is no longer in the procurement catalogue`);

  const packs = Math.ceil(o.qty / c.pack);
  const sent = await call<{ request_no: string }>('POST', '/requests', {
    department_id: dept.id,
    requested_by: o.requestedBy,
    priority: o.urgent ? 'URGENT' : 'NORMAL',
    items: [{ item_id: item.id, quantity: packs, brand: item.manufacturer ?? '', strength: item.strength ?? '' }],
  });
  return { requestNo: sent.request_no, packs, unit: item.unit };
}
