import { useState } from 'react';
import { Icon } from './design/Icon';
import {
  DISPENSE_FROM,
  DOCTORS,
  FREQUENCIES,
  PRODUCTS,
  WARDS,
  allergyConflict,
  dispensable,
  placeOf,
  productById,
  productName,
  type Encounter,
  type Patient,
  type RxLine,
  type RxType,
} from './data';
import { Avatar, EncounterBadge, Head, NurseLine, Stat } from './parts';
import type { Store } from './store';

const STEPS = ['Patient', 'Prescription', 'Review'];
const COMMON_ALLERGIES = ['Penicillin', 'Sulfonamides', 'NSAIDs', 'Aspirin'];
const TYPE_FOR: Record<Encounter, 'OP' | 'IP' | 'Emergency'> = { Outpatient: 'OP', Inpatient: 'IP', Emergency: 'Emergency' };

interface Line {
  uid: string;
  productId: string;
  dose: string;
  freq: string;
  days: number;
  qty: number;
  /** Once the quantity is typed by hand it stops following frequency × days. */
  manual: boolean;
}

const newLine = (): Line => ({ uid: Math.random().toString(36).slice(2), productId: '', dose: '', freq: 'OD', days: 5, qty: 5, manual: false });
const perDay = (code: string) => FREQUENCIES.find((f) => f.code === code)?.perDay ?? 0;
const autoQty = (l: Line) => (l.freq === 'STAT' ? 1 : perDay(l.freq) * l.days);

