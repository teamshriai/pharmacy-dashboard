import { useEffect, useMemo, useState } from 'react';
import { Icon } from './design/Icon';
import {
  DISPENSE_FROM,
  accountOf,
  allergyConflict,
  dispensable,
  fefo,
  hhmm,
  inr,
  interactions,
  onAccount,
  placeOf,
  productById,
  productName,
  type Bill,
  type Prescription,
} from './data';
import { byUrgency } from './Dashboard';
import { Avatar, EncounterBadge, Expiry, NurseLine, Stat, TypeBadge } from './parts';
import { TransactionReceipt } from './Receipt';
import type { Picks, Store } from './store';
import { clinicalReview, pastHistory, stoppedByRevision } from './clinical';
import { ClinicalReview } from './ClinicalReview';
import { ageNote, asNeededCap, doseCheck, monographOf, sameClass } from './formulary';

type Check = { label: string; state: 'ok' | 'warn' | 'stop'; note?: string };

const HOLD_REASONS = ['Query to prescriber', 'Awaiting stock', 'Patient not present'];
/** Outpatients pay at the hospital billing counter before the medicines are given; accounts are charged. */
const STEPS_PAY = ['Review', 'Pick', 'Billing', 'Give'];
const STEPS_ACCOUNT = ['Review', 'Pick', 'Give'];

