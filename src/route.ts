/**
 * The console's address, so browser Back/Forward, bookmarks and shared links
 * work. Hash-based (#/queue, #/dispense/RX-2026-00455) so it needs no server
 * rewrite rules on a plain static host.
 */
import { PRODUCTS, productName, type Location } from './data';
import type { Section, StockFilter } from './store';

export type StockLoc = Location | 'All';

export interface Route {
  section: Section;
  rx: string | null;
  entering: boolean;
  filter: StockFilter;
  /** Stock list location: ?at=pharmacy or ?at=store; absent means all locations. */
  loc: StockLoc;
  product: string | null;
  bill: string | null;
}

const AT: Record<string, Location> = { pharmacy: 'Main Pharmacy', store: 'Main Store' };
const atOf = (l: Location) => (l === 'Main Pharmacy' ? 'pharmacy' : 'store');

const FILTERS: StockFilter[] = ['all', 'low', 'expiring', 'expired'];
const SECTIONS: Section[] = ['dashboard', 'queue', 'billing', 'stock', 'receive', 'reports', 'patients', 'manufacturers', 'staff', 'settings'];

export function parseHash(hash: string): Route {
  const r: Route = { section: 'dashboard', rx: null, entering: false, filter: 'all', loc: 'All', product: null, bill: null };
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [head, id] = path.split('/').map(decodeURIComponent);
  if (head === 'dispense' && id) return { ...r, section: 'queue', rx: id };
  if (head === 'queue' && id === 'new') return { ...r, section: 'queue', entering: true };
  if ((SECTIONS as string[]).includes(head)) r.section = head as Section;
  if (r.section === 'billing' && id) r.bill = id;
  if (r.section === 'stock') {
    // An unknown medicine id falls back to the list, and the address is corrected.
    if (id && PRODUCTS.some((p) => p.id === id)) r.product = id;
    const params = new URLSearchParams(query);
    const show = params.get('show') as StockFilter | null;
    if (show && FILTERS.includes(show)) r.filter = show;
    const at = AT[params.get('at') ?? ''];
    if (at) r.loc = at;
  }
  return r;
}

export function toHash(r: Route): string {
  if (r.rx) return `#/dispense/${encodeURIComponent(r.rx)}`;
  if (r.entering) return '#/queue/new';
  switch (r.section) {
    case 'dashboard': return '#/';
    case 'billing': return r.bill ? `#/billing/${encodeURIComponent(r.bill)}` : '#/billing';
    case 'stock': {
      if (r.product) return `#/stock/${encodeURIComponent(r.product)}`;
      const q = [r.filter !== 'all' ? `show=${r.filter}` : '', r.loc !== 'All' ? `at=${atOf(r.loc)}` : ''].filter(Boolean).join('&');
      return q ? `#/stock?${q}` : '#/stock';
    }
    default: return `#/${r.section}`;
  }
}

/** Moving to a different screen adds a history entry; a filter or selection within one replaces it. */
export const pageOf = (r: Route) =>
  r.rx ? `rx:${r.rx}` : r.entering ? 'new' : r.section === 'stock' && r.product ? `stock:${r.product}` : r.section;

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard', queue: 'Queue', billing: 'Billing', stock: 'Stock', receive: 'Receive', new: 'New prescription',
  reports: 'Reports', patients: 'Patients', manufacturers: 'Manufacturers', staff: 'Staff', settings: 'Settings',
};
const productTitle = (id: string) => {
  const p = PRODUCTS.find((x) => x.id === id);
  return p ? `${productName(p)} · Stock` : 'Stock';
};
export const titleOf = (r: Route) =>
  `${r.rx ? `Dispense ${r.rx}` : r.section === 'stock' && r.product ? productTitle(r.product) : TITLES[pageOf(r)] ?? 'Pharmacy'} · SHRI-AI Pharmacy`;