export function NewRx({ store }: { store: Store }) {
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);

  // ---- patient ----
  const [mode, setMode] = useState<'find' | 'new'>('find');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Patient | null>(null);
  const [f, setF] = useState({
    name: '', age: '', sex: '' as '' | 'M' | 'F', mobile: '', allergies: [] as string[], other: '',
    encounter: 'Outpatient' as Encounter, ipNo: '', ward: 'ICU', bed: '', nurse: 0,
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  // ---- prescription ----
  const [doctor, setDoctor] = useState('');
  const [discharge, setDischarge] = useState(false);
  const [stat, setStat] = useState(false);
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const q2 = q.trim().toLowerCase();
  const matches = q2 ? store.patients.filter((p) => `${p.name} ${p.mrn} ${p.mobile ?? ''} ${p.ipNo ?? ''}`.toLowerCase().includes(q2)).slice(0, 6) : [];
  const roster = WARDS.find((w) => w.ward === (f.encounter === 'Emergency' ? 'Emergency' : f.ward))?.nurses ?? [];

  const newErrors: string[] = [];
  if (f.encounter !== 'Emergency' && f.name.trim().length < 2) newErrors.push('Name');
  if (f.encounter !== 'Emergency' && !(Number(f.age) > 0 && Number(f.age) <= 120)) newErrors.push('Age');
  if (f.encounter !== 'Emergency' && !f.sex) newErrors.push('Sex');
  if (f.mobile && !/^[6-9]\d{9}$/.test(f.mobile)) newErrors.push('Mobile');
  if (f.encounter === 'Inpatient' && !f.ipNo.trim()) newErrors.push('IP no.');
  if (f.encounter !== 'Outpatient' && !f.bed.trim()) newErrors.push(f.encounter === 'Emergency' ? 'Bay' : 'Bed');

  /** The patient being registered, everything except the MRN, which is issued on save. */
  function shape(): Omit<Patient, 'mrn'> {
    const ward = f.encounter === 'Emergency' ? 'Emergency' : f.encounter === 'Inpatient' ? f.ward : undefined;
    return {
      name: f.name.trim() || 'Emergency patient (unidentified)',
      age: f.age ? Number(f.age) : undefined,
      sex: f.sex || undefined,
      mobile: f.mobile || undefined,
      allergies: [...f.allergies, ...f.other.split(',').map((a) => a.trim()).filter(Boolean)],
      encounter: f.encounter,
      ipNo: f.encounter === 'Inpatient' ? f.ipNo.trim().toUpperCase() : undefined,
      ward,
      bed: f.encounter === 'Outpatient' ? undefined : f.bed.trim(),
      nurse: ward ? roster[f.nurse] : undefined,
    };
  }

  const patientOk = mode === 'find' ? !!picked : newErrors.length === 0;
  /** What the review shows; a new registration reads "New" until its MRN is issued. */
  const patient: Patient | null = !patientOk ? null : mode === 'find' && picked ? picked : { ...shape(), mrn: 'New' };

  function buildPatient(): Patient {
    if (mode === 'find' && picked) return picked;
    const taken = new Set(store.patients.map((x) => x.mrn));
    let mrn = '';
    do {
      mrn = f.encounter === 'Emergency' ? `ER-${Math.floor(1000 + Math.random() * 9000)}` : `SH-1${Math.floor(10000 + Math.random() * 89999)}`;
    } while (taken.has(mrn));
    return { ...shape(), mrn };
  }

  const encounter = patient?.encounter ?? 'Outpatient';
  const type: RxType = encounter === 'Emergency' ? 'Emergency' : encounter === 'Inpatient' ? (discharge ? 'Discharge' : 'IP') : 'OP';

  const counterStock = (pid: string) =>
    store.batches.filter((b) => b.productId === pid && b.location === DISPENSE_FROM && dispensable(b)).reduce((n, b) => n + b.qty, 0);

  const lineErrors = lines.map((l) => {
    const e: string[] = [];
    if (!l.productId) e.push('Medicine');
    if (!l.dose.trim()) e.push('Dose');
    if (l.freq !== 'STAT' && l.freq !== 'SOS' && !(l.days > 0)) e.push('Days');
    if (!(l.qty > 0)) e.push('Qty');
    return e;
  });
  const rxOk = !!doctor && lineErrors.every((e) => e.length === 0);
  const dupes = new Set(lines.map((l) => l.productId).filter((id, i, a) => id && a.indexOf(id) !== i));

  function setLine(uid: string, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.uid !== uid) return l;
        const next = { ...l, ...patch };
        // A plain strength ("20 mg") is a dose; a concentration ("40 IU/mL") is not, so
        // for those the dose is left for the pharmacist to enter.
        if (patch.productId && patch.productId !== l.productId) {
          const st = productById(patch.productId).strength;
          next.dose = st.includes('/') ? '' : st;
        }
        if ('qty' in patch) return next; // typed by hand: keep it
        if (next.freq === 'STAT') return { ...next, qty: 1, manual: false };
        if (!next.manual && next.freq !== 'SOS') next.qty = autoQty(next); // SOS has no fixed count
        return next;
      })
    );
  }

  function next() {
    setTried(true);
    if (step === 0 && !patientOk) return;
    if (step === 1 && !rxOk) return;
    setTried(false);
    if (step === 0 && encounter === 'Emergency') setStat(true);
    setStep((s) => s + 1);
  }

  function save(dispenseNow: boolean) {
    const p = buildPatient();
    const rxLines: RxLine[] = lines.map((l) => ({
      productId: l.productId,
      dose: l.dose.trim(),
      frequency: l.freq,
      duration: l.freq === 'STAT' ? '—' : l.freq === 'SOS' ? 'As needed' : `${l.days} day${l.days === 1 ? '' : 's'}`,
      qty: l.qty,
    }));
    const rx = store.addRx({ patient: p, type, stat, doctor, lines: rxLines });
    if (dispenseNow) store.openRx(rx.id, rx);
    else {
      store.go('dashboard');
      store.setFlash(`${rx.id} added to the queue · ${p.name}`);
    }
  }

  return (
    <div className="ph-stack step-enter">
      <div className="card ph-card ph-rx-head">
        <button className="btn-text" onClick={store.cancelEntry}>← Back</button>
        <span className="ph-rx-id">
          <strong>New prescription</strong>
          <span>Entered by pharmacy · verified at dispensing</span>
        </span>
        <ol className="ph-steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
              <span>{i < step ? <Icon name="checkCircle" size={13} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      {/* ------------------------------ 1. Patient ------------------------------ */}
      {step === 0 && (
        <section className="card ph-card">
          <Head icon="userCheck" title="Patient" sub="Find a patient on file, or register a walk-in." />
          <div className="ph-seg ph-mode" role="radiogroup" aria-label="Patient">
            <button role="radio" aria-checked={mode === 'find'} className={mode === 'find' ? 'is-on' : ''} onClick={() => setMode('find')}>
              <Icon name="search" size={13} /> On file
            </button>
            <button role="radio" aria-checked={mode === 'new'} className={mode === 'new' ? 'is-on' : ''} onClick={() => { setMode('new'); setPicked(null); }}>
              <Icon name="plus" size={13} /> New walk-in
            </button>
          </div>

          {mode === 'find' ? (
            <>
              <label className="field">
                <span className="field-label">Name, MRN, IP no. or mobile</span>
                <input className="field-input" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="e.g. Ravi or SH-102345" autoFocus />
              </label>
              <ul className="ph-find">
                {matches.map((p) => (
                  <li key={p.mrn}>
                    <button className={`ph-find-row ${picked?.mrn === p.mrn ? 'is-on' : ''}`} onClick={() => setPicked(p)}>
                      <Avatar name={p.name} type={TYPE_FOR[p.encounter]} />
                      <span className="ph-find-who">
                        <strong>{p.name}</strong>
                        <span>{p.mrn}{p.age ? ` · ${p.age} ${p.sex}` : ''} · {p.encounter === 'Outpatient' ? 'Outpatient' : `${p.ipNo ? p.ipNo + ' · ' : ''}${placeOf(p)}`}</span>
                      </span>
                      <EncounterBadge encounter={p.encounter} />
                      {picked?.mrn === p.mrn && <Icon name="checkCircle" size={18} />}
                    </button>
                  </li>
                ))}
              </ul>
              {q2 && matches.length === 0 && (
                <p className="ph-muted ph-find-none">
                  No patient on file matches. <button className="btn-text" onClick={() => { setMode('new'); set({ name: q.trim() }); }}>Register “{q.trim()}” as a walk-in →</button>
                </p>
              )}
              {tried && !picked && <div className="alert alert-error" style={{ marginTop: 12 }}>Select a patient, or register a walk-in.</div>}
            </>
          ) : (
            <>
              <div className="ph-seg ph-enc" role="radiogroup" aria-label="Encounter">
                {(['Outpatient', 'Inpatient', 'Emergency'] as Encounter[]).map((e) => (
                  <button key={e} role="radio" aria-checked={f.encounter === e} className={`${f.encounter === e ? 'is-on' : ''} ph-type--${TYPE_FOR[e].toLowerCase()}`} onClick={() => set({ encounter: e, nurse: 0 })}>
                    <EncounterBadge encounter={e} />
                  </button>
                ))}
              </div>

              <div className="ph-form">
                <label className="field ph-span2">
                  <span className="field-label">Full name{f.encounter !== 'Emergency' && <span className="field-required">*</span>}</span>
                  <input className={`field-input ${tried && newErrors.includes('Name') ? 'is-bad' : ''}`} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.encounter === 'Emergency' ? 'Leave blank if unidentified' : ''} autoFocus />
                </label>
                <label className="field">
                  <span className="field-label">Age{f.encounter !== 'Emergency' && <span className="field-required">*</span>}</span>
                  <input className={`field-input ${tried && newErrors.includes('Age') ? 'is-bad' : ''}`} value={f.age} inputMode="numeric" onChange={(e) => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
                </label>
                <div className="field">
                  <span className="field-label">Sex{f.encounter !== 'Emergency' && <span className="field-required">*</span>}</span>
                  <div className={`ph-seg ${tried && newErrors.includes('Sex') ? 'is-bad' : ''}`} role="radiogroup" aria-label="Sex">
                    {(['M', 'F'] as const).map((x) => (
                      <button key={x} role="radio" aria-checked={f.sex === x} className={f.sex === x ? 'is-on' : ''} onClick={() => set({ sex: x })}>
                        {x === 'M' ? 'Male' : 'Female'}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span className="field-label">Mobile</span>
                  <input className={`field-input ${tried && newErrors.includes('Mobile') ? 'is-bad' : ''}`} value={f.mobile} inputMode="numeric" placeholder="Optional" onChange={(e) => set({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
                </label>

                {f.encounter === 'Inpatient' && (
                  <>
                    <label className="field">
                      <span className="field-label">IP no.<span className="field-required">*</span></span>
                      <input className={`field-input mono ${tried && newErrors.includes('IP no.') ? 'is-bad' : ''}`} value={f.ipNo} onChange={(e) => set({ ipNo: e.target.value })} placeholder="IP-2026-00452" />
                    </label>
                    <label className="field">
                      <span className="field-label">Ward</span>
                      <select className="field-input" value={f.ward} onChange={(e) => set({ ward: e.target.value, nurse: 0 })}>
                        {WARDS.filter((w) => w.ward !== 'Emergency').map((w) => <option key={w.ward}>{w.ward}</option>)}
                      </select>
                    </label>
                  </>
                )}
                {f.encounter !== 'Outpatient' && (
                  <>
                    <label className="field">
                      <span className="field-label">{f.encounter === 'Emergency' ? 'Bay' : 'Bed'}<span className="field-required">*</span></span>
                      <input className={`field-input ${tried && (newErrors.includes('Bed') || newErrors.includes('Bay')) ? 'is-bad' : ''}`} value={f.bed} onChange={(e) => set({ bed: e.target.value })} placeholder={f.encounter === 'Emergency' ? 'Bay 2' : 'Bed 11'} />
                    </label>
                    <label className="field">
                      <span className="field-label">{f.encounter === 'Emergency' ? 'Emergency nurse' : 'Ward nurse'} on duty</span>
                      <select className="field-input" value={f.nurse} onChange={(e) => set({ nurse: Number(e.target.value) })}>
                        {roster.map((n, i) => <option key={n.name} value={i}>{n.name} · Ext {n.ext}</option>)}
                      </select>
                    </label>
                  </>
                )}

                <div className="field ph-span-all">
                  <span className="field-label">Allergies</span>
                  <div className="ph-allergy-pick">
                    {COMMON_ALLERGIES.map((a) => {
                      const on = f.allergies.includes(a);
                      return (
                        <button key={a} className={`ph-chip ${on ? 'ph-chip--on ph-chip--danger' : ''}`} onClick={() => set({ allergies: on ? f.allergies.filter((x) => x !== a) : [...f.allergies, a] })} aria-pressed={on}>
                          {on && <Icon name="alert" size={12} />}
                          {a}
                        </button>
                      );
                    })}
                    <input className="field-input ph-allergy-other" value={f.other} onChange={(e) => set({ other: e.target.value })} placeholder="Other, comma separated" />
                  </div>
                </div>
              </div>
              {tried && newErrors.length > 0 && <div className="alert alert-error" style={{ marginTop: 12 }}>Complete: {newErrors.join(', ')}.</div>}
            </>
          )}
        </section>
      )}

      {/* ---------------------------- 2. Prescription --------------------------- */}
      {step === 1 && patient && (
        <section className="card ph-card">
          <PatientStrip patient={patient} />

          <div className="ph-rx-meta">
            <label className="field">
              <span className="field-label">Prescriber<span className="field-required">*</span></span>
              <select className={`field-input ${tried && !doctor ? 'is-bad' : ''}`} value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                <option value="">Select</option>
                {DOCTORS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Priority</span>
              <div className="ph-seg" role="radiogroup" aria-label="Priority">
                <button role="radio" aria-checked={!stat} className={!stat ? 'is-on' : ''} onClick={() => setStat(false)}>Routine</button>
                <button role="radio" aria-checked={stat} className={stat ? 'is-on ph-seg-stat' : ''} onClick={() => setStat(true)}>STAT</button>
              </div>
            </div>
            {encounter === 'Inpatient' && (
              <div className="field">
                <span className="field-label">Order</span>
                <div className="ph-seg" role="radiogroup" aria-label="Order type">
                  <button role="radio" aria-checked={!discharge} className={!discharge ? 'is-on' : ''} onClick={() => setDischarge(false)}>Ward issue</button>
                  <button role="radio" aria-checked={discharge} className={discharge ? 'is-on' : ''} onClick={() => setDischarge(true)}>Discharge</button>
                </div>
              </div>
            )}
          </div>

          <Head
            icon="pill"
            title="Medicines"
            sub="Quantity follows frequency × days until you type your own."
            action={
              <button className="btn btn-secondary ph-small-btn" onClick={() => setLines((ls) => [...ls, newLine()])}>
                <span className="btn-ico"><Icon name="plus" size={14} /></span>Add medicine
              </button>
            }
          />
          <ul className="ph-entry-lines">
            {lines.map((l, i) => {
              const p = l.productId ? productById(l.productId) : null;
              const conflict = p && allergyConflict(patient, p);
              const stock = p ? counterStock(p.id) : 0;
              const bad = (k: string) => (tried && lineErrors[i].includes(k) ? 'is-bad' : '');
              return (
                <li key={l.uid} className={`ph-entry ${conflict ? 'is-conflict' : ''}`}>
                  <span className="ph-entry-no">{i + 1}</span>
                  <label className="field ph-entry-med">
                    <span className="field-label">Medicine</span>
                    <select className={`field-input ${bad('Medicine')}`} value={l.productId} onChange={(e) => setLine(l.uid, { productId: e.target.value })}>
                      <option value="">Select</option>
                      {PRODUCTS.map((x) => <option key={x.id} value={x.id}>{productName(x)} {x.form}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Dose</span>
                    <input
                      className={`field-input ${bad('Dose')}`}
                      value={l.dose}
                      onFocus={(e) => e.target.select()}
                      placeholder={p?.strength.includes('/') ? 'e.g. 10 IU' : ''}
                      onChange={(e) => setLine(l.uid, { dose: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Frequency</span>
                    <select className="field-input" value={l.freq} onChange={(e) => setLine(l.uid, { freq: e.target.value })} title={FREQUENCIES.find((x) => x.code === l.freq)?.label}>
                      {FREQUENCIES.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Days</span>
                    <input
                      className={`field-input num ${bad('Days')}`}
                      value={l.freq === 'STAT' ? '' : l.days || ''}
                      disabled={l.freq === 'STAT'}
                      onFocus={(e) => e.target.select()}
                      inputMode="numeric"
                      placeholder={l.freq === 'STAT' ? '—' : ''}
                      onChange={(e) => setLine(l.uid, { days: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Qty {l.manual && <em className="ph-manual">edited</em>}</span>
                    <input
                      className={`field-input num ${bad('Qty')}`}
                      value={l.qty || ''}
                      onFocus={(e) => e.target.select()}
                      inputMode="numeric"
                      onChange={(e) => setLine(l.uid, { qty: Number(e.target.value.replace(/\D/g, '').slice(0, 4)), manual: true })}
                    />
                  </label>
                  <button className="ph-x ph-entry-x" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.uid !== l.uid) : [newLine()]))} aria-label="Remove medicine">
                    <Icon name="close" size={14} />
                  </button>

                  {p && (
                    <div className="ph-entry-notes">
                      <span className={`ph-entry-stock ${stock >= l.qty ? 'is-ok' : 'is-short'}`}>
                        <Icon name={stock >= l.qty ? 'checkCircle' : 'alert'} size={12} />
                        {stock} at counter{stock < l.qty ? ` · short by ${l.qty - stock}` : ''}
                      </span>
                      {p.schedule === 'H1' && <span className="ph-flag ph-flag--h1">H1</span>}
                      {p.cold && <span className="ph-flag"><Icon name="snow" size={11} /> Cold chain</span>}
                      {conflict && <span className="ph-entry-conflict"><Icon name="ban" size={12} /> Conflicts with {conflict} allergy</span>}
                      {dupes.has(p.id) && <span className="ph-entry-dupe"><Icon name="alert" size={12} /> Listed twice</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {tried && !rxOk && (
            <div className="alert alert-error" style={{ marginTop: 12 }}>
              {!doctor ? 'Select the prescriber. ' : ''}
              {lineErrors.map((e, i) => (e.length ? `Medicine ${i + 1}: ${e.join(', ')}. ` : '')).join('')}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------ 3. Review ------------------------------- */}
      {step === 2 && patient && (
        <section className="card ph-card">
          <PatientStrip patient={patient} />
          <div className="ph-review-meta">
            <span><em>Type</em>{type}</span>
            <span><em>Priority</em>{stat ? <span className="ph-prio-stat"><Stat /> STAT</span> : 'Routine'}</span>
            <span><em>Prescriber</em>{doctor}</span>
            <span><em>Billing</em>{encounter === 'Outpatient' ? 'Pay at counter' : `Charged to ${patient.ipNo ?? 'emergency record'}`}</span>
          </div>
          <div className="ph-table-wrap">
            <table className="ph-table">
              <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th className="num">Qty</th><th>Check</th></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const p = productById(l.productId);
                  const conflict = allergyConflict(patient, p);
                  const short = counterStock(p.id) < l.qty;
                  return (
                    <tr key={l.uid}>
                      <td>{i + 1}</td>
                      <td><strong>{productName(p)}</strong> <span className="ph-muted">{p.form}</span></td>
                      <td>{l.dose}</td>
                      <td>{l.freq}</td>
                      <td>{l.freq === 'STAT' ? '—' : l.freq === 'SOS' ? 'As needed' : `${l.days} d`}</td>
                      <td className="num">{l.qty}</td>
                      <td>
                        {conflict ? (
                          <span className="ph-status ph-status--danger"><Icon name="ban" size={12} />Allergy</span>
                        ) : short ? (
                          <span className="ph-status ph-status--warn"><Icon name="alert" size={12} />Short</span>
                        ) : (
                          <span className="ph-status ph-status--ok"><Icon name="checkCircle" size={12} />Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="ph-muted ph-review-note">
            <Icon name="shieldCheck" size={13} /> Allergy, interaction and stock checks run again at dispensing, where the pharmacist verifies.
          </p>
        </section>
      )}

      <div className="ph-entry-foot">
        {step > 0 && <button className="btn btn-secondary" onClick={() => { setTried(false); setStep((s) => s - 1); }}>Back</button>}
        <span className="ph-entry-spacer" />
        {step < 2 ? (
          <button className="btn btn-primary" onClick={next}>Continue</button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={() => save(false)}>Add to queue</button>
            <button className="btn btn-primary" onClick={() => save(true)}>
              <span className="btn-ico"><Icon name="pill" size={14} /></span>Add and dispense
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PatientStrip({ patient }: { patient: Patient }) {
  return (
    <div className="ph-pstrip">
      <Avatar name={patient.name} type={TYPE_FOR[patient.encounter]} />
      <span className="ph-pstrip-who">
        <strong>{patient.name}</strong>
        <span>
          {patient.mrn === 'New' ? 'New registration' : patient.mrn}
          {patient.age ? ` · ${patient.age} ${patient.sex ?? ''}` : ''}
          {patient.encounter !== 'Outpatient' ? ` · ${patient.ipNo ? patient.ipNo + ' · ' : ''}${placeOf(patient)}` : ''}
        </span>
      </span>
      <EncounterBadge encounter={patient.encounter} />
      {patient.allergies.length > 0 ? (
        <span className="ph-allergy ph-allergy--inline"><Icon name="alert" size={13} /> {patient.allergies.join(', ')}</span>
      ) : (
        <span className="ph-allergy ph-allergy--none ph-allergy--inline"><Icon name="checkCircle" size={13} /> No known allergies</span>
      )}
      {patient.nurse && <NurseLine nurse={patient.nurse} encounter={patient.encounter} />}
    </div>
  );
}
