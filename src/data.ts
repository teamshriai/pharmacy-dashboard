/**
 * Hospital pharmacy sample data, modelled as Product → Batch → Location → Qty.
 *
 * A medicine exists once in the drug master; stock lives on its batches, each
 * with its own expiry, quantity and location. Nothing is fetched: this is
 * demonstration data, and dates are generated relative to today so expiry
 * alerts always have something to show.
 */

export type Location = 'Main Pharmacy' | 'Main Store';
export const LOCATIONS: Location[] = ['Main Pharmacy', 'Main Store'];
/** Dispensing only ever draws from the dispensing counter's own stock. */
export const DISPENSE_FROM: Location = 'Main Pharmacy';

export interface Product {
  id: string;
  generic: string;
  strength: string;
  form: 'Tablet' | 'Capsule' | 'Injection' | 'Infusion' | 'Vial' | 'Ampoule';
  route: 'Oral' | 'IV' | 'IV/IM' | 'SC';
  schedule: 'H' | 'H1';
  gst: 5 | 12;
  /** MRP per dispensing unit, GST inclusive. */
  mrp: number;
  unit: string;
  /** Units sold in the last 30 days (sample history). */
  sold30: number;
  /** Average units sold per day, from sold30. */
  perDay: number;
  /** Low-stock threshold: COVER_DAYS of average sales. */
  reorder: number;
  /** Drug class used by the allergy and interaction checks. */
  cls?: 'penicillin' | 'ppi-omeprazole' | 'antiplatelet-clopidogrel';
  cold?: boolean;
  /** Manufacturer id (see MANUFACTURERS). */
  mfr: string;
  /** Therapeutic category, for the Inventory filter. */
  category: Category;
}

/** Therapeutic categories, in the order the Inventory filter lists them. */
export const CATEGORIES = [
  { key: 'antibiotic', label: 'Antibiotic' },
  { key: 'antidiabetic', label: 'Antidiabetic' },
  { key: 'cardiac', label: 'Cardiac' },
  { key: 'gastro', label: 'Gastro (acid)' },
  { key: 'pain', label: 'Pain & fever' },
  { key: 'emergency', label: 'Emergency' },
] as const;
export type Category = (typeof CATEGORIES)[number]['key'];
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)!.label;

/**
 * Low stock follows sales: a medicine is low when what is left would last
 * less than the supplier's lead time plus a safety margin at its recent daily
 * sales. Fast sellers get a higher threshold than slow ones.
 */
export const LEAD_DAYS = 5;
export const SAFETY_DAYS = 2;
export const COVER_DAYS = LEAD_DAYS + SAFETY_DAYS;

