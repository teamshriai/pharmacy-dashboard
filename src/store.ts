import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pageOf, parseHash, titleOf, toHash, type StockLoc } from './route';
import { sendOrder, sendRequest, units } from './procurement';
import {
  BATCHES,
  BILLS,
  billLine,
  sumBill,
  txnId,
  DISPENSED_EARLIER,
  MANUFACTURERS,
  PRESCRIPTIONS,
  PRODUCTS,
  TAT_TARGET_MIN,
  USER,
  band,
  plusDays,
  productById,
  productName,
  type AuditEvent,
  type Batch,
  type Bill,
  type Payment,
  type Category,
  type Location,
  type Order,
  type Patient,
  type Prescription,
  type RxLine,
  type RxType,
} from './data';

export type Section = 'dashboard' | 'order' | 'billing' | 'stock' | 'reports' | 'patients' | 'staff' | 'settings';
export type StockFilter = 'all' | 'low' | 'expiring' | 'expired';

export type Picks = Record<string, { batchId: string; qty: number }[]>;

const SEED_AUDIT: AuditEvent[] = [
  { id: 'a3', at: plusDays(0), user: 'Kumar', action: 'GRN posted', detail: 'INV-88104 · 4 lines · Main Store' },
  { id: 'a2', at: plusDays(0), user: 'Priya', action: 'Dispensed', detail: 'RX-2026-00447 · 2 items' },
  { id: 'a1', at: plusDays(0), user: 'Priya', action: 'Quarantined', detail: 'Ondansetron 4 mg · ON221 · Damaged' },
];
SEED_AUDIT[0].at.setHours(9, 55);
SEED_AUDIT[1].at.setHours(9, 31);
SEED_AUDIT[2].at.setHours(8, 47);

const MAKERS_KEY = 'shri-pharmacy-makers';
function loadMakers(): Record<string, string> {
  const base = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.mfr]));
  try {
    const saved = JSON.parse(localStorage.getItem(MAKERS_KEY) ?? '{}');
    for (const [pid, mid] of Object.entries(saved)) if (pid in base && MANUFACTURERS.some((m) => m.id === mid)) base[pid] = mid as string;
  } catch {
    /* defaults */
  }
  return base;
}

const TAT_KEY = 'shri-pharmacy-tat';
type Tat = typeof TAT_TARGET_MIN;

/** Turnaround targets chosen in Settings, remembered on this computer. */
function loadTat(): Tat {
  try {
    const v = JSON.parse(localStorage.getItem(TAT_KEY) ?? 'null');
    if (v && Number(v.stat) > 0 && Number(v.routine) > 0) Object.assign(TAT_TARGET_MIN, { stat: Number(v.stat), routine: Number(v.routine) });
  } catch {
    /* storage unavailable or unreadable: keep the defaults */
  }
  return { ...TAT_TARGET_MIN };
}


