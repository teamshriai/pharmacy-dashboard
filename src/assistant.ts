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
import { KNOWLEDGE, clinicalReview, pastHistory } from './clinical';
import { FORMULARY, NLEM_RULE, SCHEDULE_RULE } from './formulary';
import {
  CATEGORIES,
  DISPENSE_FROM,
  DISTRIBUTORS,
  STAFF,
  USER,
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

export type SourceKind = 'medicine' | 'batch' | 'prescription' | 'bills' | 'rule' | 'order' | 'alert' | 'staff' | 'category' | 'formulary' | 'stock';
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
  /** Questions to offer as chips (after a greeting, or when nothing was found). */
  suggest?: string[];
  /** The question as it was read, when spelling was corrected ("tottal" → "total"). */
  readAs?: string;
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
  make: 'maker', makes: 'maker', made: 'maker', maker: 'maker', makers: 'maker', manufacturer: 'maker', manufacturers: 'maker', manufactured: 'maker', company: 'maker',
  supplier: 'maker', suppliers: 'maker', distributor: 'maker', distributors: 'maker', wholesaler: 'maker', wholesalers: 'maker', delivers: 'maker', delivery: 'maker',
  tablet: 'tab', tablets: 'tab', tab: 'tab', tabs: 'tab', pills: 'tab',
  capsule: 'cap', capsules: 'cap', cap: 'cap', caps: 'cap',
  vial: 'vial', vials: 'vial', injection: 'vial', injections: 'vial',
  ampoule: 'amp', ampoules: 'amp', ampule: 'amp', ampules: 'amp', amp: 'amp', amps: 'amp',
  bottle: 'bottle', bottles: 'bottle', infusion: 'bottle', infusions: 'bottle',
  inhaler: 'inhaler', inhalers: 'inhaler', puffer: 'inhaler', puffers: 'inhaler',
  total: 'total', totals: 'total', overall: 'total', altogether: 'total', whole: 'total', sum: 'total', everything: 'total',
  brand: 'brand', brands: 'brand', branded: 'brand', trade: 'brand',
  dose: 'dose', doses: 'dose', dosage: 'dose', dosing: 'dose', maximum: 'dose', max: 'dose', overdose: 'dose', often: 'dose',
  formulary: 'formulary', nfi: 'formulary', monograph: 'formulary', counsel: 'formulary', counselling: 'formulary', counseling: 'formulary', storage: 'formulary',
  nlem: 'nlem', essential: 'nlem', dpco: 'nlem', nppa: 'nlem', ceiling: 'nlem', controlled: 'nlem',
  reddys: 'reddy',
  sugar: 'antidiabetic', steroids: 'steroid', steroid: 'steroid', safe: 'interaction', unsafe: 'interaction', contraindicated: 'interaction', contraindication: 'interaction', risk: 'interaction', risky: 'interaction', together: 'interaction',
  history: 'history', condition: 'history', conditions: 'history', past: 'history', revised: 'revise', revise: 'revise', revision: 'revise',
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
  rxs: Prescription[];
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
        (pt.allergies.length ? ` Allergies: ${pt.allergies.join(', ')}.` : '') +
        (() => {
          const hist = pastHistory(r, s).conditions;
          const open = clinicalReview(r, s).filter((f) => f.blocking);
          return (hist.length ? ` History: ${hist.map((h) => h.name).join(', ')}.` : '') +
            (open.length ? ` Clinical review: ${open.map((f) => `${productById(f.productId).generic}, ${f.rule.title.toLowerCase()}`).join('; ')}; the prescription does not mention it, so a revised prescription is needed before dispensing.` : '') +
            (r.revision ? ` Revised prescription recorded by ${r.revision.by}.` : '');
        })(),
      terms: [
        'pending', ...terms(`${pt.name} ${pt.mrn} ${pt.ipNo ?? ''} ${r.type}`),
        ...(pt.ward ? ['ward', ...terms(pt.ward)] : []), ...(pt.nurse ? ['nurse'] : []), ...(r.stat ? ['stat'] : []),
        ...(pt.allergies.length ? ['allergy'] : []),
        ...((pt.conditions ?? []).length ? ['history', ...(pt.conditions ?? []).map((c) => (c.code === 'diabetes' ? 'antidiabetic' : c.code))] : []),
        ...(clinicalReview(r, s).some((f) => f.blocking) ? ['interaction', 'revise'] : []),
      ],
      names: words(pt.name).filter((w) => w.length > 2 && w !== 'patient' && w !== 'emergency'),
    });
  }

  const paid = s.bills.filter((b) => b.status === 'Paid');
  const accounts = s.bills.filter((b) => b.status !== 'Paid');
  docs.push({
    kind: 'bills',
    ref: 'billing',
    label: `Today's bills (${s.bills.length})`,
    text:
      `Today: ${s.bills.length} bills. Paid at the billing counter ${inr(paid.reduce((n, b) => n + b.total, 0))}. ` +
      `Charged to hospital accounts ${inr(accounts.reduce((n, b) => n + b.total, 0))}` +
      (accounts.length ? ` (${accounts.map((b) => accountOf(b.patient)).join(', ')})` : '') +
      `. GST included ${inr(s.bills.reduce((n, b) => n + b.tax, 0))}.`,
    terms: ['paid', 'gst', 'account', 'total'],
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

  // The drug knowledge base behind the clinical review (sample).
  const CLS_WORDS: Record<string, string[]> = {
    steroid: ['steroid', 'prednisolone', 'dexamethasone', 'hydrocortisone'],
    biguanide: ['metformin'],
    insulin: ['insulin'],
    'antiplatelet-clopidogrel': ['clopidogrel'],
    'ppi-omeprazole': ['omeprazole'],
  };
  const COND_TERM: Record<string, string> = { diabetes: 'antidiabetic', hypertension: 'hypertension', ckd: 'ckd', asthma: 'asthma' };
  for (const k of KNOWLEDGE) {
    const drug = CLS_WORDS[k.cls] ?? [];
    const other = k.withCls ? CLS_WORDS[k.withCls] ?? [] : [];
    docs.push({
      kind: 'rule',
      ref: k.id,
      label: k.title,
      text: `${k.title}: ${k.why} ${k.level === 'revise' ? 'Needs a revised prescription before dispensing: ' : 'Review: '}${k.ask} (Sample drug knowledge base; check a current drug reference.)`,
      terms: ['interaction', 'revise', ...drug, ...other, ...(k.condition ? [COND_TERM[k.condition], 'history'] : [])],
      names: [...drug, ...other],
    });
  }

  // The formulary (sample, in the style of the National Formulary of India).
  const GENERIC_BRAND = new Set(['generic', 'hospital', 'supply', 'ampoules', 'human']);
  for (const m of FORMULARY) {
    const p = productById(m.productId);
    const brands = m.brands.filter((b) => b.company !== 'Various');
    docs.push({
      kind: 'formulary',
      ref: p.id,
      label: `${p.generic} · formulary`,
      text:
        `${productName(p)} ${p.form} (${m.klass}), Schedule ${m.schedule}${m.nlem ? ', NLEM 2022 essential medicine (price controlled)' : ''}. ` +
        `Adult dose: ${m.dose} ` +
        (brands.length ? `Brands in India: ${brands.map((b) => `${b.name} (${b.company})`).join(', ')}; dispensed by generic name. ` : '') +
        `Storage: ${m.storage} Tell the patient: ${m.counsel} (Sample formulary; verify against NFI 2021.)`,
      terms: ['formulary', 'dose', 'brand', ...(m.nlem ? ['nlem'] : []), ...(m.schedule === 'H1' ? ['h1'] : []), ...terms(`${p.generic} ${m.klass}`)],
      names: [...words(p.generic).filter((w) => w.length > 3), ...brands.flatMap((b) => words(b.name)).filter((w) => w.length > 3 && !GENERIC_BRAND.has(w))],
    });
  }
  const nlem = FORMULARY.filter((m) => m.nlem).map((m) => productById(m.productId).generic);
  docs.push({
    kind: 'rule',
    ref: 'nlem',
    label: 'NLEM and price control',
    text: `${NLEM_RULE} Here: ${nlem.join(', ')}.`,
    terms: ['nlem', 'formulary', 'gst'],
    names: [],
  });
  docs.push({
    kind: 'rule',
    ref: 'schedules',
    label: 'Schedules H and H1',
    text: `${SCHEDULE_RULE.H} ${SCHEDULE_RULE.H1}`,
    terms: ['h1', 'formulary'],
    names: [],
  });

  // Stock totals: by unit (tablets, vials …) and overall, usable stock in both locations.
  const UNIT_NAME: Record<string, string> = { tab: 'tablets', cap: 'capsules', vial: 'vials', amp: 'ampoules', bottle: 'bottles', inhaler: 'inhalers' };
  const units = [...new Set(PRODUCTS.map((p) => p.unit))];
  const totals = units.map((u) => {
    const meds = PRODUCTS.filter((p) => p.unit === u);
    return { u, meds, n: meds.reduce((n, p) => n + s.stockOf(p.id), 0) };
  });
  const fmt = (n: number) => n.toLocaleString('en-IN');
  for (const t of totals) {
    docs.push({
      kind: 'stock',
      ref: t.u,
      label: `All ${UNIT_NAME[t.u] ?? t.u}`,
      text: `${fmt(t.n)} ${UNIT_NAME[t.u] ?? t.u} in stock in total, across ${t.meds.length} medicine${t.meds.length === 1 ? '' : 's'}: ${t.meds.map((p) => `${productName(p)} ${fmt(s.stockOf(p.id))}`).join(', ')}. Usable stock in the pharmacy and the store; expired and removed stock is not counted.`,
      terms: ['total', 'stock', t.u],
      names: [],
    });
  }
  docs.push({
    kind: 'stock',
    ref: 'all',
    label: 'Stock in total',
    text: `In stock in total: ${totals.map((t) => `${fmt(t.n)} ${UNIT_NAME[t.u] ?? t.u}`).join(', ')}, across ${PRODUCTS.length} medicines. Usable stock in the pharmacy and the store; expired and removed stock is not counted.`,
    terms: ['total', 'stock'],
    names: [],
  });

  // Distributors (sample).
  for (const d of DISTRIBUTORS) {
    const meds = PRODUCTS.filter((p) => s.makerFor(p.id).supplier === d.name);
    docs.push({
      kind: 'rule',
      ref: `dist-${d.name}`,
      label: d.name,
      text: `${d.name}, ${d.city} (sample distributor): delivers ${d.delivery.toLowerCase()}; ${d.coldChain ? 'can deliver 2–8 °C stock' : 'no cold-chain delivery'}. Supplies ${meds.length ? meds.map((p) => p.generic).join(', ') : 'nothing at present'}.`,
      terms: ['maker', ...(d.coldChain ? ['cold'] : []), ...meds.flatMap((p) => terms(p.generic))],
      names: words(d.name).filter((w) => w.length >= 3 && !['pharma', 'distributors', 'wholesale', 'drug', 'house'].includes(w)),
    });
  }

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

const GREETING = new Set('hi hii hiii hai hello helo hello hey heya hiya namaste namaskar vanakkam good morning afternoon evening there ai shri sir madam'.split(' '));
const THANKS = new Set('thanks thank thanku thankyou thx ty tq you very much ok okay fine great nice'.split(' '));
const BYE = new Set('bye goodbye see later cya'.split(' '));
const START = ['What needs action?', 'Which medicines are low?', 'How many tablets in total?', 'Who is waiting?', 'Dose of metformin'];

/** Edit distance (insert, delete, change, swap neighbours), stopping early past `max`. */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Reads past typing slips: words run together ("tabletsare" → "tablets are")
 * and small misspellings ("tottal" → "total", "metfromin" → "metformin"),
 * matched against the words this console knows. Unknown words are kept.
 */
function correct(question: string, vocab: Set<string>) {
  const fix = (w: string): string => {
    if (vocab.has(w) || /\d/.test(w) || w.length < 4) return w;
    const near = (x: string, max: number) => {
      let best = '', bestD = max + 1;
      for (const v of vocab) {
        if (v.length < 3) continue;
        const dd = distance(x, v, max);
        if (dd < bestD) { best = v; bestD = dd; }
      }
      return { best, d: bestD };
    };
    // A one-letter slip first ("tottal" → "total").
    const one = near(w, 1);
    if (one.d <= 1) return one.best;
    // Then words run together: a known first part and a known rest ("tabletsare", "therein").
    for (let i = w.length - 2; i >= 2; i--) {
      const a = w.slice(0, i), b = w.slice(i);
      if (vocab.has(a) && vocab.has(b)) return `${a} ${b}`;
    }
    for (let i = w.length - 4; i >= 3; i--) {
      const a = w.slice(0, i), b = near(w.slice(i), 1);
      if (vocab.has(a) && b.d <= 1) return `${a} ${b.best}`;
    }
    // Then a bigger slip in a long word ("metfromin" → "metformin").
    if (w.length >= 8) {
      const two = near(w, 2);
      if (two.d <= 2) return two.best;
    }
    return w;
  };
  const out = words(question).map(fix).join(' ');
  return out;
}

export function ask(question: string, state: State): Answer {
  const plain = words(question).map((w) => w.replace(/(.)\1{2,}/g, '$1$1'));
  if (plain.length && plain.length <= 6) {
    if (plain.every((w) => GREETING.has(w) || THANKS.has(w) || BYE.has(w)) && plain.some((w) => GREETING.has(w) && !['good', 'there', 'ai', 'shri', 'sir', 'madam'].includes(w)))
      return { lines: [`Hello ${USER.name}! I answer from this console's records: stock, expiry, waiting and served patients, bills, orders, staff, doses and brands, and the pharmacy's rules.`, 'Try one of these:'], sources: [], found: true, suggest: START };
    if (plain.every((w) => THANKS.has(w)) && plain.some((w) => w.startsWith('thank') || ['thx', 'ty', 'tq'].includes(w)))
      return { lines: [`You're welcome, ${USER.name}.`], sources: [], found: true };
    if (plain.every((w) => BYE.has(w) || THANKS.has(w)) && plain.some((w) => BYE.has(w)))
      return { lines: [`Bye, ${USER.name}. The chat stays here when you need it.`], sources: [], found: true };
  }

  const docs = buildIndex(state);
  // Every word the console knows, for reading past typing slips.
  const vocab = new Set<string>([...STOP, ...Object.keys(SYNONYMS), ...docs.flatMap((d) => [...d.terms, ...d.names, ...words(d.label)])]);
  const fixed = correct(question, vocab);
  const readAs = fixed !== words(question).join(' ') ? fixed : undefined;
  const q = terms(fixed);
  // "how many" / "how much" are stop words, but they mean "a count": keep that.
  if (/\bhow (many|much)\b/.test(fixed)) q.push('__howmany');
  if (q.length === 0 || (q.length === 1 && q[0] === '__howmany')) {
    return { lines: ['Ask about stock, expiry, waiting or served patients, bills, orders, staff, doses and brands, or a pharmacy rule.'], sources: [], found: false, suggest: START };
  }
  const answer = answerFor(q, docs);
  return readAs ? { ...answer, readAs } : answer;
}

function answerFor(q: string[], docs: Doc[]): Answer {
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
  const namedFm = named.filter((d) => d.kind === 'formulary');
  const UNITS = ['tab', 'cap', 'vial', 'amp', 'bottle', 'inhaler'];
  const unitAsked = UNITS.filter((u) => has(u));
  const howMany = q.includes('__howmany');
  if (!named.length && !has('paid') && !has('gst') && (unitAsked.length ? has('total') || has('stock') || howMany : has('total')))
    picked = unitAsked.length ? docs.filter((d) => d.kind === 'stock' && unitAsked.includes(d.ref)) : docs.filter((d) => d.kind === 'stock' && d.ref === 'all');
  else if ((has('dose') || has('brand') || has('formulary') || has('nlem')) && namedFm.length) picked = namedFm.slice(0, 3);
  else if (has('nlem')) picked = docs.filter((d) => d.ref === 'nlem');
  else if ((has('formulary') || has('dose') || has('brand')) && !named.length) picked = docs.filter((d) => d.ref === 'schedules' || d.ref === 'nlem');
  else if (has('ordered')) picked = only('order');
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
      lines: ['I could not find that in this pharmacy’s records.', 'Try a medicine, patient or staff name, or words like stock, expiry, waiting, paid, ordered, needs action. For example:'],
      sources: [],
      found: false,
      suggest: START,
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
  'Is prednisolone safe for a diabetic?',
  'Dose of metformin',
  'What is Glycomet?',
  'Stock of ceftriaxone',
];
