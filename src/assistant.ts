/**
 * Pharmacy helper: retrieval over this pharmacy's own records.
 *
 * Each question is matched against an index built from live state (medicines,
 * expiring batches, waiting prescriptions, today's bills and the pharmacy's
 * rules). The answer is composed only from what was retrieved, and every record
 * used is returned as a source. There is no language model: nothing is
 * invented, and a question the records cannot answer is reported as such.
 * A model can later be placed behind a server to phrase answers from the same
 * retrieved records.
 */
import { detectAlerts } from './alerts';
import {
  CATEGORIES,
  DISPENSE_FROM,
  STAFF,
  hhmm,
  onShift,
  PRODUCTS,
  accountOf,
  band,
  daysLeft,
  inr,
  monYr,
  placeOf,
  productById,
  productName,
  type Batch,
  type AuditEvent,
  type Bill,
  type Order,
  type Manufacturer,
  type Prescription,
} from './data';

export type SourceKind = 'medicine' | 'batch' | 'prescription' | 'bills' | 'rule' | 'order' | 'alert' | 'staff' | 'category';
export interface Source {
  kind: SourceKind;
  /** Product id, prescription id or rule key: what a click opens. */
  ref: string;
  label: string;
}
export interface Answer {
  lines: string[];
  sources: Source[];
  found: boolean;
}

interface Doc extends Source {
  text: string;
  terms: string[];
  /** Words that name this record (a medicine or patient) for exact-match boosting. */
  names: string[];
  /** Days to expiry, for batches, so "what expires soon" lists soonest first. */
  days?: number;
}

const STOP = new Set(
  'the a an is are was of for to in on what which who whom how many much do does did we i me my our any there have has show tell about please can could you with and or by at it this that be give list all get need want now today us here'.split(' ')
);

/** Everyday words mapped onto the terms the records use. */
const SYNONYMS: Record<string, string> = {
  expire: 'expiry', expires: 'expiry', expiring: 'expiry', expired: 'expiry', expiry: 'expiry', date: 'expiry',
  stock: 'stock', stocks: 'stock', available: 'stock', left: 'stock', quantity: 'stock', qty: 'stock', units: 'stock',
  waiting: 'pending', queue: 'pending', pending: 'pending', prescriptions: 'pending', prescription: 'pending', rx: 'pending',
  collected: 'paid', collection: 'paid', revenue: 'paid', sales: 'paid', earned: 'paid', paid: 'paid', payment: 'paid', payments: 'paid', money: 'paid', bills: 'paid', bill: 'paid', billing: 'paid',
  nurse: 'nurse', ward: 'ward', bed: 'ward', where: 'ward', admitted: 'ward',
  fridge: 'cold', refrigerate: 'cold', refrigerated: 'cold', temperature: 'cold', cold: 'cold',
  h1: 'h1', register: 'h1', schedule: 'h1',
  fefo: 'fefo', batch: 'fefo', batches: 'fefo', pick: 'fefo',
  order: 'ordered', orders: 'ordered', ordered: 'ordered', request: 'ordered', requests: 'ordered', requested: 'ordered', procurement: 'ordered', purchase: 'ordered', po: 'ordered',
  attention: 'action', action: 'action', actions: 'action', alert: 'action', alerts: 'action', problems: 'action', problem: 'action', issues: 'action', urgent: 'action',
  staff: 'staff', shift: 'staff', duty: 'staff', pharmacist: 'staff', pharmacists: 'staff', employee: 'staff', employees: 'staff', team: 'staff',
  served: 'served', done: 'served', dispensed: 'served', completed: 'served', finished: 'served', patients: 'served',
  antibiotics: 'antibiotic', antidiabetics: 'antidiabetic', diabetes: 'antidiabetic', diabetic: 'antidiabetic', heart: 'cardiac', cardiac: 'cardiac', gastric: 'gastro', acidity: 'gastro', acid: 'gastro', pain: 'pain', fever: 'pain', painkiller: 'pain', painkillers: 'pain', category: 'category', categories: 'category', type: 'category', kind: 'category',
  quarantine: 'quarantine', quarantined: 'quarantine', remove: 'quarantine', removed: 'quarantine', damaged: 'quarantine', recall: 'quarantine', recalled: 'quarantine',
  partial: 'backorder', short: 'backorder', shortage: 'backorder', backorder: 'backorder', backordered: 'backorder',
  gst: 'gst', tax: 'gst', cgst: 'gst', sgst: 'gst', mrp: 'gst',
  low: 'low', reorder: 'low', running: 'low', finish: 'low',
  allergy: 'allergy', allergic: 'allergy', allergies: 'allergy',
  interaction: 'interaction', interactions: 'interaction',
  stat: 'stat', emergency: 'stat',
  make: 'maker', makes: 'maker', made: 'maker', maker: 'maker', makers: 'maker', manufacturer: 'maker', manufacturers: 'maker', manufactured: 'maker', company: 'maker', brand: 'maker',
  supplier: 'maker', suppliers: 'maker', distributor: 'maker',
  reddys: 'reddy',
};

