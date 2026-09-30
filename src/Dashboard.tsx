import { useState } from 'react';
import { Icon } from './design/Icon';
import {
  PRODUCTS,
  duration,
  hhmm,
  inr,
  placeOf,
  productName,
  turnaround,
  type RxStatus,
} from './data';
import { detectAlerts, type Alert } from './alerts';
import { Assistant } from './Assistant';
import { FootprintsChart, ExpiryChart, TodayReport } from './charts';
import { Avatar, Empty, Stat, Status, StockGauge, TypeBadge } from './parts';
import type { Store } from './store';

type IconName = Parameters<typeof Icon>[0]['name'];

/** STAT first, then oldest first. */
export const byUrgency = <T extends { stat: boolean; time: Date }>(a: T, b: T) =>
  Number(b.stat) - Number(a.stat) || a.time.getTime() - b.time.getTime();

const ALERTS_SHOWN = 4;
const LIST_ROWS = 5;

/**
 * Laid out like a hospital pharmacy workstation: a metrics strip in work order,
 * the prescription queue with turnaround against target, exceptions, and inventory
 * watch lists. Each fact appears once.
 */
export function Dashboard({ store }: { store: Store }) {
  const [allAlerts, setAllAlerts] = useState(false);
  const count = (s: RxStatus) => store.pending.filter((r) => r.status === s).length;
  const active = store.pending.filter((r) => r.status !== 'On hold');
  const stat = active.filter((r) => r.stat).length;
  const queue = [...store.pending].sort(byUrgency);
  const longest = active.map(turnaround).sort((a, z) => z.waited - a.waited)[0];
  const collected = store.bills.filter((b) => b.status === 'Paid').reduce((n, b) => n + b.total, 0);
  const alerts = detectAlerts(store);
  const shownAlerts = allAlerts ? alerts : alerts.slice(0, ALERTS_SHOWN);

  const low = PRODUCTS.map((p) => ({ p, qty: store.stockOf(p.id) }))
    .filter((x) => x.qty < x.p.reorder)
    .sort((a, z) => a.qty / a.p.reorder - z.qty / z.p.reorder);

  const flow: { icon: IconName; label: string; value: number; stat?: number; go: () => void }[] = [
    { icon: 'clipboard', label: 'Waiting', value: count('New'), stat: stat || undefined, go: () => store.go('queue') },
    { icon: 'search', label: 'Checking', value: count('Reviewing'), go: () => store.go('queue') },
    { icon: 'pause', label: 'On hold', value: count('On hold'), go: () => store.go('queue') },
    { icon: 'checkCircle', label: 'Done today', value: store.dispensedToday, go: () => store.go('billing') },
  ];

  function act(a: Alert) {
    const x = a.action;
    if (!x) return;
    if (x.kind === 'quarantine') store.quarantine(x.ref, 'Expired');
    else if (x.kind === 'open') store.openRx(x.ref);
    else if (x.kind === 'stock') store.openProduct(x.ref);
    else store.go('receive');
  }

  return (
    <div className="ph-stack step-enter">
      {/* ---------------------------------------------------------- metrics */}
      <section className="card ph-metrics" aria-label="Today">
        <ol className="ph-metrics-flow">
          {flow.map((f) => (
            <li key={f.label}>
              <button className="ph-metric" onClick={f.go}>
                <span className="ph-metric-label"><Icon name={f.icon} size={13} />{f.label}</span>
                <span className="ph-metric-value">
                  {f.value}
                  {f.stat !== undefined && <Stat count={f.stat} />}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="ph-metrics-side">
          <div className="ph-metric">
            <span className="ph-metric-label"><Icon name="clock" size={13} />Longest wait</span>
            <span className={`ph-metric-value ph-tat-text--${longest?.level ?? 'ok'}`}>{longest ? duration(longest.waited) : '—'}</span>
            {longest && <span className="ph-metric-sub">of {duration(longest.target)} target</span>}
          </div>
          <button className="ph-metric" onClick={() => store.go('billing')}>
            <span className="ph-metric-label"><Icon name="receipt" size={13} />Collected today</span>
            <span className="ph-metric-value">{inr(collected)}</span>
          </button>
        </div>
      </section>

      {/* ---------------------------------------------------- work + alerts */}
      <div className="ph-dash">
        <section className="card ph-card ph-panel">
          <header className="ph-panel-head">
            <span>
              <h2>Prescription queue</h2>
              <p>{queue.length} open · STAT first</p>
            </span>
          </header>

          {queue.length === 0 ? (
            <Empty icon="checkCircle" text="Nothing waiting." />
          ) : (
            <div className="ph-table-wrap">
              <table className="ph-table ph-wq">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Patient</th>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((r) => {
                    const t = turnaround(r);
                    return (
                      <tr key={r.id} className="is-link" onClick={() => store.openRx(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && store.openRx(r.id)}>
                        {/* Priority, with the status under it only when it is unusual (checking, on hold). */}
                        <td>
                          <span className="ph-prio">
                            {r.stat ? <Stat /> : <span className="ph-muted">Routine</span>}
                            {r.status !== 'New' && <Status status={r.status} />}
                          </span>
                        </td>
                        <td>
                          <span className="ph-patient-cell">
                            <Avatar name={r.patient.name} type={r.type} />
                            <span>
                              <strong>{r.patient.name}</strong>
                              <span className="mono">{r.patient.mrn}</span>
                            </span>
                          </span>
                        </td>
                        <td>{r.patient.encounter === 'Outpatient' ? 'OPD' : placeOf(r.patient)}</td>
                        <td><TypeBadge type={r.type} /></td>
                        <td>
                          <span className={`ph-tat ph-tat--${t.level}`} title={`In at ${hhmm(r.time)} · target ${duration(t.target)}`}>
                            <span className="ph-tat-text">{duration(t.waited)}</span>
                            <span className="ph-tat-bar"><span style={{ width: `${Math.min(100, (t.waited / t.target) * 100)}%` }} /></span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card ph-card ph-attn" aria-label="Needs attention">
          <div className="ph-attn-head">
            <span className={`ph-attn-icon ${alerts.length ? 'is-on' : ''}`}><Icon name={alerts.length ? 'alert' : 'checkCircle'} size={16} /></span>
            <h2>Needs attention</h2>
            {alerts.length > 0 && <span className="ph-attn-count">{alerts.length}</span>}
          </div>
          {alerts.length === 0 ? (
            <p className="ph-attn-clear">All clear. Nothing needs you right now.</p>
          ) : (
            <>
              <ul className="ph-attn-list">
                {shownAlerts.map((a) => (
                  <li key={a.id} className={`ph-attn-row ph-attn--${a.level}`}>
                    <span className="ph-attn-row-icon"><Icon name={a.icon} size={14} /></span>
                    <span className="ph-attn-text">{a.text}</span>
                    {a.action && <button className="ph-attn-btn" onClick={() => act(a)}>{a.action.label}</button>}
                  </li>
                ))}
              </ul>
              {alerts.length > ALERTS_SHOWN && (
                <button className="btn-text ph-attn-more" onClick={() => setAllAlerts((v) => !v)}>
                  {allAlerts ? 'Show fewer' : `Show all ${alerts.length}`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------------------------------------------------------- charts */}
      <div className="ph-charts">
        <FootprintsChart times={store.dispenseTimes} today={store.dispensedToday} onOpen={() => store.go('billing')} />
        <TodayReport bills={store.bills} onOpen={() => store.go('billing')} />
        <ExpiryChart batches={store.batches} onOpen={(f) => store.go('stock', f)} />
      </div>

      {/* ---------------------------------------------------- inventory watch */}
      <div className="ph-watch">
        <section className="card ph-card ph-panel">
          <header className="ph-panel-head">
            <span><h2>Low stock</h2><p>{low.length} below reorder</p></span>
            <button className="btn-text" onClick={() => store.go('stock', 'low')}>View all</button>
          </header>
          {low.length === 0 ? (
            <Empty icon="checkCircle" text="Everything is above its reorder level." />
          ) : (
            <table className="ph-table ph-watch-table">
              <colgroup><col /><col style={{ width: 92 }} /><col style={{ width: 80 }} /></colgroup>
              <thead><tr><th>Medicine</th><th className="num">On hand</th><th /></tr></thead>
              <tbody>
                {low.slice(0, LIST_ROWS).map(({ p, qty }) => (
                  <tr key={p.id} className="is-link" onClick={() => store.openProduct(p.id)}>
                    <td title={productName(p)}>{productName(p)}</td>
                    <td className="num"><strong>{qty}</strong><span className="ph-muted"> / {p.reorder}</span></td>
                    <td><StockGauge qty={qty} reorder={p.reorder} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>


        <Assistant store={store} />
      </div>
    </div>
  );
}
