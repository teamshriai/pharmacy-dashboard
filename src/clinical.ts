/**
 * Clinical review: drug–condition and drug–drug checks, retrieved from a small
 * knowledge base and matched against the patient's past history.
 *
 * For each medicine on a prescription it looks up the rules for that medicine,
 * then checks them against what is known about the patient: conditions in the
 * hospital record, and conditions implied by medicines dispensed before (for
 * example Metformin or insulin → diabetes). When a rule matches and the
 * prescription does not mention the condition, the prescriber may not have
 * considered it, so the pharmacist asks for the past history and a revised
 * prescription before dispensing.
 *
 * SAMPLE KNOWLEDGE BASE for demonstration. Live use needs a maintained drug
 * reference (e.g. CIMS India) and always the pharmacist's own judgement.
 */
import { productById, type Bill, type Condition, type Prescription, type Product } from './data';

type Cls = NonNullable<Product['cls']>;
type Code = Condition['code'];

export interface Rule {
  id: string;
  title: string;
  /** The medicine class the rule is about. */
  cls: Cls;
  /** The condition it concerns, or the other medicine class for a drug–drug rule. */
  condition?: Code;
  withCls?: Cls;
  /** revise: dispense only after a revised prescription. warn: the pharmacist reviews and may go on. */
  level: 'revise' | 'warn';
  why: string;
  /** What to ask the prescriber for. */
  ask: string;
}

export const KNOWLEDGE: Rule[] = [
  {
    id: 'steroid-diabetes',
    title: 'Steroid in a diabetic patient',
    cls: 'steroid',
    condition: 'diabetes',
    level: 'revise',
    why: 'Steroids such as prednisolone raise blood sugar, often within a day. In diabetes the dose of diabetes medicines may need to change, and sugar must be checked more often.',
    ask: 'A revised prescription that takes the diabetes into account: confirm the steroid with a sugar-monitoring plan, adjust the diabetes medicines, or change the steroid.',
  },
  {
    id: 'steroid-hypertension',
    title: 'Steroid in hypertension',
    cls: 'steroid',
    condition: 'hypertension',
    level: 'warn',
    why: 'Steroids can raise blood pressure and cause fluid retention.',
    ask: 'Tell the patient to watch blood pressure; confirm with the prescriber if the course is long.',
  },
  {
    id: 'biguanide-ckd',
    title: 'Metformin in kidney disease',
    cls: 'biguanide',
    condition: 'ckd',
    level: 'revise',
    why: 'Metformin builds up when the kidneys are weak and can cause lactic acidosis.',
    ask: 'A revised prescription with the dose set for kidney function (latest eGFR), or a different medicine.',
  },
  {
    id: 'steroid-insulin',
    title: 'Steroid with insulin',
    cls: 'steroid',
    withCls: 'insulin',
    level: 'warn',
    why: 'The steroid works against insulin, so sugar can rise.',
    ask: 'Check that the prescriber has planned sugar monitoring and insulin changes.',
  },
  {
    id: 'clopidogrel-omeprazole',
    title: 'Clopidogrel with omeprazole',
    cls: 'antiplatelet-clopidogrel',
    withCls: 'ppi-omeprazole',
    level: 'warn',
    why: 'Omeprazole can reduce the antiplatelet effect of clopidogrel.',
    ask: 'Consider pantoprazole instead; confirm with the prescriber.',
  },
];

/** Medicines that point to a condition when they appear in a patient's past dispensing. */
const IMPLIES: Partial<Record<Cls, { code: Code; name: string }>> = {
  biguanide: { code: 'diabetes', name: 'Diabetes' },
  insulin: { code: 'diabetes', name: 'Diabetes' },
  sulfonylurea: { code: 'diabetes', name: 'Diabetes' },
};

/** Words that show the prescriber has the condition in mind. */
const MENTIONS: Record<Code, RegExp> = {
  diabetes: /\b(diabet\w*|dm|t2dm|t1dm|sugar|glucose|hba1c)\b/i,
  hypertension: /\b(hypertension|htn|blood pressure|bp)\b/i,
  ckd: /\b(ckd|kidney|renal|egfr)\b/i,
  asthma: /\b(asthma|copd|wheez\w*)\b/i,
};