const MASTER: Omit<Product, 'perDay' | 'reorder'>[] = [
  { id: 'met500', generic: 'Metformin', strength: '500 mg', form: 'Tablet', route: 'Oral', schedule: 'H', gst: 12, mrp: 1.6, unit: 'tab', sold30: 870, mfr: 'ipca', category: 'antidiabetic' },
  { id: 'atv20', generic: 'Atorvastatin', strength: '20 mg', form: 'Tablet', route: 'Oral', schedule: 'H', gst: 12, mrp: 6.5, unit: 'tab', sold30: 630, mfr: 'drl', category: 'cardiac' },
  { id: 'asp75', generic: 'Aspirin (gastro-resistant)', strength: '75 mg', form: 'Tablet', route: 'Oral', schedule: 'H', gst: 12, mrp: 0.6, unit: 'tab', sold30: 660, mfr: 'ipca', category: 'cardiac' },
  { id: 'clp75', generic: 'Clopidogrel', strength: '75 mg', form: 'Tablet', route: 'Oral', schedule: 'H', gst: 12, mrp: 4.2, unit: 'tab', sold30: 420, cls: 'antiplatelet-clopidogrel', mfr: 'drl', category: 'cardiac' },
  { id: 'ome20', generic: 'Omeprazole', strength: '20 mg', form: 'Capsule', route: 'Oral', schedule: 'H', gst: 12, mrp: 2.1, unit: 'cap', sold30: 420, cls: 'ppi-omeprazole', mfr: 'drl', category: 'gastro' },
  { id: 'amc625', generic: 'Amoxicillin + Clavulanate', strength: '625 mg', form: 'Tablet', route: 'Oral', schedule: 'H', gst: 12, mrp: 18, unit: 'tab', sold30: 270, cls: 'penicillin', mfr: 'cipla', category: 'antibiotic' },
  { id: 'cef1g', generic: 'Ceftriaxone', strength: '1 g', form: 'Injection', route: 'IV', schedule: 'H1', gst: 12, mrp: 62, unit: 'vial', sold30: 180, mfr: 'cipla', category: 'antibiotic' },
  { id: 'pan40iv', generic: 'Pantoprazole', strength: '40 mg', form: 'Injection', route: 'IV', schedule: 'H', gst: 12, mrp: 48, unit: 'vial', sold30: 120, mfr: 'sun', category: 'gastro' },
  { id: 'pcm1g', generic: 'Paracetamol', strength: '1 g/100 mL', form: 'Infusion', route: 'IV', schedule: 'H', gst: 12, mrp: 95, unit: 'bottle', sold30: 135, mfr: 'ipca', category: 'pain' },
  { id: 'ins40', generic: 'Insulin (regular)', strength: '40 IU/mL', form: 'Vial', route: 'SC', schedule: 'H', gst: 5, mrp: 145, unit: 'vial', sold30: 90, cold: true, mfr: 'biocon', category: 'antidiabetic' },
  { id: 'adr1', generic: 'Adrenaline', strength: '1 mg/mL', form: 'Ampoule', route: 'IV/IM', schedule: 'H', gst: 12, mrp: 18, unit: 'amp', sold30: 210, mfr: 'sun', category: 'emergency' },
  { id: 'atr06', generic: 'Atropine', strength: '0.6 mg/mL', form: 'Ampoule', route: 'IV/IM', schedule: 'H', gst: 12, mrp: 9, unit: 'amp', sold30: 225, mfr: 'sun', category: 'emergency' },
];

export const PRODUCTS: Product[] = MASTER.map((p) => {
  const perDay = p.sold30 / 30;
  return { ...p, perDay, reorder: Math.ceil(perDay * COVER_DAYS) };
});

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)!;
export const productName = (p: Product) => `${p.generic} ${p.strength}`;

// ---------- dates ---------------------------------------------------------

export const DAY = 86_400_000;
export function plusDays(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + n * DAY);
}
export const plusMonths = (n: number) => plusDays(Math.round(n * 30.4));
export const daysLeft = (d: Date) => Math.ceil((d.getTime() - plusDays(0).getTime()) / DAY);
export const monYr = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
export const hhmm = (d: Date) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
export const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- batches -------------------------------------------------------

export interface Batch {
  id: string;
  productId: string;
  batchNo: string;
  mfg: Date;
  expiry: Date;
  qty: number;
  location: Location;
  quarantined?: string;
}

let seq = 0;
const b = (productId: string, batchNo: string, mfgMonthsAgo: number, expiryMonths: number, qty: number, location: Location = 'Main Pharmacy'): Batch => ({
  id: 'b' + ++seq,
  productId,
  batchNo,
  mfg: plusMonths(-mfgMonthsAgo),
  expiry: plusMonths(expiryMonths),
  qty,
  location,
});

