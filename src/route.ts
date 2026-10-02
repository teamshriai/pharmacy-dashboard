/**
 * The console's address, so browser Back/Forward, bookmarks and shared links
 * work. Hash-based (#/queue, #/dispense/RX-2026-00455) so it needs no server
 * rewrite rules on a plain static host.
 */
import { CATEGORIES, MANUFACTURERS, PRODUCTS, productName, type Category, type Location } from './data';
import type { Section, StockFilter } from './store';

export type StockLoc = Location | 'All';

export interface Route {
  section: Section;
  rx: string | null;
  entering: boolean;
  filter: StockFilter;
  /** Stock list location: ?at=pharmacy or ?at=store; absent means all locations. */
  loc: StockLoc;
  /** Inventory filters, several values each: ?cat=antibiotic,cardiac&maker=drl,sun */
  cats: Category[];
  makers: string[];
  product: string | null;
  bill: string | null;
}

const AT: Record<string, Location> = { pharmacy: 'Main Pharmacy', store: 'Main Store' };
const atOf = (l: Location) => (l === 'Main Pharmacy' ? 'pharmacy' : 'store');

const FILTERS: StockFilter[] = ['all', 'low', 'expiring', 'expired'];
const SECTIONS: Section[] = ['dashboard', 'order', 'billing', 'stock', 'reports', 'patients', 'staff', 'settings'];
/** Inventory lives at #/inventory; older #/stock and #/manufacturers links still open it. */
const INVENTORY_ALIASES = ['inventory', 'stock', 'manufacturers'];

export function parseHash(hash: string): Route {
  const r: Route = { section: 'dashboard', rx: null, entering: false, filter: 'all', loc: 'All', cats: [], makers: [], product: null, bill: null };
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [head, id] = path.split('/').map(decodeURIComponent);
  // The prescription queue lives on the Dashboard; old #/queue links open it there.
  if (head === 'dispense' && id) return { ...r, section: 'dashboard', rx: id };
  if (head === 'new' || (head === 'queue' && id === 'new')) return { ...r, section: 'dashboard', entering: true };
  if (INVENTORY_ALIASES.includes(head)) r.section = 'stock';
  else if ((SECTIONS as string[]).includes(head)) r.section = head as Section;
  if (r.section === 'billing' && id) r.bill = id;
  if (r.section === 'stock') {
    // An unknown medicine id falls back to the list, and the address is corrected.
    if (id && PRODUCTS.some((p) => p.id === id)) r.product = id;
    const params = new URLSearchParams(query);
    const show = params.get('show') as StockFilter | null;
    if (show && FILTERS.includes(show)) r.filter = show;
    const at = AT[params.get('at') ?? ''];
    if (at) r.loc = at;
    const list = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
    r.cats = list('cat').filter((c): c is Category => CATEGORIES.some((x) => x.key === c));
    r.makers = list('maker').filter((m) => MANUFACTURERS.some((x) => x.id === m));
  }
  return r;
}

export function toHash(r: Route): string {
  if (r.rx) return `#/dispense/${encodeURIComponent(r.rx)}`;
  if (r.entering) return '#/new';
  switch (r.section) {
    case 'dashboard': return '#/';
    case 'billing': return r.bill ? `#/billing/${encodeURIComponent(r.bill)}` : '#/billing';
    case 'stock': {
      if (r.product) return `#/inventory/${encodeURIComponent(r.product)}`;
      const q = [
        r.filter !== 'all' ? `show=${r.filter}` : '',
        r.loc !== 'All' ? `at=${atOf(r.loc)}` : '',
        r.cats.length ? `cat=${r.cats.join(',')}` : '',
        r.makers.length ? `maker=${r.makers.join(',')}` : '',
      ].filter(Boolean).join('&');
      return q ? `#/inventory?${q}` : '#/inventory';
    }
    default: return `#/${r.section}`;
  }
}

/** Moving to a different screen adds a history entry; a filter or selection within one replaces it. */
export const pageOf = (r: Route) =>
  r.rx ? `rx:${r.rx}` : r.entering ? 'new' : r.section === 'stock' && r.product ? `stock:${r.product}` : r.section;

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard', order: 'New order', billing: 'Billing', stock: 'Inventory', new: 'New prescription',
  reports: 'Reports', patients: 'Patients', staff: 'Staff', settings: 'Settings',
};
const productTitle = (id: string) => {
  const p = PRODUCTS.find((x) => x.id === id);
  return p ? `${productName(p)} · Inventory` : 'Inventory';
};
export const titleOf = (r: Route) =>
  `${r.rx ? `Dispense ${r.rx}` : r.section === 'stock' && r.product ? productTitle(r.product) : TITLES[pageOf(r)] ?? 'Pharmacy'} · SHRI HEALTH Pharmacy`;