export interface HistoryItem {
  code: Code;
  name: string;
  /** Where it came from, in words: "Hospital record, since 2021" or "Metformin dispensed 05 Oct". */
  from: string;
}

/** What is known about the patient before this prescription: record plus earlier dispensing. */
export function pastHistory(rx: Prescription, s: { rxs: Prescription[]; bills: Bill[] }) {
  const items: HistoryItem[] = (rx.patient.conditions ?? []).map((c) => ({
    code: c.code,
    name: c.name,
    from: `${c.source}${c.since ? `, since ${c.since}` : ''}`,
  }));
  const meds: { productId: string; at: Date; how: string }[] = [];
  for (const b of s.bills) {
    if (b.patient.mrn !== rx.patient.mrn || b.rxId === rx.id) continue;
    for (const l of b.lines) meds.push({ productId: l.productId, at: b.at, how: `dispensed ${b.at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` });
  }
  for (const r of s.rxs) {
    if (r.patient.mrn !== rx.patient.mrn || r.id === rx.id || r.time >= rx.time) continue;
    for (const l of r.lines) if (!meds.some((m) => m.productId === l.productId)) meds.push({ productId: l.productId, at: r.time, how: `prescribed ${r.time.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` });
  }
  for (const m of meds) {
    const p = productById(m.productId);
    const imp = p.cls && IMPLIES[p.cls];
    if (imp && !items.some((x) => x.code === imp.code)) items.push({ code: imp.code, name: imp.name, from: `${p.generic} ${m.how}` });
  }
  return { conditions: items, meds };
}

export interface Finding {
  rule: Rule;
  productId: string;
  /** Why it applies to this patient: history items or the other medicine. */
  evidence: string[];
  /** The prescription itself mentions the condition (its diagnosis / reason). */
  mentioned: boolean;
  /** A revised prescription has been recorded for this medicine. */
  resolved: boolean;
  /** Dispensing waits for a revised prescription. */
  blocking: boolean;
}

/** Retrieves the rules for each medicine and keeps the ones the patient's history makes relevant. */
export function clinicalReview(rx: Prescription, s: { rxs: Prescription[]; bills: Bill[] }): Finding[] {
  const hist = pastHistory(rx, s);
  // Only what the prescriber wrote counts; the pharmacy's own hold notes must not unlock it.
  const text = rx.diagnosis ?? '';
  const onNow = new Set<Cls>();
  for (const l of rx.lines) { const c = productById(l.productId).cls; if (c) onNow.add(c); }
  for (const m of hist.meds) { const c = productById(m.productId).cls; if (c) onNow.add(c); }

  const out: Finding[] = [];
  for (const l of rx.lines) {
    const p = productById(l.productId);
    if (!p.cls) continue;
    for (const rule of KNOWLEDGE.filter((r) => r.cls === p.cls)) {
      let evidence: string[] = [];
      let mentioned = false;
      if (rule.condition) {
        const hits = hist.conditions.filter((c) => c.code === rule.condition);
        if (!hits.length) continue;
        evidence = hits.map((h) => `${h.name} (${h.from})`);
        mentioned = MENTIONS[rule.condition].test(text);
      } else if (rule.withCls) {
        if (!onNow.has(rule.withCls)) continue;
        const other = [...rx.lines.map((x) => x.productId), ...hist.meds.map((m) => m.productId)].map(productById).find((x) => x.cls === rule.withCls)!;
        evidence = [`Also on ${other.generic}`];
      }
      const resolved = !!rx.revision && rx.revision.productIds.includes(p.id);
      out.push({ rule, productId: p.id, evidence, mentioned, resolved, blocking: rule.level === 'revise' && !mentioned && !resolved });
    }
  }
  return out;
}

/** Medicines the prescriber stopped in a revised prescription: not dispensed. */
export const stoppedByRevision = (rx: Prescription) => (rx.revision?.outcome === 'stop' ? rx.revision.productIds : []);