export function usePharmacyStore() {
  const [initial] = useState(() => {
    const r = parseHash(window.location.hash);
    // A link to an unknown or already-closed prescription opens the queue instead.
    const rx = PRESCRIPTIONS.find((x) => x.id === r.rx);
    return rx && (rx.status === 'New' || rx.status === 'Reviewing' || rx.status === 'On hold') ? r : { ...r, rx: null };
  });
  const [section, setSectionState] = useState<Section>(initial.section);
  const [activeRx, setActiveRx] = useState<string | null>(initial.rx);
  const [stockFilter, setStockFilter] = useState<StockFilter>(initial.filter);
  const [stockLoc, setStockLoc] = useState<StockLoc>(initial.loc);
  const [stockCats, setStockCats] = useState<Category[]>(initial.cats);
  const [stockMakers, setStockMakers] = useState<string[]>(initial.makers);
  const [focusProduct, setFocusProduct] = useState<string | null>(initial.product);
  /** The list row a medicine was opened from, and the scroll position, so coming back lands on it. */
  const [stockReturn, setStockReturn] = useState<{ id: string; y: number } | null>(null);
  /** Set while a history.back() from Back to Stock is in flight, so a double click steps back once. */
  const backing = useRef(false);
  const [batches, setBatches] = useState<Batch[]>(BATCHES);
  const [rxs, setRxs] = useState<Prescription[]>(PRESCRIPTIONS);
  const [audit, setAudit] = useState<AuditEvent[]>(SEED_AUDIT);
  const [dispensedToday, setDispensedToday] = useState(DISPENSED_EARLIER);
  /** When each dispense in this session happened, for the hourly chart. */
  const [dispenseTimes, setDispenseTimes] = useState<Date[]>([]);
  /** The medicine New order opens with, when started from a Needs action alert. */
  const [orderSeed, setOrderSeed] = useState<string | null>(null);
  function startOrder(productId?: string) {
    go('order');
    setOrderSeed(productId ?? null);
  }
  const [bills, setBills] = useState<Bill[]>(BILLS);
  const [entering, setEntering] = useState(initial.entering);
  /** One-line confirmation shown on the screen an action returns to. */
  const [flash, setFlash] = useState('');
  const [focusBill, setFocusBill] = useState<string | null>(initial.bill);
  const [tat, setTatState] = useState<Tat>(loadTat);
  const [orders, setOrders] = useState<Order[]>([]);
  /** Which manufacturer each medicine is stocked from; chosen per row in Inventory, kept on this computer. */
  const [makerChoice, setMakerChoice] = useState<Record<string, string>>(loadMakers);
  const makerIdOf = (productId: string) => makerChoice[productId] ?? productById(productId).mfr;
  const makerFor = (productId: string) => MANUFACTURERS.find((m) => m.id === makerIdOf(productId)) ?? MANUFACTURERS[0];
  function setMaker(productId: string, makerId: string) {
    if (makerIdOf(productId) === makerId) return;
    const next = { ...makerChoice, [productId]: makerId };
    setMakerChoice(next);
    try {
      localStorage.setItem(MAKERS_KEY, JSON.stringify(next));
    } catch {
      /* kept for this session only */
    }
    log('Maker set', `${productName(productById(productId))} · ${MANUFACTURERS.find((m) => m.id === makerId)?.name}`);
  }
  /** A short pop-up message that closes by itself. */
  const [toast, setToast] = useState<{ id: string; tone: 'ok' | 'error'; title: string; text: string; note?: string } | null>(null);

  /**
   * Sends the order to the Procurement Centre as a new request. Only once it is
   * accepted is it recorded here (On order) and the pharmacist told it was sent.
   */
  async function placeOrder(productId: string, qty: number) {
    const p = productById(productId);
    try {
      const sent = await sendRequest({ productId, qty, urgent: stockOf(productId) < p.reorder, requestedBy: `${USER.name} (${USER.role})` });
      setOrders((list) => [...list, { no: sent.requestNo, productId, qty, supplier: 'Procurement', at: new Date(), by: USER.name }]);
      log('Order placed', `${sent.requestNo} · ${productName(p)} · ${units(sent.packs, sent.unit)} · sent to Procurement`);
      setToast({ id: sent.requestNo, tone: 'ok', title: 'Request sent', text: `${sent.requestNo} · ${units(sent.packs, sent.unit)} · ${productName(p)}` });
      return true;
    } catch (e) {
      setToast({ id: 'err' + Date.now(), tone: 'error', title: 'Request not sent', text: (e as Error).message, note: 'Nothing was ordered. Try again in a moment.' });
      return false;
    }
  }
  /** New order (Dashboard): several medicines in one Procurement request. */
  async function placeMultiOrder(lines: { productId: string; qty: number }[], urgent: boolean, extra: { requestedBy?: string; notes?: string } = {}) {
    try {
      const sent = await sendOrder({ lines, urgent, requestedBy: extra.requestedBy?.trim() || `${USER.name} (${USER.role})`, notes: extra.notes?.trim() || undefined });
      const at = new Date();
      setOrders((list) => [...list, ...sent.lines.map((l) => ({ no: sent.requestNo, productId: l.productId, qty: l.qty, supplier: 'Procurement', at, by: USER.name }))]);
      log('Order placed', `${sent.requestNo} · ${sent.lines.map((l) => `${productById(l.productId).generic} ${units(l.packs, l.unit)}`).join(', ')} · sent to Procurement`);
      setToast({
        id: sent.requestNo,
        tone: 'ok',
        title: 'Request sent',
        text: `${sent.requestNo} · ${sent.lines.length === 1 ? `${units(sent.lines[0].packs, sent.lines[0].unit)} · ${productName(productById(sent.lines[0].productId))}` : `${sent.lines.length} medicines`}`,
      });
      return true;
    } catch (e) {
      setToast({ id: 'err' + Date.now(), tone: 'error', title: 'Request not sent', text: (e as Error).message, note: 'Nothing was ordered. Try again in a moment.' });
      return false;
    }
  }
  const onOrder = (productId: string) => orders.filter((o) => o.productId === productId).reduce((n, o) => n + o.qty, 0);

  /** turnaround() reads TAT_TARGET_MIN, so update it in place and re-render. */
  function setTat(next: Tat) {
    Object.assign(TAT_TARGET_MIN, next);
    setTatState({ ...next });
    try {
      localStorage.setItem(TAT_KEY, JSON.stringify(next));
    } catch {
      /* not remembered, still applied for this session */
    }
  }

  const log = (action: AuditEvent['action'], detail: string) =>
    setAudit((a) => [{ id: 'a' + Date.now() + Math.random(), at: new Date(), user: USER.name, action, detail }, ...a]);

  /** Navigating anywhere closes an open dispense workspace. */
  function go(s: Section, filter?: StockFilter) {
    setSectionState(s);
    setActiveRx(null);
    setEntering(false);
    setFlash('');
    if (filter) setStockFilter(filter);
    // Going to a section always shows its main list; openProduct and openBill pick an item after.
    setFocusProduct(null);
    setFocusBill(null);
    setStockReturn(null);
  }

  /** From a medicine's page to the Stock list: step back if that is where we came from, so history has no duplicate. */
  function backToStock() {
    if (backing.current) return;
    if ((window.history.state as { prev?: string } | null)?.prev === 'stock') {
      backing.current = true;
      window.history.back();
      // popstate normally clears this; never leave the button dead if it doesn't come.
      setTimeout(() => (backing.current = false), 1000);
    } else go('stock');
  }

  /** Opening a medicine from the Stock list remembers the row and scroll position for the way back. */
  function openFromList(productId: string) {
    setStockReturn({ id: productId, y: window.scrollY });
    setFocusProduct(productId);
  }

  /** Opens over the current screen, so cancelling returns to where it started. */
  function startEntry() {
    setActiveRx(null);
    setFlash('');
    setEntering(true);
  }

  /** Numbers the prescription after the highest one on file and queues it as New. */
  function addRx(entry: { patient: Patient; type: RxType; stat: boolean; doctor: string; lines: RxLine[] }) {
    const top = Math.max(...rxs.map((r) => Number(r.id.slice(-5))));
    const id = `RX-${new Date().getFullYear()}-${String(top + 1).padStart(5, '0')}`;
    const rx: Prescription = { ...entry, id, time: new Date(), status: 'New' };
    setRxs((list) => [...list, rx]);
    log('Rx entered', `${id} · ${entry.patient.name} · ${entry.lines.length} item${entry.lines.length === 1 ? '' : 's'} · ${entry.doctor}`);
    setEntering(false);
    return rx;
  }

  function openBill(no: string) {
    go('billing');
    setFocusBill(no);
  }

  /** `fresh` lets a just-created prescription open before state has caught up. */
  function openRx(id: string, fresh?: Prescription) {
    // A dispensed prescription is closed: it can be found, never dispensed twice.
    const r = fresh ?? rxs.find((x) => x.id === id);
    if (!r || r.status === 'Dispensed' || r.status === 'Partial') {
      go('dashboard');
      return;
    }
    setSectionState('dashboard');
    setActiveRx(id);
    setRxs((list) => list.map((r) => (r.id === id && r.status === 'New' ? { ...r, status: 'Reviewing' } : r)));
  }

  /** From anywhere to one medicine. Within Stock (e.g. via search) the list's filter and location are kept. */
  function openProduct(productId: string) {
    const within = section === 'stock' && !activeRx && !entering;
    go('stock', within ? undefined : 'all');
    if (!within) {
      setStockLoc('All');
      setStockCats([]);
      setStockMakers([]);
    }
    setFocusProduct(productId);
  }

  /**
   * Deducts every picked batch, issues the bill, closes the prescription and
   * records the event. Inpatient and emergency medicines go to the ward nurse
   * and are charged to the inpatient account rather than paid at the counter.
   */
  function dispense(rxId: string, picks: Picks, short: boolean, payment: Payment) {
    const rx = rxs.find((r) => r.id === rxId)!;
    const lines = Object.entries(picks).flatMap(([pid, ps]) =>
      ps.map((pk) => {
        const bt = batches.find((x) => x.id === pk.batchId)!;
        return billLine(pid, bt.batchNo, bt.expiry, pk.qty);
      })
    );
    const charged = payment === 'Account';
    const bill: Bill = {
      no: 'PB-' + rx.id.slice(-5) + '-' + String(Math.floor(Math.random() * 900 + 100)),
      txnId: txnId(),
      at: new Date(),
      rxId: rx.id,
      doctor: rx.doctor,
      patient: rx.patient,
      lines,
      ...sumBill(lines),
      payment,
      status: charged ? 'On account' : 'Paid',
      issuedTo: rx.patient.nurse,
      by: USER.name,
    };

    setBatches((list) =>
      list.map((bt) => {
        const used = Object.values(picks).flat().filter((p) => p.batchId === bt.id).reduce((n, p) => n + p.qty, 0);
        return used ? { ...bt, qty: bt.qty - used } : bt;
      })
    );
    setBills((list) => [bill, ...list]);
    setRxs((list) => list.map((r) => (r.id === rxId ? { ...r, status: short ? 'Partial' : 'Dispensed' } : r)));
    setDispensedToday((n) => n + 1);
    setDispenseTimes((t) => [...t, new Date()]);

    // Counted in units, so a partial reads as partial: 165 of 210, not "3 of 3 items".
    const given = Object.values(picks).flat().reduce((n, p) => n + p.qty, 0);
    const ordered = rx.lines.reduce((n, l) => n + l.qty, 0);
    const what = short ? `${given} of ${ordered} units` : `${rx.lines.length} items`;
    const to = rx.patient.nurse ? ` · issued to ${rx.patient.nurse.name}, ${rx.patient.ward}` : '';
    log(short ? 'Partial' : 'Dispensed', `${rx.id} · ${what} · ${bill.no}${to}`);
    return bill;
  }

  function hold(rxId: string, reason: string) {
    setRxs((list) => list.map((r) => (r.id === rxId ? { ...r, status: 'On hold', note: reason } : r)));
    log('Held', `${rxId} · ${reason}`);
    setActiveRx(null);
  }

  /** Takes every expired batch of a medicine out of use in one step (optionally at one location). */
  function removeExpired(productId: string, at?: Location) {
    const hit = batches.filter((x) => x.productId === productId && x.qty > 0 && !x.quarantined && band(x) === 'expired' && (!at || x.location === at));
    if (!hit.length) return { batches: 0, qty: 0 };
    const ids = new Set(hit.map((x) => x.id));
    setBatches((list) => list.map((x) => (ids.has(x.id) ? { ...x, quarantined: 'Expired' } : x)));
    for (const x of hit) log('Quarantined', `${productName(productById(productId))} · ${x.batchNo} · Expired`);
    return { batches: hit.length, qty: hit.reduce((n, x) => n + x.qty, 0), nos: hit.map((x) => x.batchNo) };
  }

  function quarantine(batchId: string, reason: string) {
    const bt = batches.find((x) => x.id === batchId)!;
    setBatches((list) => list.map((x) => (x.id === batchId ? { ...x, quarantined: reason } : x)));
    log('Quarantined', `${productName(productById(bt.productId))} · ${bt.batchNo} · ${reason}`);
  }

  // ---------------------------------------------------------------- address
  // Each screen has its own address. Changing screen adds a history entry, so
  // browser Back/Forward move between screens; a filter or selection within a
  // screen replaces the entry instead of piling up history.
  const route = { section, rx: activeRx, entering, filter: stockFilter, loc: stockLoc, cats: stockCats, makers: stockMakers, product: focusProduct, bill: focusBill };
  const hash = toHash(route);
  const lastPage = useRef(pageOf(route));
  const rxsRef = useRef(rxs);
  useLayoutEffect(() => {
    rxsRef.current = rxs;
  });

  useEffect(() => {
    // The address fully describes the screen, so everything here derives from it.
    const r = parseHash(hash);
    document.title = titleOf(r);
    if (window.location.hash === hash || (hash === '#/' && !window.location.hash)) return;
    const page = pageOf(r);
    // Keep the entry's state: backToStock reads its prev.
    if (page === lastPage.current) window.history.replaceState(window.history.state, '', hash);
    // Remember the page this one was opened from, so an in-page Back link can use real history.
    else window.history.pushState({ prev: lastPage.current }, '', hash);
    lastPage.current = page;
  }, [hash]);

  useEffect(() => {
    // The app restores scroll itself (the Stock list returns to the row that was opened); the
    // browser's own restoration would run after it and jump to a position saved too late.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const apply = () => {
      const r = parseHash(window.location.hash);
      const rx = r.rx ? rxsRef.current.find((x) => x.id === r.rx) : undefined;
      const open = rx && (rx.status === 'New' || rx.status === 'Reviewing' || rx.status === 'On hold');
      lastPage.current = pageOf({ ...r, rx: open ? r.rx : null });
      setSectionState(r.section);
      setActiveRx(open ? r.rx : null);
      setEntering(r.entering);
      setStockFilter(r.filter);
      setStockLoc(r.loc);
      setStockCats(r.cats);
      setStockMakers(r.makers);
      setFocusProduct(r.product);
      setFocusBill(r.bill);
      setFlash('');
      backing.current = false;
    };
    window.addEventListener('popstate', apply);
    return () => window.removeEventListener('popstate', apply);
  }, []);

  /** Everyone already on file, so a returning patient is found rather than registered twice. */
  const patients = [...new Map([...rxs.map((r) => r.patient), ...bills.map((b) => b.patient)].map((p) => [p.mrn, p])).values()];

  const pending = rxs.filter((r) => r.status === 'New' || r.status === 'Reviewing' || r.status === 'On hold');
  const stockOf = (productId: string) =>
    batches.filter((x) => x.productId === productId && !x.quarantined && band(x) !== 'expired').reduce((n, x) => n + x.qty, 0);

  return {
    section, go,
    activeRx, openRx, closeRx: () => setActiveRx(null),
    stockFilter, setStockFilter, stockLoc, setStockLoc, stockCats, setStockCats, stockMakers, setStockMakers,
    focusProduct, setFocusProduct, openProduct, openFromList, backToStock, stockReturn,
    batches, stockOf, quarantine, removeExpired,
    rxs, pending, dispense, hold,
    orderSeed, startOrder,
    bills, focusBill, setFocusBill, openBill,
    entering, startEntry, cancelEntry: () => setEntering(false), addRx, patients,
    flash, setFlash,
    audit,
    dispenseTimes,
    dispensedToday,
    tat, setTat,
    orders, placeOrder, placeMultiOrder, onOrder,
    makerIdOf, makerFor, setMaker,
    toast, closeToast: () => setToast(null),
    /** A pop-up message from any screen (e.g. the to-do list at the end of the day). */
    notify: (t: { tone: 'ok' | 'error'; title: string; text: string; note?: string }) => setToast({ id: 'n' + Date.now(), ...t }),
  };
}

export type Store = ReturnType<typeof usePharmacyStore>;
