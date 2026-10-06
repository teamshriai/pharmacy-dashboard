/**
 * Pharmacy formulary: this pharmacy's medicines described the way the Indian
 * formulary does, and the rules the console applies from it.
 *
 * Per medicine: therapeutic class, Schedule under the Drugs and Cosmetics Rules
 * (what it requires), NLEM 2022 listing (price control under DPCO 2013), the
 * usual adult dose and the maximum, common Indian brands, storage and what to
 * tell the patient.
 *
 * Applied in the console:
 *   - dose check: a prescribed single or daily dose above the maximum is flagged;
 *   - Schedule H1: dispensing adds an entry to the H1 register (Reports);
 *   - the Formulary page and the SHRI AI chat answer from it.
 *
 * SAMPLE, written for this demonstration in the style of the National Formulary
 * of India. Verify every entry against NFI 2021, NLEM 2022 and the current
 * schedules before live use; doses are for adults and do not replace the
 * prescriber's or pharmacist's judgement.
 */
import type { RxLine } from './data';

export type Schedule = 'H' | 'H1' | 'OTC';

export interface Monograph {
  productId: string;
  /** Therapeutic class, as the formulary groups it. */
  klass: string;
  schedule: Schedule;
  /** NLEM 2022: listed (true), not listed (false), or not confirmed (null). */
  nlem: boolean | null;
  /** Usual adult dose, in words. */
  dose: string;
  /** Largest single dose and daily dose for an adult, in mg (absent where the dose is individual, e.g. insulin). */
  maxSingleMg?: number;
  maxDailyMg?: number;
  /** Common brands in India, for reference (the generic name is what is dispensed). */
  brands: { name: string; company: string }[];
  storage: string;
  /** What to tell the patient. */
  counsel: string;
}

export const SCHEDULE_RULE: Record<Schedule, string> = {
  H: 'Schedule H: prescription only. Sell only against a prescription from a registered medical practitioner.',
  H1: 'Schedule H1: prescription only, and record in the H1 register (patient, prescriber, medicine, quantity, date). Keep the register for 3 years.',
  OTC: 'Over the counter: no prescription needed.',
};

export const NLEM_RULE = 'NLEM 2022: an essential medicine. Its price is controlled under DPCO 2013, so the MRP must not exceed the NPPA ceiling price.';