export function Dispense({ store, rx }: { store: Store; rx: Prescription }) {
  // Inpatients (including discharge) and emergency patients are billed to their account.
  const account = onAccount(rx.patient);
  const STEPS = account ? STEPS_ACCOUNT : STEPS_PAY;
  // Sent to the billing counter: the picks wait with the prescription until it is paid.
  const atBilling = rx.status === 'At billing' && !!rx.billing;

  // Contraindicated lines are never allocated; everything else starts on FEFO.
  // Allergy conflicts, and anything the prescriber stopped in a revised prescription.
  const blocked = useMemo(
    () => new Set([...rx.lines.filter((l) => allergyConflict(rx.patient, productById(l.productId))).map((l) => l.productId), ...stoppedByRevision(rx)]),
    [rx]
  );
  const stopped = new Set(stoppedByRevision(rx));
  // Past history and the drug knowledge base: what the prescriber may not have considered.
  const history = pastHistory(rx, store);
  const findings = clinicalReview(rx, store);
  const mustRevise = findings.some((f) => f.blocking);
  // Formulary dose: above the usual adult maximum waits for the prescriber's confirmation.
  const confirmedDose = new Set(rx.doseConfirmed ?? []);
  const doses = rx.lines.filter((l) => !blocked.has(l.productId)).map(doseCheck);
  const overDose = doses.filter((d) => d.level === 'over' && !confirmedDose.has(d.productId));
  const doseOf = (pid: string) => doses.find((d) => d.productId === pid);
  // The FEFO split is taken once, when the prescription opens (the parent keys
  // this screen by prescription, so a different one gets a fresh split).
  const [auto] = useState<Picks>(() => {
    const p: Picks = {};
    for (const l of rx.lines) p[l.productId] = blocked.has(l.productId) ? [] : fefo(store.batches, l.productId, l.qty);
    return p;
  });

  const [picks, setPicks] = useState<Picks>(() => {
    if (!rx.billing) return auto;
    // Never more than is still on the batch.
    const p: Picks = {};
    for (const [pid, ps] of Object.entries(rx.billing.picks)) p[pid] = ps.map((x) => ({ ...x, qty: Math.min(x.qty, store.batches.find((b) => b.id === x.batchId)?.qty ?? 0) })).filter((x) => x.qty > 0);
    return p;
  });
  // A medicine the prescriber stops later gives back its picked batches (not billed, not dispensed).
  const stoppedKey = stoppedByRevision(rx).join(',');
  useEffect(() => {
    if (!stoppedKey) return;
    setPicks((cur) => {
      const next = { ...cur };
      for (const id of stoppedKey.split(',')) next[id] = [];
      return next;
    });
  }, [stoppedKey]);
  const [open, setOpen] = useState<string | null>(rx.lines[0]?.productId ?? null);
  const [verified, setVerified] = useState(atBilling);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState<{ bill: Bill; short: boolean; picks: Picks } | null>(null);

  const allocated = (pid: string) => (picks[pid] ?? []).reduce((n, p) => n + p.qty, 0);
  const shortLines = rx.lines.filter((l) => !blocked.has(l.productId) && allocated(l.productId) < l.qty);
  const short = shortLines.length > 0 || blocked.size > 0;
  const warnings = interactions(rx.lines.filter((l) => !blocked.has(l.productId)));
  const dupes = rx.lines.length !== new Set(rx.lines.map((l) => l.productId)).size;
  // Two medicines of a class not usually doubled (two acid suppressants, two statins).
  const doubles = sameClass(rx.lines.filter((l) => !blocked.has(l.productId)).map((l) => l.productId));
  // The formulary limits are for adults.
  const age = ageNote(rx.patient.age);
  const limited = doses.some((d) => d.level !== 'unknown');

  const billLines = rx.lines
    .filter((l) => allocated(l.productId) > 0)
    .map((l) => {
      const p = productById(l.productId);
      const qty = allocated(l.productId);
      const amount = qty * p.mrp;
      return { p, qty, amount, gstIn: amount - amount / (1 + p.gst / 100) };
    });
  const total = billLines.reduce((n, x) => n + x.amount, 0);
  const gst = billLines.reduce((n, x) => n + x.gstIn, 0);

  const checks: Check[] = [
    { label: 'Patient identified', state: 'ok', note: rx.patient.mrn },
    blocked.size
      ? { label: 'Allergy', state: 'stop', note: `${rx.patient.allergies.join(', ')} · conflicts with ${[...blocked].map((id) => productById(id).generic).join(', ')}` }
      : { label: 'Allergy', state: 'ok', note: rx.patient.allergies.length ? `${rx.patient.allergies.join(', ')} · no conflict` : 'None recorded' },
    warnings.length ? { label: 'Interaction', state: 'warn', note: warnings[0].note } : { label: 'Interaction', state: 'ok', note: 'None found' },
    mustRevise
      ? { label: 'Medical history', state: 'stop', note: `${findings.filter((f) => f.blocking).map((f) => `${productById(f.productId).generic} with ${f.rule.condition ?? 'another medicine'}`).join(', ')} · revised prescription needed` }
      : findings.some((f) => !f.resolved && f.rule.condition)
        ? { label: 'Medical history', state: 'warn', note: 'Prescriber noted the condition · review' }
        : { label: 'Medical history', state: 'ok', note: history.conditions.length ? (rx.revision ? 'Revised prescription recorded' : 'No conflict found') : 'Nothing on record' },
    overDose.length
      ? { label: 'Formulary dose', state: 'stop', note: `${overDose.map((d) => `${productById(d.productId).generic}: ${d.text}`).join('; ')} · confirm with the prescriber` }
      : doses.some((d) => d.level === 'over')
        ? { label: 'Formulary dose', state: 'warn', note: 'Above the usual maximum · prescriber confirmed' }
        : age?.level === 'child' && limited
          ? { label: 'Formulary dose', state: 'warn', note: age.text }
          : { label: 'Formulary dose', state: 'ok', note: limited ? `Within the formulary dose${age ? ` · ${age.text.toLowerCase()}` : ''}` : 'No fixed maximum to check' },
    dupes
      ? { label: 'Same medicine twice', state: 'warn', note: 'Listed more than once' }
      : doubles.length
        ? { label: 'Same medicine twice', state: 'warn', note: doubles.map((d) => `${d.productIds.map((id) => productById(id).generic).join(' and ')}: both ${d.klass.toLowerCase()} · check one is meant to replace the other`).join('; ') }
        : { label: 'Same medicine twice', state: 'ok', note: 'No, and no two of the same class' },
    shortLines.length
      ? { label: 'Stock', state: 'warn', note: `Short on ${shortLines.map((l) => productById(l.productId).generic).join(', ')}` }
      : { label: 'Stock', state: 'ok', note: 'All lines allocated' },
  ];

  const step = done ? STEPS.length : atBilling ? 2 : verified ? 1 : 0;
  // A medicine that needs a revised prescription keeps the whole order waiting.
  const canDispense = verified && billLines.length > 0 && !mustRevise && overDose.length === 0;
  const waitingFor = mustRevise ? 'Waiting for the revised prescription' : overDose.length ? 'Confirm the dose with the prescriber first' : '';

  function setPick(pid: string, batchId: string, qty: number, cap: number, need: number) {
    setPicks((cur) => {
      const others = (cur[pid] ?? []).filter((p) => p.batchId !== batchId);
      const othersQty = others.reduce((n, p) => n + p.qty, 0);
      const q = Math.max(0, Math.min(Math.floor(qty) || 0, cap, need - othersQty));
      return { ...cur, [pid]: q ? [...others, { batchId, qty: q }] : others };
    });
  }

  function give() {
    setDone({ bill: store.dispense(rx.id, picks, short, account ? 'Account' : 'Billing counter'), short, picks });
  }

  function nextRx() {
    const next = [...store.pending].filter((r) => r.id !== rx.id).sort(byUrgency)[0];
    if (next) store.openRx(next.id);
    else store.go('dashboard');
  }

  return (
    <div className="ph-stack step-enter">
      <div className="card ph-card ph-rx-head">
        <button className="btn-text" onClick={store.closeRx}>← Dashboard</button>
        <span className="ph-rx-id">
          <strong>{rx.id}</strong>
          <span>{rx.doctor} · {hhmm(rx.time)}</span>
        </span>
        <span className="ph-rx-tags">{rx.stat && <Stat />}<TypeBadge type={rx.type} /></span>
        <ol className="ph-steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} data-step={s.toLowerCase()} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
              <span>{i < step ? <Icon name="checkCircle" size={13} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      {done ? (
        <TransactionReceipt
          bill={done.bill}
          notes={
            <>
            <Counselling rx={rx} picks={done.picks} />
            {done.short && (
              <ul className="ph-backorder">
                {rx.lines.map((l) => {
                  const got = (done.picks[l.productId] ?? []).reduce((n, p) => n + p.qty, 0);
                  if (got >= l.qty) return null;
                  return (
                    <li key={l.productId}>
                      <Icon name={blocked.has(l.productId) ? 'ban' : 'clock'} size={13} />
                      {productName(productById(l.productId))}: {stopped.has(l.productId) ? 'not given (stopped by the prescriber)' : blocked.has(l.productId) ? 'not given (allergy)' : `${l.qty - got} to give later`}
                    </li>
                  );
                })}
              </ul>
            )}
            </>
          }
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => store.openBill(done.bill.no)}>
                <span className="btn-ico"><Icon name="receipt" size={14} /></span>View bill
              </button>
              <button className="btn btn-secondary" onClick={nextRx}>
                Next prescription<span className="btn-ico btn-ico--end"><Icon name="arrow" size={14} /></span>
              </button>
            </>
          }
        />
      ) : (
        <div className="ph-disp">
          {/* ---------- Patient & checks ---------- */}
          <aside className="card ph-card ph-patient">
            <div className="ph-patient-top">
              <Avatar name={rx.patient.name} type={rx.type} />
              <span>
                <strong>{rx.patient.name}</strong>
                <span>{rx.patient.mrn}</span>
              </span>
            </div>
            <EncounterBadge encounter={rx.patient.encounter} />
            <dl className="ph-facts">
              {rx.patient.age && <div><dt>Age / sex</dt><dd>{rx.patient.age} {rx.patient.sex}</dd></div>}
              {rx.patient.ipNo && <div><dt>IP no.</dt><dd className="mono">{rx.patient.ipNo}</dd></div>}
              <div><dt>Location</dt><dd>{placeOf(rx.patient)}</dd></div>
            </dl>
            {rx.patient.nurse && <NurseLine nurse={rx.patient.nurse} encounter={rx.patient.encounter} />}
            {rx.patient.allergies.length > 0 ? (
              <div className="ph-allergy"><Icon name="alert" size={14} /> {rx.patient.allergies.join(', ')}</div>
            ) : (
              <div className="ph-allergy ph-allergy--none"><Icon name="checkCircle" size={14} /> No known allergies</div>
            )}

            {/* Past history stands out: it is what the prescriber may have missed. */}
            {history.conditions.length ? (
              <div className={`ph-hist-box ${mustRevise ? 'is-stop' : ''}`} role="note" aria-label="Past history">
                <h3 className="ph-hist-title"><Icon name="alert" size={15} />Past history</h3>
                <ul className="ph-hist">
                  {history.conditions.map((c) => {
                    const involved = findings.some((f) => f.blocking && f.rule.condition === c.code);
                    return (
                      <li key={c.code} className={involved ? 'is-involved' : ''}>
                        <strong>{c.name}</strong>
                        <span>{c.from}</span>
                        {involved && <em className="ph-hist-flag"><Icon name="ban" size={11} />Check with prescriber</em>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <>
                <h3 className="ph-sub">Past history</h3>
                <p className="ph-muted">No conditions on record.</p>
              </>
            )}
            {rx.diagnosis && <p className="ph-hist-dx"><em>Prescription reason</em>{rx.diagnosis}</p>}

            <h3 className="ph-sub">Safety checks</h3>
            <ul className="ph-checks">
              {checks.map((c) => (
                <li key={c.label} className={`ph-check ph-check--${c.state}`}>
                  <Icon name={c.state === 'ok' ? 'checkCircle' : c.state === 'warn' ? 'alert' : 'ban'} size={15} />
                  <span>
                    <strong>{c.label}</strong>
                    {c.note && <span>{c.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </aside>

          {/* ---------- Medicines & batches ---------- */}
          <section className="card ph-card ph-meds">
            <ClinicalReview store={store} rx={rx} findings={findings} />
            <h3 className="ph-sub">Medicines</h3>
            <ul className="ph-med-list">
              {rx.lines.map((l) => {
                const p = productById(l.productId);
                const isBlocked = blocked.has(l.productId);
                const got = allocated(l.productId);
                const isOpen = open === l.productId;
                // Used-up batches are left off the pick list; they are not options.
                const counterBatches = store.batches
                  .filter((x) => x.productId === p.id && x.location === DISPENSE_FROM && x.qty > 0)
                  .sort((a, z) => a.expiry.getTime() - z.expiry.getTime());
                const storeQty = store.batches
                  .filter((x) => x.productId === p.id && x.location !== DISPENSE_FROM && !x.quarantined)
                  .reduce((n, x) => n + x.qty, 0);
                const fefoOrder = counterBatches.filter(dispensable).map((x) => x.id);
                const isAuto = JSON.stringify(picks[p.id] ?? []) === JSON.stringify(auto[p.id] ?? []);
                const warn = warnings.some((w) => w.a === p.cls || w.b === p.cls);
                const state = isBlocked ? 'stop' : got < l.qty ? 'short' : 'ok';
                const dose = doseOf(p.id);
                const over = dose?.level === 'over';
                const mono = monographOf(p.id);

                return (
                  <li key={l.productId} className={`ph-med ph-med--${state} ${isOpen ? 'is-open' : ''}`}>
                    <button className="ph-med-head" onClick={() => setOpen(isOpen ? null : l.productId)} aria-expanded={isOpen} disabled={isBlocked}>
                      <span className="ph-med-icon"><Icon name={p.route === 'Oral' ? 'pill' : 'droplet'} size={16} /></span>
                      <span className="ph-med-name">
                        <strong>{productName(p)} {p.form}</strong>
                        <span>{l.dose} · {l.frequency} · {l.duration}{asNeededCap(l) ? ` · ${asNeededCap(l)}` : ''}</span>
                      </span>
                      <span className="ph-med-flags">
                        {p.schedule === 'H1' && <span className="ph-flag ph-flag--h1" title="Schedule H1: record in the H1 register">H1</span>}
                        {p.cold && <span className="ph-flag" title="Cold chain: 2–8 °C"><Icon name="snow" size={12} /></span>}
                        {warn && <span className="ph-flag ph-flag--warn" title="Interaction"><Icon name="alert" size={12} /></span>}
                        {over && <span className={`ph-flag ${confirmedDose.has(p.id) ? '' : 'ph-flag--h1'}`} title={dose?.text}>Dose</span>}
                      </span>
                      <span className="ph-med-qty">
                        {isBlocked ? (
                          <span className="ph-qty-state ph-qty-state--stop"><Icon name="ban" size={12} /> Not safe · allergy</span>
                        ) : (
                          <>
                            <span className="ph-ring" style={{ '--p': `${Math.min(100, (got / l.qty) * 100)}` } as React.CSSProperties}>
                              <span>{got}</span>
                            </span>
                            <span className="ph-qty-of">of {l.qty}</span>
                          </>
                        )}
                      </span>
                      {!isBlocked && <span className="ph-chev"><Icon name="chevron" size={15} /></span>}
                    </button>

                    {over && (
                      <div className={`ph-dose-over ${confirmedDose.has(p.id) ? 'is-done' : ''}`} role={confirmedDose.has(p.id) ? undefined : 'alert'}>
                        <Icon name={confirmedDose.has(p.id) ? 'checkCircle' : 'ban'} size={14} />
                        <span>
                          <strong>{confirmedDose.has(p.id) ? 'Dose confirmed by the prescriber' : 'Above the formulary dose'}</strong>
                          {dose?.text}. {mono && <>Usual: {mono.dose}</>}
                        </span>
                        {!confirmedDose.has(p.id) && (
                          <span className="ph-dose-actions">
                            <button className="btn btn-secondary ph-small-btn" onClick={() => store.hold(rx.id, `Dose query: ${p.generic} ${l.dose} ${l.frequency}, above the formulary maximum`)}>
                              <span className="btn-ico"><Icon name="pause" size={13} /></span>Hold: query dose
                            </button>
                            <button className="btn btn-primary ph-small-btn" onClick={() => store.confirmDose(rx.id, p.id, rx.doctor)}>
                              <span className="btn-ico"><Icon name="phone" size={13} /></span>Confirmed with {rx.doctor}
                            </button>
                          </span>
                        )}
                      </div>
                    )}

                    {isOpen && !isBlocked && (
                      <div className="ph-batches step-enter">
                        {mono && (
                          <p className="ph-fm-inline">
                            <Icon name="book" size={12} />
                            <span><strong>Formulary</strong> {mono.dose} <em>{mono.storage}</em></span>
                          </p>
                        )}
                        <div className="ph-batches-head">
                          <span className={`ph-fefo ${isAuto ? '' : 'is-manual'}`}>
                            <Icon name={isAuto ? 'checkCircle' : 'edit'} size={12} /> {isAuto ? 'Earliest expiry first' : 'Changed by you'}
                          </span>
                          {!isAuto && (
                            <button className="btn-text" onClick={() => setPicks((c) => ({ ...c, [p.id]: auto[p.id] }))}>Use earliest expiry</button>
                          )}
                        </div>
                        <div className="ph-table-wrap">
                        <table className="ph-table ph-batch-table">
                          <thead>
                            <tr><th>#</th><th>Batch</th><th>Expiry</th><th className="num">Available</th><th className="num">Pick</th></tr>
                          </thead>
                          <tbody>
                            {counterBatches.map((bt) => {
                              const ok = dispensable(bt);
                              const pick = picks[p.id]?.find((x) => x.batchId === bt.id)?.qty ?? 0;
                              return (
                                <tr key={bt.id} className={`${ok ? '' : 'is-off'} ${pick ? 'is-picked' : ''}`}>
                                  <td data-label="#">{ok ? <span className="ph-order">{fefoOrder.indexOf(bt.id) + 1}</span> : <Icon name="ban" size={13} />}</td>
                                  <td data-label="Batch" className="mono">{bt.batchNo}</td>
                                  <td data-label="Expiry"><Expiry batch={bt} /></td>
                                  <td data-label="Available" className="num">{bt.qty}</td>
                                  <td data-label="Pick" className="num">
                                    {ok ? (
                                      <input
                                        disabled={atBilling}
                                        className="ph-pick"
                                        type="number"
                                        min={0}
                                        max={bt.qty}
                                        value={pick}
                                        onChange={(e) => setPick(p.id, bt.id, Number(e.target.value), bt.qty, l.qty)}
                                        aria-label={`Pick from ${bt.batchNo}`}
                                      />
                                    ) : (
                                      <span className="ph-off-why">{bt.quarantined ? 'Removed' : 'Expired'}</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        </div>
                        {got < l.qty && (
                          <p className="ph-short">
                            <Icon name="alert" size={13} /> Only {got} in stock. Giving {got} now, {l.qty - got} later.
                            {storeQty > 0 && <> {storeQty} in Main Store.</>}
                          </p>
                        )}
                      </div>
                    )}
                    {isBlocked && (
                      <p className="ph-short ph-short--stop">
                        <Icon name="ban" size={13} />{' '}
                        {stopped.has(l.productId)
                          ? 'Stopped by the prescriber in the revised prescription. Not dispensed.'
                          : `${rx.patient.allergies.join(', ')} allergy. Not dispensed; hold for the prescriber.`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ---------- Bill & dispense ---------- */}
          <aside className="card ph-card ph-bill-card">
            <h3 className="ph-sub">Bill</h3>
            <ul className="ph-bill-lines">
              {billLines.map((x) => (
                <li key={x.p.id}>
                  <span>{x.p.generic} <em>× {x.qty}</em></span>
                  <span>{inr(x.amount)}</span>
                </li>
              ))}
            </ul>
            <dl className="ph-totals">
              <div><dt>GST included</dt><dd>{inr(gst)}</dd></div>
              <div className="ph-net"><dt>Net</dt><dd>{inr(total)}</dd></div>
            </dl>

            {account ? (
              <p className="ph-ipbill">
                <Icon name="hospital" size={14} />
                <span>
                  Charged to <strong className="mono">{accountOf(rx.patient)}</strong>
                  {rx.patient.nurse && <span>Issue to {rx.patient.nurse.name}</span>}
                </span>
              </p>
            ) : (
              <p className="ph-ipbill ph-ipbill--counter">
                <Icon name="receipt" size={14} />
                <span>Patient pays at the billing counter</span>
              </p>
            )}

            {!atBilling && <label className={`ph-verify ${verified && !waitingFor ? 'is-on' : ''}`}>
              <input type="checkbox" checked={verified && !waitingFor} onChange={(e) => setVerified(e.target.checked)} disabled={!!waitingFor} />
              <span className="ph-verify-box">{verified && !waitingFor && <Icon name="checkCircle" size={14} />}</span>
              <span>
                <strong>Checked</strong>
                <span>{waitingFor || `${warnings.length ? 'Interaction checked · ' : ''}${rx.patient.mrn}`}</span>
              </span>
            </label>}

            {account ? (
              <button className="btn btn-primary ph-block" disabled={!canDispense} onClick={give}>
                Dispense · add to hospital bill
              </button>
            ) : atBilling ? (
              <div className="ph-at-billing" role="status">
                <span className="ph-at-billing-head"><span className="ph-at-billing-dot" aria-hidden="true" />Waiting for payment</span>
                <strong>{inr(rx.billing!.amount)}</strong>
                <button className="btn btn-primary ph-block ph-btn-give" onClick={give} disabled={billLines.length === 0}>
                  <span className="btn-ico"><Icon name="checkCircle" size={14} /></span>Paid · give medicines
                </button>
                <button className="btn-text" onClick={() => store.cancelBilling(rx.id)}>Change</button>
              </div>
            ) : (
              <button className="btn btn-primary ph-block" disabled={!canDispense} onClick={() => store.sendToBilling(rx.id, picks, total)}>
                <span className="btn-ico"><Icon name="receipt" size={14} /></span>Send to billing · {inr(total)}
              </button>
            )}
            {short && billLines.length > 0 && <p className="ph-muted ph-partial-note">Some items are short. The rest is given later.</p>}

            {atBilling ? null : holding ? (
              <div className="ph-hold step-enter">
                {HOLD_REASONS.map((r) => (
                  <button key={r} className="ph-hold-reason" onClick={() => store.hold(rx.id, r)}>
                    <Icon name="pause" size={13} /> {r}
                  </button>
                ))}
                <button className="btn-text" onClick={() => setHolding(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-secondary ph-block ph-hold-btn" onClick={() => setHolding(true)}>
                <span className="btn-ico"><Icon name="pause" size={14} /></span>Hold
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * What to tell the patient (or the ward nurse) about each medicine handed over,
 * from the formulary: how to take it, the as-needed daily limit, and storage.
 */
function Counselling({ rx, picks }: { rx: Prescription; picks: Picks }) {
  const given = rx.lines.filter((l) => (picks[l.productId] ?? []).some((p) => p.qty > 0));
  const items = given.map((l) => ({ l, m: monographOf(l.productId) })).filter((x) => x.m);
  if (!items.length) return null;
  const nurse = rx.patient.nurse;
  return (
    <section className="ph-counsel" aria-label="Counselling">
      <h3><Icon name="book" size={15} />{nurse ? `Hand-over to ${nurse.name}` : 'Tell the patient'}</h3>
      <ul>
        {items.map(({ l, m }) => {
          const cap = asNeededCap(l);
          return (
            <li key={l.productId}>
              <strong>{productName(productById(l.productId))}</strong>
              <span className="ph-counsel-how">{l.dose} · {l.frequency}{l.duration && l.duration !== '—' ? ` · ${l.duration}` : ''}{cap ? ` · ${cap}` : ''}</span>
              <span>{m!.counsel}</span>
              <em><Icon name={productById(l.productId).cold ? 'snow' : 'layers'} size={11} />Store: {m!.storage}</em>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