export const BATCHES: Batch[] = [
  b('met500', 'MFG198', 10, 14, 40),
  b('met500', 'MFG234', 5, 19, 120),
  b('met500', 'MFG311', 8, 28, 500, 'Main Store'),
  b('atv20', 'AT5521', 16, 8, 90),
  b('atv20', 'AT6010', 2, 22, 200, 'Main Store'),
  b('asp75', 'AS770', 22, 2, 60),
  b('asp75', 'AS882', 3, 26, 300),
  b('clp75', 'CL301', 7, 11, 45),
  b('ome20', 'OM118', 4, 20, 180),
  b('amc625', 'AC210', 5, 7, 80),
  { ...b('cef1g', 'CX441', 23, 0, 12), expiry: plusDays(25) },
  b('cef1g', 'CX502', 3, 13, 60),
  b('pan40iv', 'PZ09', 9, 9, 25),
  { ...b('pcm1g', 'PC77', 24, 0, 8), expiry: plusDays(-10) },
  b('pcm1g', 'PC91', 3, 15, 40),
  b('ins40', 'IN55', 6, 4, 14),
  b('adr1', 'ADR2026A', 4, 17, 60),
  { ...b('atr06', 'AT0931', 22, 0, 30), expiry: plusDays(45) },
];

export type ExpiryBand = 'expired' | 'lt30' | 'lt90' | 'ok';
export function band(b: Batch): ExpiryBand {
  const d = daysLeft(b.expiry);
  if (d < 0) return 'expired';
  if (d <= 30) return 'lt30';
  if (d <= 90) return 'lt90';
  return 'ok';
}

/** A batch can be picked if it is in date, not quarantined and at the counter. */
export const dispensable = (b: Batch) => !b.quarantined && daysLeft(b.expiry) >= 0 && b.location === DISPENSE_FROM && b.qty > 0;

/** First Expiry, First Out: split the quantity across in-date batches, soonest expiry first. */
export function fefo(batches: Batch[], productId: string, needed: number) {
  const picks: { batchId: string; qty: number }[] = [];
  let left = needed;
  for (const bt of batches
    .filter((x) => x.productId === productId && dispensable(x))
    .sort((a, z) => a.expiry.getTime() - z.expiry.getTime())) {
    if (left <= 0) break;
    const take = Math.min(bt.qty, left);
    picks.push({ batchId: bt.id, qty: take });
    left -= take;
  }
  return picks;
}

// ---------- patients & prescriptions --------------------------------------

export type RxType = 'OP' | 'IP' | 'Emergency' | 'Discharge';
export const RX_TYPES: RxType[] = ['OP', 'IP', 'Emergency', 'Discharge'];

export type Encounter = 'Outpatient' | 'Inpatient' | 'Emergency';

export interface Nurse {
  name: string;
  ext: string;
}

export interface Patient {
  mrn: string;
  name: string;
  mobile?: string;
  age?: number;
  sex?: 'M' | 'F';
  allergies: string[];
  encounter: Encounter;
  /** Admission number, inpatients only. */
  ipNo?: string;
  ward?: string;
  bed?: string;
  /** Nurse the medicines are issued to on the ward (or in the emergency bay). */
  nurse?: Nurse;
}

/** Inpatients and emergency patients are charged to their hospital account, not at the counter. */
export const onAccount = (p: Patient) => p.encounter !== 'Outpatient';

/** The account a bill is charged to: the admission number, or the emergency record. */
export const accountOf = (p: Patient) => p.ipNo ?? p.mrn;

/** "ICU · Bed 08" style location, for inpatients and emergency bays. */
export const placeOf = (p: Patient) => (p.ward ? `${p.ward}${p.bed ? ' · ' + p.bed : ''}` : 'OPD');

export interface RxLine {
  productId: string;
  dose: string;
  frequency: string;
  duration: string;
  qty: number;
}

export type RxStatus = 'New' | 'Reviewing' | 'On hold' | 'Dispensed' | 'Partial';

export interface Prescription {
  id: string;
  time: Date;
  type: RxType;
  stat: boolean;
  doctor: string;
  patient: Patient;
  lines: RxLine[];
  status: RxStatus;
  note?: string;
}

/** Arrival "minutes ago", so the sample queue looks right at any time of day. */
const ago = (min: number) => new Date(Date.now() - min * 60_000);