export const FORMULARY: Monograph[] = [
  {
    productId: 'met500', klass: 'Antidiabetic · biguanide', schedule: 'H', nlem: true,
    dose: '500 mg once or twice daily with meals; increase slowly as needed. Usual maximum 2 g a day in divided doses.',
    maxSingleMg: 1000, maxDailyMg: 2000,
    brands: [{ name: 'Glycomet', company: 'USV' }, { name: 'Glyciphage', company: 'Franco-Indian' }, { name: 'Obimet', company: 'Abbott' }],
    storage: 'Below 30 °C, dry.', counsel: 'Take with or after food. Report severe stomach upset. Tell the doctor before any scan with contrast dye.',
  },
  {
    productId: 'atv20', klass: 'Lipid-lowering · statin', schedule: 'H', nlem: true,
    dose: '10–20 mg once daily, usually at night; up to 80 mg once daily.',
    maxSingleMg: 80, maxDailyMg: 80,
    brands: [{ name: 'Atorva', company: 'Zydus' }, { name: 'Storvas', company: 'Sun Pharma' }, { name: 'Lipitor', company: 'Pfizer' }],
    storage: 'Below 30 °C.', counsel: 'Report unexplained muscle pain or weakness.',
  },
  {
    productId: 'asp75', klass: 'Antiplatelet', schedule: 'H', nlem: true,
    dose: '75–150 mg once daily (antiplatelet use).',
    maxSingleMg: 325, maxDailyMg: 325,
    brands: [{ name: 'Ecosprin', company: 'USV' }],
    storage: 'Below 30 °C, dry.', counsel: 'Take after food; swallow whole. Report black stools or unusual bleeding.',
  },
  {
    productId: 'clp75', klass: 'Antiplatelet', schedule: 'H', nlem: true,
    dose: '75 mg once daily (a single loading dose of 300–600 mg may be prescribed).',
    maxSingleMg: 600, maxDailyMg: 600,
    brands: [{ name: 'Clopilet', company: 'Sun Pharma' }, { name: 'Deplatt', company: 'Torrent' }, { name: 'Plavix', company: 'Sanofi' }],
    storage: 'Below 30 °C.', counsel: 'Do not stop without the doctor. Report unusual bleeding or bruising.',
  },
  {
    productId: 'ome20', klass: 'Acid suppression · proton pump inhibitor', schedule: 'H', nlem: true,
    dose: '20 mg once daily before breakfast; 40 mg once daily in severe cases.',
    maxSingleMg: 40, maxDailyMg: 40,
    brands: [{ name: 'Omez', company: "Dr. Reddy's" }, { name: 'Ocid', company: 'Zydus' }],
    storage: 'Below 25 °C, dry.', counsel: 'Take 30 minutes before food; swallow the capsule whole.',
  },
  {
    productId: 'amc625', klass: 'Antibacterial · penicillin with beta-lactamase inhibitor', schedule: 'H', nlem: true,
    dose: '625 mg every 8 hours (three times daily) for 5–7 days.',
    maxSingleMg: 625, maxDailyMg: 1875,
    brands: [{ name: 'Augmentin', company: 'GSK' }, { name: 'Clavam', company: 'Alkem' }, { name: 'Moxikind-CV', company: 'Mankind' }],
    storage: 'Below 25 °C, dry; keep in the strip.', counsel: 'Take at the start of a meal. Finish the course. Not for penicillin-allergic patients.',
  },
  {
    productId: 'cef1g', klass: 'Antibacterial · third-generation cephalosporin', schedule: 'H1', nlem: true,
    dose: '1–2 g once daily by IV or IM injection; up to 4 g a day in severe infection.',
    maxSingleMg: 2000, maxDailyMg: 4000,
    brands: [{ name: 'Monocef', company: 'Aristo' }, { name: 'Oframax', company: 'Sun Pharma' }],
    storage: 'Below 25 °C, protect from light; use the solution soon after mixing.', counsel: 'Given by the nurse; report rash or breathing difficulty at once.',
  },
  {
    productId: 'pan40iv', klass: 'Acid suppression · proton pump inhibitor (injection)', schedule: 'H', nlem: null,
    dose: '40 mg IV once daily; switch to tablets when the patient can take them.',
    maxSingleMg: 80, maxDailyMg: 80,
    brands: [{ name: 'Pantocid IV', company: 'Sun Pharma' }, { name: 'Pan IV', company: 'Alkem' }],
    storage: 'Below 25 °C; use within 12 hours of mixing.', counsel: 'Given by the nurse.',
  },
  {
    productId: 'pcm1g', klass: 'Analgesic and antipyretic', schedule: 'H', nlem: true,
    dose: '1 g IV infusion over 15 minutes every 4–6 hours (adults over 50 kg); at least 4 hours between doses.',
    maxSingleMg: 1000, maxDailyMg: 4000,
    brands: [{ name: 'Generic (hospital supply)', company: 'Various' }],
    storage: 'Below 25 °C; do not refrigerate.', counsel: 'No other paracetamol at the same time (check tablets and syrups).',
  },
  {
    productId: 'ins40', klass: 'Antidiabetic · insulin (short-acting)', schedule: 'H', nlem: true,
    dose: 'Individual dose by subcutaneous injection, 15–30 minutes before meals, as the doctor sets it.',
    brands: [{ name: 'Human Actrapid', company: 'Novo Nordisk' }, { name: 'Huminsulin R', company: 'Lilly' }, { name: 'Insugen-R', company: 'Biocon' }],
    storage: '2–8 °C, do not freeze; the vial in use can stay below 25 °C for 4 weeks.', counsel: 'Eat after the injection. Know the signs of low sugar; carry glucose.',
  },
  {
    productId: 'adr1', klass: 'Emergency · sympathomimetic', schedule: 'H', nlem: true,
    dose: 'Anaphylaxis: 0.5 mg IM (0.5 mL of 1 mg/mL), repeat after 5 minutes if needed. Cardiac arrest: 1 mg IV every 3–5 minutes.',
    maxSingleMg: 1,
    brands: [{ name: 'Generic ampoules', company: 'Various' }],
    storage: 'Below 25 °C, protect from light; discard if pink or brown.', counsel: 'Hospital use.',
  },
  {
    productId: 'atr06', klass: 'Emergency · anticholinergic', schedule: 'H', nlem: true,
    dose: 'Bradycardia: 0.5–1 mg IV, repeated every 3–5 minutes to a total of 3 mg.',
    maxSingleMg: 1, maxDailyMg: 3,
    brands: [{ name: 'Generic ampoules', company: 'Various' }],
    storage: 'Below 25 °C.', counsel: 'Hospital use.',
  },
  {
    productId: 'pred10', klass: 'Corticosteroid', schedule: 'H', nlem: true,
    dose: '5–60 mg once daily in the morning, as the condition needs; long courses are tapered, not stopped suddenly.',
    maxSingleMg: 60, maxDailyMg: 60,
    brands: [{ name: 'Wysolone', company: 'Pfizer' }, { name: 'Omnacortil', company: 'Macleods' }],
    storage: 'Below 30 °C.', counsel: 'Take with breakfast. In diabetes, check sugar more often. Do not stop a long course suddenly.',
  },
  {
    productId: 'amd5', klass: 'Antihypertensive · calcium channel blocker', schedule: 'H', nlem: true,
    dose: '5 mg once daily; up to 10 mg once daily.',
    maxSingleMg: 10, maxDailyMg: 10,
    brands: [{ name: 'Amlong', company: 'Micro Labs' }, { name: 'Amlopres', company: 'Cipla' }, { name: 'Stamlo', company: "Dr. Reddy's" }],
    storage: 'Below 30 °C.', counsel: 'Take at the same time each day. Ankle swelling can happen; tell the doctor if it is troublesome.',
  },
  {
    productId: 'tel40', klass: 'Antihypertensive · angiotensin receptor blocker', schedule: 'H', nlem: true,
    dose: '20–40 mg once daily; up to 80 mg once daily.',
    maxSingleMg: 80, maxDailyMg: 80,
    brands: [{ name: 'Telma', company: 'Glenmark' }, { name: 'Telsartan', company: "Dr. Reddy's" }, { name: 'Telvas', company: 'Aristo' }],
    storage: 'Below 30 °C, in the strip.', counsel: 'Rise slowly if dizzy. Not in pregnancy: tell the doctor if pregnant or planning.',
  },
  {
    productId: 'glm1', klass: 'Antidiabetic · sulfonylurea', schedule: 'H', nlem: true,
    dose: '1 mg once daily with breakfast; increase slowly, usually up to 4 mg. Maximum 8 mg a day.',
    maxSingleMg: 8, maxDailyMg: 8,
    brands: [{ name: 'Amaryl', company: 'Sanofi' }, { name: 'Glimestar', company: 'Mankind' }, { name: 'Glimisave', company: 'Eris' }],
    storage: 'Below 30 °C.', counsel: 'Take with breakfast; do not skip meals. Know the signs of low sugar and carry glucose.',
  },
  {
    productId: 'ond4', klass: 'Antiemetic · 5-HT3 antagonist', schedule: 'H', nlem: true,
    dose: '4–8 mg every 8–12 hours for nausea and vomiting. Maximum 24 mg a day by mouth.',
    maxSingleMg: 8, maxDailyMg: 24,
    brands: [{ name: 'Emeset', company: 'Cipla' }, { name: 'Ondem', company: 'Alkem' }, { name: 'Vomikind', company: 'Mankind' }],
    storage: 'Below 30 °C.', counsel: 'May cause headache or constipation. Report a fast or irregular heartbeat.',
  },
  {
    productId: 'azi500', klass: 'Antibacterial · macrolide', schedule: 'H', nlem: true,
    dose: '500 mg once daily for 3 days (as prescribed).',
    maxSingleMg: 500, maxDailyMg: 500,
    brands: [{ name: 'Azithral', company: 'Alembic' }, { name: 'Azee', company: 'Cipla' }, { name: 'Zathrin', company: 'FDC' }],
    storage: 'Below 30 °C.', counsel: 'Once a day at the same time. Finish the course. Keep 2 hours apart from antacids.',
  },
  {
    productId: 'lev500', klass: 'Antibacterial · fluoroquinolone', schedule: 'H1', nlem: null,
    dose: '500 mg once daily; 750 mg once daily in severe infection.',
    maxSingleMg: 750, maxDailyMg: 750,
    brands: [{ name: 'Levoflox', company: 'Cipla' }, { name: 'Glevo', company: 'Glenmark' }, { name: 'Tavanic', company: 'Sanofi' }],
    storage: 'Below 30 °C, protect from light.', counsel: 'Keep 2 hours apart from antacids, iron or calcium. Stop and report tendon pain. Avoid strong sunlight.',
  },
  {
    productId: 'pcm500', klass: 'Analgesic and antipyretic', schedule: 'OTC', nlem: true,
    dose: '500 mg–1 g every 4–6 hours as needed; at least 4 hours between doses. Maximum 4 g a day.',
    maxSingleMg: 1000, maxDailyMg: 4000,
    brands: [{ name: 'Crocin', company: 'Haleon' }, { name: 'Calpol', company: 'Haleon' }, { name: 'Pacimol', company: 'Ipca' }],
    storage: 'Below 30 °C, dry.', counsel: 'No more than 8 tablets in 24 hours. Do not take with other medicines that contain paracetamol.',
  },
  {
    productId: 'dic50', klass: 'Analgesic · NSAID', schedule: 'H', nlem: true,
    dose: '50 mg two or three times daily after food. Maximum 150 mg a day.',
    maxSingleMg: 50, maxDailyMg: 150,
    brands: [{ name: 'Voveran', company: 'Novartis' }, { name: 'Reactin', company: 'Cipla' }, { name: 'Dynapar', company: 'Troikaa' }],
    storage: 'Below 30 °C.', counsel: 'Take after food; swallow whole. Report black stools or stomach pain. Not with other painkillers of this kind.',
  },
  {
    productId: 'cet10', klass: 'Antihistamine', schedule: 'H', nlem: true,
    dose: '10 mg once daily (5 mg in kidney impairment).',
    maxSingleMg: 10, maxDailyMg: 10,
    brands: [{ name: 'Okacet', company: 'Cipla' }, { name: 'Alerid', company: 'Cipla' }, { name: 'Cetzine', company: "Dr. Reddy's" }],
    storage: 'Below 30 °C.', counsel: 'May cause drowsiness: take care driving. Avoid alcohol.',
  },
  {
    productId: 'sal100', klass: 'Bronchodilator · short-acting beta-2 agonist', schedule: 'H', nlem: true,
    dose: '100–200 micrograms (1–2 puffs) when needed, up to 4 times a day.',
    maxSingleMg: 0.2, maxDailyMg: 0.8,
    brands: [{ name: 'Asthalin', company: 'Cipla' }, { name: 'Ventorlin', company: 'GSK' }],
    storage: 'Below 30 °C; do not puncture or burn the can.', counsel: 'Shake before use; breathe out, then press and breathe in slowly. A spacer helps. See the doctor if needed more often.',
  },
  {
    productId: 'ns500', klass: 'IV fluid · crystalloid', schedule: 'H', nlem: true,
    dose: 'Volume and rate as prescribed for the patient.',
    brands: [{ name: 'Generic (hospital supply)', company: 'Various' }],
    storage: 'Below 30 °C; do not use if cloudy or leaking.', counsel: 'Given by the nurse.',
  },
  {
    productId: 'dex4', klass: 'Corticosteroid · injection', schedule: 'H', nlem: true,
    dose: 'Dose set for the condition, usually 4–8 mg IV or IM; higher in cerebral oedema.',
    brands: [{ name: 'Dexona', company: 'Zydus' }, { name: 'Decdan', company: 'Wockhardt' }],
    storage: 'Below 25 °C, protect from light.', counsel: 'Given by the nurse. In diabetes, check sugar more often.',
  },
];

