import { useMemo, useState } from 'react';
import { Icon } from './design/Icon';
import {
  COUNTER_PAYMENTS,
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
  type Payment,
  type Prescription,
} from './data';
import { byUrgency } from './Dashboard';
import { Avatar, EncounterBadge, Expiry, NurseLine, Stat, TypeBadge } from './parts';
import { TransactionReceipt } from './Receipt';
import { PayPanel } from './Pay';
import type { Picks, Store } from './store';

type Check = { label: string; state: 'ok' | 'warn' | 'stop'; note?: string };

const HOLD_REASONS = ['Query to prescriber', 'Awaiting stock', 'Patient not present'];
const STEPS = ['Review', 'Pick', 'Pay', 'Receipt'];
const PAY_ICON = { UPI: 'phone', Card: 'card', Credit: 'wallet' } as const;

export function Dispense({ store, rx }: { store: Store; rx: Prescription }) {
  // Inpatients (including discharge) and emergency patients are billed to their account.
  const account = onAccount(rx.patient);

  // Contraindicated lines are never allocated; everything else starts on FEFO.
  const blocked = useMemo(
    () => new Set(rx.lines.filter((l) => allergyConflict(rx.patient, productById(l.productId))).map((l) => l.productId)),
    [rx]
  );
  // The FEFO split is taken once, when the prescription opens (the parent keys
  // this screen by prescription, so a different one gets a fresh split).
  const [auto] = useState<Picks>(() => {
    const p: Picks = {};
    for (const l of rx.lines) p[l.productId] = blocked.has(l.productId) ? [] : fefo(store.batches, l.productId, l.qty);
    return p;
  });

  const [picks, setPicks] = useState<Picks>(auto);
  const [open, setOpen] = useState<string | null>(rx.lines[0]?.productId ?? null);
  const [payment, setPayment] = useState<Payment>(account ? 'Account' : 'UPI');
  const [verified, setVerified] = useState(false);
  const [holding, setHolding] = useState(false);
  /** Waiting on the patient: QR shown for UPI, card machine for a card. */
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<{ bill: Bill; short: boolean; picks: Picks } | null>(null);

  const allocated = (pid: string) => (picks[pid] ?? []).reduce((n, p) => n + p.qty, 0);
  const shortLines = rx.lines.filter((l) => !blocked.has(l.productId) && allocated(l.productId) < l.qty);
  const short = shortLines.length > 0 || blocked.size > 0;
  const warnings = interactions(rx.lines.filter((l) => !blocked.has(l.productId)));
  const dupes = rx.lines.length !== new Set(rx.lines.map((l) => l.productId)).size;

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
    { label: 'Same medicine twice', state: dupes ? 'warn' : 'ok', note: dupes ? 'Listed more than once' : 'No' },
    shortLines.length
      ? { label: 'Stock', state: 'warn', note: `Short on ${shortLines.map((l) => productById(l.productId).generic).join(', ')}` }
      : { label: 'Stock', state: 'ok', note: 'All lines allocated' },
  ];

  const step = done ? STEPS.length : !verified ? 0 : billLines.length ? 2 : 1;
  const canDispense = verified && billLines.length > 0;

  function setPick(pid: string, batchId: string, qty: number, cap: number, need: number) {
    setPicks((cur) => {
      const others = (cur[pid] ?? []).filter((p) => p.batchId !== batchId);
      const othersQty = others.reduce((n, p) => n + p.qty, 0);
      const q = Math.max(0, Math.min(Math.floor(qty) || 0, cap, need - othersQty));
      return { ...cur, [pid]: q ? [...others, { batchId, qty: q }] : others };
    });
  }

  function doDispense() {
    setPaying(false);
    setDone({ bill: store.dispense(rx.id, picks, short, payment), short, picks });
  }

  /** UPI and card are collected first; credit and hospital accounts dispense at once. */
  const collects = !account && (payment === 'UPI' || payment === 'Card');
  const actionLabel = account
    ? 'Dispense · add to hospital bill'
    : payment === 'Credit'
      ? 'Dispense on credit'
      : `${payment === 'UPI' ? 'Scan to pay' : 'Card payment'} · ${inr(total)}`;

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
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''}>
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
            done.short && (
              <ul className="ph-backorder">
                {rx.lines.map((l) => {
                  const got = (done.picks[l.productId] ?? []).reduce((n, p) => n + p.qty, 0);
                  if (got >= l.qty) return null;
                  return (
                    <li key={l.productId}>
                      <Icon name={blocked.has(l.productId) ? 'ban' : 'clock'} size={13} />
                      {productName(productById(l.productId))}: {blocked.has(l.productId) ? 'not given (allergy)' : `${l.qty - got} to give later`}
                    </li>
                  );
                })}
              </ul>
            )
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

                return (
                  <li key={l.productId} className={`ph-med ph-med--${state} ${isOpen ? 'is-open' : ''}`}>
                    <button className="ph-med-head" onClick={() => setOpen(isOpen ? null : l.productId)} aria-expanded={isOpen} disabled={isBlocked}>
                      <span className="ph-med-icon"><Icon name={p.route === 'Oral' ? 'pill' : 'droplet'} size={16} /></span>
                      <span className="ph-med-name">
                        <strong>{productName(p)} {p.form}</strong>
                        <span>{l.dose} · {l.frequency} · {l.duration}</span>
                      </span>
                      <span className="ph-med-flags">
                        {p.schedule === 'H1' && <span className="ph-flag ph-flag--h1" title="Schedule H1: record in the H1 register">H1</span>}
                        {p.cold && <span className="ph-flag" title="Cold chain: 2–8 °C"><Icon name="snow" size={12} /></span>}
                        {warn && <span className="ph-flag ph-flag--warn" title="Interaction"><Icon name="alert" size={12} /></span>}
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

                    {isOpen && !isBlocked && (
                      <div className="ph-batches step-enter">
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
                                  <td>{ok ? <span className="ph-order">{fefoOrder.indexOf(bt.id) + 1}</span> : <Icon name="ban" size={13} />}</td>
                                  <td className="mono">{bt.batchNo}</td>
                                  <td><Expiry batch={bt} /></td>
                                  <td className="num">{bt.qty}</td>
                                  <td className="num">
                                    {ok ? (
                                      <input
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
                        <Icon name="ban" size={13} /> {rx.patient.allergies.join(', ')} allergy. Not dispensed; hold for the prescriber.
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

            <h3 className="ph-sub">Payment</h3>
            {account ? (
              <p className="ph-ipbill">
                <Icon name="hospital" size={14} />
                <span>
                  Charged to <strong className="mono">{accountOf(rx.patient)}</strong>
                  {rx.patient.nurse && <span>Issue to {rx.patient.nurse.name}</span>}
                </span>
              </p>
            ) : (
              !paying && <>
                <div className="ph-seg ph-pay" role="radiogroup" aria-label="Payment mode">
                  {COUNTER_PAYMENTS.map((m) => (
                    <button key={m} role="radio" aria-checked={payment === m} className={payment === m ? 'is-on' : ''} onClick={() => setPayment(m)}>
                      <Icon name={PAY_ICON[m]} size={14} />
                      {m}
                    </button>
                  ))}
                </div>
                <p className="ph-muted ph-pay-note">Digital payments only. Cash is not accepted.</p>
              </>
            )}

            {!paying && <label className={`ph-verify ${verified ? 'is-on' : ''}`}>
              <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
              <span className="ph-verify-box">{verified && <Icon name="checkCircle" size={14} />}</span>
              <span>
                <strong>Checked</strong>
                <span>{warnings.length ? 'Interaction checked · ' : ''}{rx.patient.mrn}</span>
              </span>
            </label>}

            {paying ? (
              <PayPanel
                method={payment as 'UPI' | 'Card'}
                amount={total}
                reference={rx.id}
                onPaid={doDispense}
                onCancel={() => setPaying(false)}
              />
            ) : (
              <button className="btn btn-primary ph-block" disabled={!canDispense} onClick={collects ? () => setPaying(true) : doDispense}>
                {actionLabel}
              </button>
            )}
            {short && billLines.length > 0 && !paying && <p className="ph-muted ph-partial-note">Some items are short. The rest is given later.</p>}

            {paying ? null : holding ? (
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