/** Words that name a maker in a question: "Cipla", "Dr Reddy's", "Sun Pharma"; generic words are left out. */
const makerWords = (name: string) => words(name).filter((w) => w.length >= 3 && w !== 'laboratories' && w !== 'pharma');

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
const terms = (s: string) => words(s).filter((w) => !STOP.has(w)).map((w) => SYNONYMS[w] ?? w);

// --------------------------------------------------------------- the index

interface State {
  batches: Batch[];
  pending: Prescription[];
  bills: Bill[];
  stockOf: (productId: string) => number;
  makerFor: (productId: string) => Manufacturer;
  orders: Order[];
  audit: AuditEvent[];
}

function buildIndex(s: State): Doc[] {
  const docs: Doc[] = [];

  for (const p of PRODUCTS) {
    const live = s.batches.filter((b) => b.productId === p.id && b.qty > 0 && !b.quarantined && band(b) !== 'expired');
    const counter = live.filter((b) => b.location === DISPENSE_FROM).reduce((n, b) => n + b.qty, 0);
    const total = s.stockOf(p.id);
    const next = [...live].sort((a, z) => a.expiry.getTime() - z.expiry.getTime())[0];
    const low = total < p.reorder;
    const maker = s.makerFor(p.id);
    docs.push({
      kind: 'medicine',
      ref: p.id,
      label: `${productName(p)} ${p.form}`,
      text:
        `${productName(p)} ${p.form}: ${total} ${p.unit}s in stock (${counter} at the counter, ${total - counter} in the store), ` +
        `${live.length} batch${live.length === 1 ? '' : 'es'}${next ? `, next expiry ${monYr(next.expiry)}` : ''}. ` +
        `Reorder level ${p.reorder}${low ? ', so it is running low' : ''}. MRP ${inr(p.mrp)} per ${p.unit}, GST ${p.gst}%, Schedule ${p.schedule}. ` +
        `Maker (sample data): ${maker.name}, supplied through ${maker.supplier}.`,
      terms: [...terms(`${p.generic} ${p.strength} ${p.form} ${p.route}`), 'stock', 'maker', ...(low ? ['low'] : []), ...(p.cold ? ['cold'] : []), ...(p.schedule === 'H1' ? ['h1'] : [])],
      names: [...words(p.generic).filter((w) => w.length > 3), ...makerWords(maker.name)],
    });
  }

  for (const b of s.batches) {
    const bd = band(b);
    if (bd === 'ok' || b.qty === 0) continue;
    const p = productById(b.productId);
    const d = daysLeft(b.expiry);
    docs.push({
      kind: 'batch',
      ref: p.id,
      label: `${p.generic} · ${b.batchNo}`,
      text:
        `${productName(p)} batch ${b.batchNo} (${b.location}): ${b.qty} ${p.unit}s, ` +
        (d < 0 ? `expired ${-d} days ago` : `expires ${monYr(b.expiry)}, in ${d} days`) +
        (b.quarantined ? `; removed from use (${b.quarantined})` : d < 0 ? '; still in use, remove it' : '') + '.',
      terms: ['expiry', b.batchNo.toLowerCase(), ...terms(p.generic), ...(b.quarantined ? ['quarantine'] : [])],
      names: words(p.generic).filter((w) => w.length > 3),
      days: d,
    });
  }

  // STAT first, then oldest first: the same order as the queue.
  const waiting = [...s.pending].sort((a, z) => Number(z.stat) - Number(a.stat) || a.time.getTime() - z.time.getTime());
  for (const r of waiting) {
    const pt = r.patient;
    docs.push({
      kind: 'prescription',
      ref: r.id,
      label: `${pt.name} · ${r.id}`,
      text:
        `${pt.name} (${pt.mrn}) · ${pt.ward === pt.encounter ? placeOf(pt) : pt.encounter + (pt.ward ? ` · ${placeOf(pt)}` : '')}: ${r.id} from ${r.doctor}, ` +
        `${r.lines.length} medicine${r.lines.length === 1 ? '' : 's'} (${r.lines.map((l) => productById(l.productId).generic).join(', ')}), ` +
        `${r.status.toLowerCase()}${r.stat ? ', STAT' : ''}.` +
        (pt.nurse ? ` ${pt.encounter === 'Emergency' ? 'Emergency' : 'Ward'} nurse ${pt.nurse.name}, ext ${pt.nurse.ext}.` : '') +
        (pt.allergies.length ? ` Allergies: ${pt.allergies.join(', ')}.` : ''),
      terms: [
        'pending', ...terms(`${pt.name} ${pt.mrn} ${pt.ipNo ?? ''} ${r.type}`),
        ...(pt.ward ? ['ward', ...terms(pt.ward)] : []), ...(pt.nurse ? ['nurse'] : []), ...(r.stat ? ['stat'] : []),
        ...(pt.allergies.length ? ['allergy'] : []),
      ],
      names: words(pt.name).filter((w) => w.length > 2 && w !== 'patient' && w !== 'emergency'),
    });
  }

  const paid = s.bills.filter((b) => b.status === 'Paid');
  const by = (m: string) => paid.filter((b) => b.payment === m).reduce((n, b) => n + b.total, 0);
  const accounts = s.bills.filter((b) => b.status !== 'Paid');
  docs.push({
    kind: 'bills',
    ref: 'billing',
    label: `Today's bills (${s.bills.length})`,
    text:
      `Today: ${s.bills.length} bills. Paid at the counter ${inr(paid.reduce((n, b) => n + b.total, 0))}` +
      // Only the methods actually used.
      (() => {
        const parts = (['UPI', 'Card', 'Credit'] as const).filter((m) => by(m) > 0).map((m) => `${m} ${inr(by(m))}`);
        return parts.length ? ` (${parts.join(', ')}). ` : '. ';
      })() +
      `Charged to hospital accounts ${inr(accounts.reduce((n, b) => n + b.total, 0))}` +
      (accounts.length ? ` (${accounts.map((b) => accountOf(b.patient)).join(', ')})` : '') +
      `. GST included ${inr(s.bills.reduce((n, b) => n + b.tax, 0))}.`,
    terms: ['paid', 'gst', 'upi', 'card', 'credit', 'account', 'total'],
    names: [],
  });

  // Served today: one bill per dispensed prescription.
  docs.push({
    kind: 'bills',
    ref: 'billing',
    label: `Served today (${s.bills.length})`,
    text: s.bills.length
      ? `Served today: ${[...s.bills].sort((a, z) => z.at.getTime() - a.at.getTime()).map((b) => `${b.patient.name} (${hhmm(b.at)}, ${inr(b.total)})`).join(', ')}.`
      : 'Nobody has been served yet today.',
    terms: ['served', 'paid'],
    names: [],
  });

  // What has been requested from Procurement in this session.
  const reqs = [...new Set(s.orders.map((o) => o.no))];
  docs.push({
    kind: 'order',
    ref: 'order',
    label: reqs.length ? `Requests to Procurement (${reqs.length})` : 'Requests to Procurement',
    text: reqs.length
      ? `Sent to Procurement: ` +
        reqs.map((no) => `${no}: ${s.orders.filter((o) => o.no === no).map((o) => `${productById(o.productId).generic} ${o.qty} ${productById(o.productId).unit}`).join(', ')}`).join('; ') +
        '. They wait there for a vendor; record them in stock when they arrive.'
      : 'Nothing has been sent to Procurement yet. Use New order on the Dashboard, or Order more in Inventory.',
    terms: ['ordered', 'stock', ...s.orders.flatMap((o) => terms(productById(o.productId).generic))],
    names: [],
  });

  // Needs action: the same problems the Dashboard lists.
  const alerts = detectAlerts({ batches: s.batches, pending: s.pending });
  docs.push({
    kind: 'alert',
    ref: 'dashboard',
    label: `Needs action (${alerts.length})`,
    text: alerts.length ? `Needs action: ${alerts.map((a) => a.text + (a.action ? ` (${a.action.label})` : '')).join('; ')}.` : 'Nothing needs action right now.',
    terms: ['action', 'expiry', 'low'],
    names: [],
  });

  // Staff on shift and what each did today.
  for (const m of STAFF) {
    const did = s.audit.filter((a) => a.user === m.name);
    docs.push({
      kind: 'staff',
      ref: m.name,
      label: m.fullName,
      text:
        `${m.fullName} (${m.role}, ${m.id}, ext ${m.ext}): ${onShift(m) ? 'on shift' : 'off shift'}, ${String(m.shift[0]).padStart(2, '0')}:00–${String(m.shift[1]).padStart(2, '0')}:00. ` +
        (did.length ? `${did.length} action${did.length === 1 ? '' : 's'} today; latest: ${did[0].action} at ${hhmm(did[0].at)} (${did[0].detail}).` : 'No actions recorded today.'),
      terms: ['staff', ...terms(m.role)],
      names: words(m.fullName).filter((w) => w.length > 2),
    });
  }

  // Medicines by category.
  for (const c of CATEGORIES) {
    const meds = PRODUCTS.filter((p) => p.category === c.key);
    docs.push({
      kind: 'category',
      ref: c.key,
      label: c.label,
      text: `${c.label}: ${meds.map((p) => `${productName(p)} (${s.stockOf(p.id)} ${p.unit} in stock${s.stockOf(p.id) < p.reorder ? ', low' : ''})`).join(', ')}.`,
      terms: ['category', ...terms(c.label), c.key],
      names: [c.key],
    });
  }

  const h1 = PRODUCTS.filter((p) => p.schedule === 'H1').map((p) => p.generic).join(', ');
  const cold = PRODUCTS.filter((p) => p.cold).map((p) => p.generic).join(', ');
  const rules: [string, string, string, string[]][] = [
    ['fefo', 'Batch order (FEFO)', 'Batches are used First Expiry, First Out: the batch that expires soonest is picked first. Expired and quarantined batches are never picked.', ['fefo', 'expiry']],
    ['h1', 'Schedule H1 register', `Schedule H1 medicines${h1 ? ` (here: ${h1})` : ''} must be entered in the H1 register with patient, prescriber and quantity.`, ['h1']],
    ['cold', 'Cold chain', `Cold-chain medicines${cold ? ` (here: ${cold})` : ''} are kept at 2–8 °C and handed over without breaking the cold chain.`, ['cold']],
    ['quarantine', 'Remove from use', 'An expired, damaged or recalled batch is removed from use in Inventory. It stays on record but can never be dispensed.', ['quarantine', 'expiry']],
    ['backorder', 'Partial dispense', 'When stock is short, what is available is dispensed and the rest is backordered. The prescription is marked Partial.', ['backorder', 'stock']],
    ['allergy', 'Allergy conflicts', 'An allergy conflict stops that medicine. Hold the prescription and query the prescriber.', ['allergy']],
    ['interaction', 'Interactions', 'An interaction is a warning, not a stop. The pharmacist reviews it before ticking Verified.', ['interaction']],
    ['gst', 'MRP and GST', 'MRP already includes GST. The bill shows the tax split equally into CGST and SGST.', ['gst']],
    ['low', 'Low stock', 'Low stock means below the reorder level (7 days of sales). Order it with New order on the Dashboard, or Order more in Inventory.', ['low', 'stock']],
  ];
  for (const [ref, label, text, t] of rules) docs.push({ kind: 'rule', ref, label, text, terms: t, names: [] });

  return docs;
}