export const monographOf = (productId: string) => FORMULARY.find((m) => m.productId === productId);

/** Doses per day for a frequency code (null when it is "as needed", so only the single dose is checked). */
const PER_DAY: Record<string, number | null> = {
  OD: 1, HS: 1, STAT: 1, BD: 2, BID: 2, TDS: 3, TID: 3, QID: 4, Q6H: 4, Q8H: 3, Q12H: 2, PRN: null, SOS: null,
};

/** "500 mg", "1 g IV", "0.6 mg" → mg; null for units that are not mass (IU, mL). */
export function doseMg(dose: string): number | null {
  const m = dose.match(/([\d.]+)\s*(mcg|mg|g)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'g' ? n * 1000 : unit === 'mcg' ? n / 1000 : n;
}

export interface DoseCheck {
  productId: string;
  level: 'ok' | 'over' | 'unknown';
  text: string;
}

const mgText = (n: number) => (n >= 1000 ? `${n / 1000} g` : `${n} mg`);

/** A prescription line against the formulary maximum (adult). */
export function doseCheck(line: RxLine): DoseCheck {
  const m = monographOf(line.productId);
  const single = doseMg(line.dose);
  const perDay = PER_DAY[line.frequency.toUpperCase()] ?? null;
  if (!m || single == null || (m.maxSingleMg == null && m.maxDailyMg == null)) return { productId: line.productId, level: 'unknown', text: 'No formulary limit to check' };
  if (m.maxSingleMg != null && single > m.maxSingleMg) return { productId: line.productId, level: 'over', text: `${line.dose} is above the usual maximum single dose (${mgText(m.maxSingleMg)})` };
  const daily = perDay == null ? null : single * perDay;
  if (daily != null && m.maxDailyMg != null && daily > m.maxDailyMg) return { productId: line.productId, level: 'over', text: `${mgText(daily)} a day is above the usual maximum (${mgText(m.maxDailyMg)} a day)` };
  if (daily != null) return { productId: line.productId, level: 'ok', text: `${mgText(daily)} a day, within the formulary dose` };
  // As needed: the patient decides when, so say how many doses a day are safe.
  const cap = asNeededCap(line);
  return { productId: line.productId, level: 'ok', text: cap ? `As needed: ${cap}` : 'Single dose within the formulary limit' };
}

/** For an as-needed (PRN / SOS) line: "no more than 4 doses (4 g) a day", from the daily maximum. */
export function asNeededCap(line: RxLine): string | null {
  const m = monographOf(line.productId);
  const single = doseMg(line.dose);
  if (!m?.maxDailyMg || !single || PER_DAY[line.frequency.toUpperCase()] !== null) return null;
  const n = Math.floor(m.maxDailyMg / single);
  return n >= 1 ? `no more than ${n} dose${n === 1 ? '' : 's'} (${mgText(n * single)}) a day` : null;
}

/** Formulary limits are for adults: what to say for a child, or when the age is not recorded. */
export function ageNote(age: number | undefined): { level: 'child' | 'unknown'; text: string } | null {
  if (age == null) return { level: 'unknown', text: 'Age not recorded: adult limits assumed' };
  if (age < 18) return { level: 'child', text: `Child (${age} y): these limits are for adults · check the dose for age or weight` };
  return null;
}

/**
 * Classes where two medicines at once are usually a duplicate, not a plan
 * (two acid suppressants, two statins). Classes often combined on purpose,
 * such as antiplatelets (aspirin + clopidogrel) or antidiabetics, are left out.
 */
const NO_DOUBLE = ['Acid suppression', 'Lipid-lowering', 'Corticosteroid', 'Analgesic and antipyretic'];

/** Medicines on one prescription that share a class from NO_DOUBLE. */
export function sameClass(productIds: string[]): { klass: string; productIds: string[] }[] {
  const by = new Map<string, string[]>();
  for (const id of new Set(productIds)) {
    const family = monographOf(id)?.klass.split(' · ')[0];
    if (family && NO_DOUBLE.includes(family)) by.set(family, [...(by.get(family) ?? []), id]);
  }
  return [...by].filter(([, ids]) => ids.length > 1).map(([klass, ids]) => ({ klass, productIds: ids }));
}

/** One H1 register entry, made when a Schedule H1 medicine is dispensed. */
export interface H1Entry {
  at: Date;
  rxId: string;
  patient: string;
  mrn: string;
  prescriber: string;
  productId: string;
  qty: number;
  batchNo: string;
  by: string;
}

/** Medicines whose brand matches the text ("glycomet", "Augm"), for prescriptions written by brand. */
export function byBrand(text: string): { productId: string; brand: string }[] {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return [];
  return FORMULARY.flatMap((m) =>
    m.brands.filter((b) => b.company !== 'Various' && b.name.toLowerCase().startsWith(t)).map((b) => ({ productId: m.productId, brand: `${b.name} (${b.company})` })),
  );
}

/** The norms the pharmacy works to, as the Formulary page lists them (sample summary; check the current rules). */
export const NORMS: { key: string; title: string; text: string; where: string }[] = [
  {
    key: 'rx-only',
    title: 'Prescription medicines (Schedule H and H1)',
    text: 'Sold only against a prescription from a registered medical practitioner. The bill names the prescriber and patient and shows batch and expiry.',
    where: 'Dispense: patient and prescriber checked; bill with batch and expiry',
  },
  {
    key: 'h1',
    title: 'Schedule H1 register',
    text: 'Each sale is entered with the patient, prescriber, medicine, quantity and date. The register is kept for 3 years and shown to the Drugs Inspector on request.',
    where: 'Made automatically on dispense: Reports › H1 register',
  },
  {
    key: 'nlem',
    title: 'Essential medicines and price control',
    text: 'Medicines in the National List of Essential Medicines (NLEM 2022) are price controlled under DPCO 2013: the MRP must not exceed the ceiling price NPPA notifies.',
    where: 'NLEM badge on each entry; check the MRP against the NPPA list when stock is received',
  },
  {
    key: 'generic',
    title: 'Generic name first',
    text: 'Medicines are recorded and dispensed by generic name. Brands are listed so a prescription written by brand can be matched to the generic.',
    where: 'Search a brand in the Formulary or New prescription',
  },
  {
    key: 'dose',
    title: 'Dose within the formulary',
    text: 'A single or daily dose above the usual adult maximum is confirmed with the prescriber before dispensing, and the confirmation is recorded.',
    where: 'Dispense: Formulary dose check',
  },
  {
    key: 'storage',
    title: 'Storage and cold chain',
    text: 'Stored as the label says; insulin and other 2–8 °C medicines stay in the pharmacy refrigerator and go out without breaking the cold chain.',
    where: 'Cold-chain flag on medicines; storage on each entry',
  },
  {
    key: 'expired',
    title: 'Expired and damaged stock',
    text: 'Never sold. Kept apart, then returned to the supplier against a credit note or sent for destruction with a record.',
    where: 'Inventory: Remove from use, then Return / dispose',
  },
];