/**
 * Turnaround targets: how long an order may wait before it counts as late.
 * Common hospital defaults; adjust to the pharmacy's own policy.
 */
export const TAT_TARGET_MIN = { stat: 30, routine: 120 };

export function turnaround(r: { stat: boolean; time: Date }) {
  const waited = Math.max(0, Math.floor((Date.now() - r.time.getTime()) / 60_000));
  const target = r.stat ? TAT_TARGET_MIN.stat : TAT_TARGET_MIN.routine;
  const level: 'ok' | 'near' | 'over' = waited > target ? 'over' : waited >= target * 0.75 ? 'near' : 'ok';
  return { waited, target, level };
}

export const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} m` : `${min} m`);

const at = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const RAVI: Patient = { mrn: 'SH-102345', name: 'Ravi Kumar', age: 56, sex: 'M', allergies: ['Penicillin'], encounter: 'Outpatient' };
const MEENA: Patient = {
  mrn: 'SH-100871', name: 'Meena Devi', age: 64, sex: 'F', allergies: [], encounter: 'Inpatient',
  ipNo: 'IP-2026-00418', ward: 'ICU', bed: 'Bed 08', nurse: { name: 'Sr. Anitha R', ext: '2214' },
};
const ER: Patient = {
  mrn: 'ER-0931', name: 'Emergency patient (unidentified)', allergies: [], encounter: 'Emergency',
  ward: 'Emergency', bed: 'Bay 3', nurse: { name: 'Br. Joseph K', ext: '2100' },
};
const ARUN: Patient = {
  mrn: 'SH-099812', name: 'Arun Kumar', age: 61, sex: 'M', allergies: ['Penicillin'], encounter: 'Inpatient',
  ipNo: 'IP-2026-00391', ward: 'Ward 2', bed: 'Bed 14', nurse: { name: 'Sr. Priya M', ext: '2231' },
};
const LAKSHMI: Patient = { mrn: 'SH-103377', name: 'Lakshmi R', age: 58, sex: 'F', allergies: ['Sulfonamides'], encounter: 'Outpatient' };
const SURESH: Patient = { mrn: 'SH-101190', name: 'Suresh Babu', age: 47, sex: 'M', allergies: [], encounter: 'Outpatient' };
const KAVYA: Patient = {
  mrn: 'SH-100455', name: 'Kavya N', age: 33, sex: 'F', allergies: [], encounter: 'Inpatient',
  ipNo: 'IP-2026-00402', ward: 'Ward 4', bed: 'Bed 03', nurse: { name: 'Sr. Deepa S', ext: '2245' },
};

export const PRESCRIPTIONS: Prescription[] = [
  {
    id: 'RX-2026-00452', time: ago(48), type: 'OP', stat: false, doctor: 'Dr Rao', patient: RAVI, status: 'New',
    lines: [
      { productId: 'met500', dose: '500 mg', frequency: 'BID', duration: '30 days', qty: 60 },
      { productId: 'atv20', dose: '20 mg', frequency: 'OD', duration: '30 days', qty: 30 },
      { productId: 'asp75', dose: '75 mg', frequency: 'OD', duration: '30 days', qty: 30 },
    ],
  },
  {
    id: 'RX-2026-00455', time: ago(34), type: 'IP', stat: true, doctor: 'Dr Kumar', patient: MEENA, status: 'New',
    lines: [
      { productId: 'cef1g', dose: '1 g IV', frequency: 'BD', duration: '3 days', qty: 6 },
      { productId: 'pan40iv', dose: '40 mg IV', frequency: 'OD', duration: '3 days', qty: 3 },
      { productId: 'pcm1g', dose: '1 g IV', frequency: 'PRN', duration: 'Up to 4 doses', qty: 4 },
    ],
  },
  {
    id: 'RX-2026-00458', time: ago(12), type: 'Emergency', stat: true, doctor: 'Dr Shah', patient: ER, status: 'New',
    lines: [
      { productId: 'adr1', dose: '1 mg', frequency: 'STAT', duration: '—', qty: 5 },
      { productId: 'atr06', dose: '0.6 mg', frequency: 'STAT', duration: '—', qty: 3 },
    ],
  },
  {
    id: 'RX-2026-00461', time: ago(95), type: 'Discharge', stat: false, doctor: 'Dr Shah', patient: ARUN, status: 'New',
    lines: [
      { productId: 'met500', dose: '500 mg', frequency: 'BID', duration: '30 days', qty: 60 },
      { productId: 'atv20', dose: '20 mg', frequency: 'OD', duration: '30 days', qty: 30 },
      { productId: 'amc625', dose: '625 mg', frequency: 'BID', duration: '5 days', qty: 10 },
    ],
  },
  {
    id: 'RX-2026-00463', time: ago(9), type: 'OP', stat: false, doctor: 'Dr Iyer', patient: LAKSHMI, status: 'New',
    lines: [
      { productId: 'clp75', dose: '75 mg', frequency: 'OD', duration: '90 days', qty: 90 },
      { productId: 'ome20', dose: '20 mg', frequency: 'OD', duration: '30 days', qty: 30 },
      { productId: 'asp75', dose: '75 mg', frequency: 'OD', duration: '90 days', qty: 90 },
    ],
  },
];

/**
 * Dispensed earlier today, before this session (sample): spread over the six
 * hours before now, so the hourly chart looks right at any time of day.
 */
const EARLIER_WEIGHTS = [4, 7, 9, 8, 6, 8];
export const DISPENSED_EARLIER = EARLIER_WEIGHTS.reduce((n, w) => n + w, 0);
/** Patients served on each of the previous 29 days, oldest first (sample). */
export const PAST_DAYS_SERVED = [
  52, 61, 57, 48, 66, 70, 59, 55, 63, 68, 50, 47, 62, 65, 58, 54, 60, 69, 72, 51, 49, 64, 67,
  58, 64, 49, 71, 66, 53,
];

/** The last `n` days ending today; today's count is live. */
export function lastDays(n: number, today: number, now = new Date()) {
  const past = PAST_DAYS_SERVED.slice(-(n - 1));
  return [...past, today].map((count, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (past.length - i));
    return { date: d, count, today: i === past.length };
  });
}

/** Billed by this time yesterday, for today's comparison (sample). */
export const YESTERDAY_BILLED_SO_FAR = 312.4;

export function earlierByHour(now = new Date()) {
  const h = now.getHours();
  return EARLIER_WEIGHTS.map((count, i) => ({ hour: (h - EARLIER_WEIGHTS.length + i + 24) % 24, count }));
}

// ---------- clinical rules (sample) ---------------------------------------

/** Allergy → drug class it rules out. */
const ALLERGY_CLASS: Record<string, Product['cls']> = { Penicillin: 'penicillin' };

export function allergyConflict(patient: Patient, p: Product) {
  return patient.allergies.find((a) => ALLERGY_CLASS[a] && ALLERGY_CLASS[a] === p.cls);
}

/** Pairs of drug classes with a documented interaction. */
const INTERACTIONS: { a: Product['cls']; b: Product['cls']; note: string }[] = [
  {
    a: 'antiplatelet-clopidogrel',
    b: 'ppi-omeprazole',
    note: 'Omeprazole can reduce the antiplatelet effect of clopidogrel. Consider pantoprazole.',
  },
];

export function interactions(lines: RxLine[]) {
  const classes = lines.map((l) => productById(l.productId).cls);
  return INTERACTIONS.filter((i) => classes.includes(i.a) && classes.includes(i.b));
}

// ---------- entry reference data ------------------------------------------

export const DOCTORS = ['Dr Rao', 'Dr Kumar', 'Dr Shah', 'Dr Iyer'];

/** Wards and the nurse on duty, who receives medicines issued to that ward. */
export const WARDS: { ward: string; nurses: Nurse[] }[] = [
  { ward: 'ICU', nurses: [{ name: 'Sr. Anitha R', ext: '2214' }, { name: 'Br. Vinod T', ext: '2215' }] },
  { ward: 'Ward 2', nurses: [{ name: 'Sr. Priya M', ext: '2231' }] },
  { ward: 'Ward 4', nurses: [{ name: 'Sr. Deepa S', ext: '2245' }] },
  { ward: 'Emergency', nurses: [{ name: 'Br. Joseph K', ext: '2100' }, { name: 'Sr. Lata V', ext: '2101' }] },
];

/** Doses per day for each frequency; SOS has no fixed count, so its quantity is entered. */
export const FREQUENCIES: { code: string; label: string; perDay: number }[] = [
  { code: 'OD', label: 'Once daily', perDay: 1 },
  { code: 'BD', label: 'Twice daily', perDay: 2 },
  { code: 'TDS', label: 'Three times daily', perDay: 3 },
  { code: 'QID', label: 'Four times daily', perDay: 4 },
  { code: 'HS', label: 'At bedtime', perDay: 1 },
  { code: 'SOS', label: 'As needed', perDay: 0 },
  { code: 'STAT', label: 'Immediately, once', perDay: 0 },
];

// ---------- billing -------------------------------------------------------

/** Digital only: the counter takes no cash. */
export type Payment = 'UPI' | 'Card' | 'Credit' | 'Account';
export const COUNTER_PAYMENTS: Exclude<Payment, 'Account'>[] = ['UPI', 'Card', 'Credit'];

export interface BillLine {
  productId: string;
  batchNo: string;
  expiry: Date;
  qty: number;
  mrp: number;
  gst: number;
  /** MRP is GST inclusive: amount = taxable + tax. */
  amount: number;
  taxable: number;
  tax: number;
}

export interface Bill {
  no: string;
  /** Payment reference, shown on the transaction receipt and the downloaded bill. */
  txnId: string;
  at: Date;
  rxId: string;
  doctor: string;
  patient: Patient;
  lines: BillLine[];
  total: number;
  tax: number;
  payment: Payment;
  /** Paid at the counter, or added to the hospital account and settled on the final bill. */
  status: 'Paid' | 'On account';
  /** Nurse who received the medicines on the ward, when issued to a ward. */
  issuedTo?: Nurse;
  by: string;
}

/** One bill line from a quantity picked off a batch. */
export function billLine(productId: string, batchNo: string, expiry: Date, qty: number): BillLine {
  const p = productById(productId);
  const amount = Math.round(qty * p.mrp * 100) / 100;
  const taxable = Math.round((amount / (1 + p.gst / 100)) * 100) / 100;
  return { productId, batchNo, expiry, qty, mrp: p.mrp, gst: p.gst, amount, taxable, tax: Math.round((amount - taxable) * 100) / 100 };
}

const sumBill = (lines: BillLine[]) => ({
  total: Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100,
  tax: Math.round(lines.reduce((n, l) => n + l.tax, 0) * 100) / 100,
});

/** TXN + date + six digits, e.g. TXN20260928-481203. */
export const txnId = (d = new Date()) =>
  `TXN${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(100000 + Math.random() * 900000)}`;

const earlier = (h: number, m: number, lines: BillLine[], rest: Omit<Bill, 'at' | 'lines' | 'total' | 'tax' | 'txnId'>): Bill => ({
  ...rest,
  at: at(h, m),
  txnId: txnId(at(h, m)),
  lines,
  ...sumBill(lines),
});

export const BILLS: Bill[] = [
  earlier(9, 31, [billLine('ome20', 'OM118', plusMonths(20), 30), billLine('pcm1g', 'PC91', plusMonths(15), 2)], {
    no: 'PB-00447-212', rxId: 'RX-2026-00447', doctor: 'Dr Iyer', patient: KAVYA, payment: 'Account', status: 'On account',
    issuedTo: KAVYA.nurse, by: 'Priya',
  }),
  earlier(9, 12, [billLine('met500', 'MFG198', plusMonths(14), 30), billLine('atv20', 'AT5521', plusMonths(8), 15)], {
    no: 'PB-00444-587', rxId: 'RX-2026-00444', doctor: 'Dr Rao', patient: SURESH, payment: 'UPI', status: 'Paid', by: 'Priya',
  }),
];

export { sumBill };

// ---------- suppliers -----------------------------------------------------

export const SUPPLIERS = ['ABC Pharma Distributors', 'Metro Pharma Wholesale', 'Southern Drug House'];

// ---------- purchase orders ----------------------------------------------

export interface Order {
  no: string;
  productId: string;
  qty: number;
  supplier: string;
  at: Date;
  by: string;
}

/** Enough to cover 30 days of sales on top of what is in stock, in round tens. */
export const suggestedOrder = (p: Product, inStock: number) =>
  Math.max(10, Math.ceil((p.perDay * 30 - inStock) / 10) * 10);

export const makerOf = (p: Product) => MANUFACTURERS.find((m) => m.id === p.mfr)!;

// ---------- manufacturers ------------------------------------------------
// Real Indian manufacturers, for a recognisable demo. Which maker a medicine
// is shown against, and the distributor it comes through, is sample data, not
// a supply record; no contact details are given for them.

export interface Manufacturer {
  id: string;
  name: string;
  /** Head office city. */
  city: string;
  /** Distributor the pharmacy buys this maker's medicines through (sample). */
  supplier: string;
}

export const MANUFACTURERS: Manufacturer[] = [
  { id: 'drl', name: "Dr. Reddy's Laboratories", city: 'Hyderabad', supplier: 'ABC Pharma Distributors' },
  { id: 'cipla', name: 'Cipla', city: 'Mumbai', supplier: 'Metro Pharma Wholesale' },
  { id: 'ipca', name: 'Ipca Laboratories', city: 'Mumbai', supplier: 'Southern Drug House' },
  { id: 'sun', name: 'Sun Pharma', city: 'Mumbai', supplier: 'Metro Pharma Wholesale' },
  { id: 'biocon', name: 'Biocon', city: 'Bengaluru', supplier: 'Southern Drug House' },
];

// ---------- staff (sample) -------------------------------------------------

export interface StaffMember {
  /** Short name, as it appears on bills and in the activity log. */
  name: string;
  fullName: string;
  id: string;
  role: 'Pharmacist' | 'Pharmacy assistant' | 'Store keeper';
  /** Shift hours, 24 h clock. */
  shift: [number, number];
  ext: string;
}

export const STAFF: StaffMember[] = [
  { name: 'Kumar', fullName: 'Kumar S', id: 'PH-023', role: 'Pharmacist', shift: [8, 16], ext: '2301' },
  { name: 'Priya', fullName: 'Priya Menon', id: 'PH-017', role: 'Pharmacist', shift: [7, 15], ext: '2302' },
  { name: 'Ramesh', fullName: 'Ramesh K', id: 'PH-031', role: 'Pharmacy assistant', shift: [8, 16], ext: '2305' },
  { name: 'Farah', fullName: 'Farah Ali', id: 'PH-040', role: 'Store keeper', shift: [14, 22], ext: '2310' },
];

export const onShift = (s: StaffMember, now = new Date()) => now.getHours() >= s.shift[0] && now.getHours() < s.shift[1];

// ---------- audit ---------------------------------------------------------

export interface AuditEvent {
  id: string;
  at: Date;
  user: string;
  action: 'Rx entered' | 'Dispensed' | 'Partial' | 'Held' | 'Quarantined' | 'GRN posted' | 'Order placed' | 'Maker set';
  detail: string;
}

export const USER = { name: 'Kumar', role: 'Pharmacist', id: 'PH-023' };