// --------------------------------------------------------------- retrieval

function rank(docs: Doc[], q: string[]) {
  const n = docs.length;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  return docs
    .map((d) => {
      let score = 0;
      for (const t of new Set(q)) {
        const tf = d.terms.filter((x) => x === t).length;
        if (tf) score += Math.log(1 + n / ((df.get(t) ?? 0) + 1)) * Math.min(tf, 2);
      }
      // Naming the medicine or patient outright is the strongest signal.
      if (d.names.some((w) => q.includes(w))) score += 4;
      return { d, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, z) => z.score - a.score);
}

const toSource = ({ kind, ref, label }: Doc): Source => ({ kind, ref, label });

export function ask(question: string, state: State): Answer {
  const q = terms(question);
  if (q.length === 0) {
    return { lines: ['Ask about stock, expiry, waiting or served patients, bills, orders, staff, or a pharmacy rule.'], sources: [], found: false };
  }
  const docs = buildIndex(state);
  const named = docs.filter((d) => d.names.some((w) => q.includes(w)));
  const has = (t: string) => q.includes(t);

  // List questions ("what expires", "who is waiting") want every matching
  // record of one kind, not just the best few.
  const list = (kind: SourceKind, filter: (d: Doc) => boolean, limit = 5) => {
    const pool = (named.length ? named : docs).filter((d) => d.kind === kind && filter(d));
    return pool.slice(0, limit);
  };

  let picked: Doc[] = [];
  const only = (kind: SourceKind) => docs.filter((d) => d.kind === kind);
  if (has('ordered')) picked = only('order');
  else if (has('action')) picked = only('alert');
  else if (has('staff') && !named.length) picked = only('staff');
  else if (has('served')) picked = docs.filter((d) => d.label.startsWith('Served today'));
  else if (has('category') && !named.length) picked = only('category');
  else if (has('expiry') && !has('fefo')) picked = list('batch', () => true, 99).sort((a, z) => (a.days ?? 0) - (z.days ?? 0)).slice(0, 5);
  else if (has('paid') || (has('gst') && !named.length)) picked = docs.filter((d) => d.kind === 'bills').concat(has('gst') ? docs.filter((d) => d.ref === 'gst') : []);
  else if (has('low') && !named.length) picked = docs.filter((d) => d.kind === 'medicine' && d.terms.includes('low'));
  else if ((has('pending') || has('stat')) && !named.length)
    picked = docs.filter((d) => d.kind === 'prescription' && (!has('stat') || d.terms.includes('stat'))).slice(0, 5);

  if (picked.length === 0) {
    const ranked = rank(docs, q);
    const top = ranked[0]?.score ?? 0;
    // Keep what scores close to the best match; drop weak, incidental hits.
    picked = ranked.filter((x) => x.score >= Math.max(1.2, top * 0.6)).slice(0, 3).map((x) => x.d);
  }

  // A question that names a rule's topic ("insulin fridge", "gst on metformin")
  // gets that rule too, alongside the records.
  const RULE_TOPICS = ['cold', 'h1', 'fefo', 'quarantine', 'backorder', 'allergy', 'interaction', 'gst'];
  for (const d of docs) {
    if (d.kind === 'rule' && RULE_TOPICS.includes(d.ref) && has(d.ref) && !picked.includes(d)) picked.push(d);
  }

  if (picked.length === 0) {
    return {
      lines: ['I could not find that in this pharmacy’s records.', 'Try a medicine, patient or staff name, or words like stock, expiry, waiting, paid, ordered, needs action.'],
      sources: [],
      found: false,
    };
  }
  return { lines: picked.map((d) => d.text), sources: picked.map(toSource), found: true };
}

export const SUGGESTIONS = [
  'What needs action?',
  'Which medicines are low?',
  'What expires soon?',
  'Who is waiting?',
  'How much was paid today?',
  'What did we order?',
  'Who is on shift?',
  'Stock of ceftriaxone',
];
