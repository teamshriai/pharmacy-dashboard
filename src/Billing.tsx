import { useEffect, useState } from 'react';
import { Icon } from './design/Icon';
import { hhmm, inr, type Encounter } from './data';
import { downloadBill } from './billPdf';
import { TransactionReceipt } from './Receipt';
import { Avatar, Empty } from './parts';
import type { Store } from './store';

const ENCOUNTERS: (Encounter | 'All')[] = ['All', 'Outpatient', 'Inpatient', 'Emergency'];
const TYPE_FOR: Record<Encounter, 'OP' | 'IP' | 'Emergency'> = { Outpatient: 'OP', Inpatient: 'IP', Emergency: 'Emergency' };

/** Every bill and its payment, in one place: the list, and the selected receipt. */
export function Billing({ store }: { store: Store }) {
  const [enc, setEnc] = useState<Encounter | 'All'>('All');
  const rows = store.bills.filter((b) => enc === 'All' || b.patient.encounter === enc);
  const selected = store.bills.find((b) => b.no === store.focusBill) ?? rows[0];

  useEffect(() => {
    if (store.focusBill) document.getElementById('bill-' + store.focusBill)?.scrollIntoView({ block: 'nearest' });
  }, [store.focusBill]);

  const sum = (paid: boolean) => store.bills.filter((b) => (b.status === 'Paid') === paid).reduce((n, b) => n + b.total, 0);
  const stats = [
    { icon: 'checkCircle' as const, tone: 'green', value: inr(sum(true)), label: 'Paid' },
    { icon: 'hospital' as const, tone: 'teal', value: inr(sum(false)), label: 'Hospital bill' },
    { icon: 'receipt' as const, tone: 'sky', value: String(store.bills.length), label: 'Bills' },
  ];

  return (
    <div className="ph-stack step-enter">
      <div className="ph-kpis ph-kpis--3">
        {stats.map((s) => (
          <div key={s.label} className={`ph-kpi ph-kpi--static tone-${s.tone}`}>
            <span className="ph-kpi-icon"><Icon name={s.icon} size={18} /></span>
            <span className="ph-kpi-value ph-kpi-value--money">{s.value}</span>
            <span className="ph-kpi-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="ph-billing">
        <section className="card ph-card">
          <div className="ph-queue-bar">
            <div className="ph-chips" role="tablist" aria-label="Patient type">
              {ENCOUNTERS.map((e) => (
                <button
                  key={e}
                  role="tab"
                  aria-selected={enc === e}
                  className={`ph-chip ${enc === e ? 'ph-chip--on' : ''} ${e !== 'All' ? `ph-chip--${TYPE_FOR[e].toLowerCase()}` : ''}`}
                  onClick={() => setEnc(e)}
                >
                  {e}
                  <span className="ph-chip-count">{store.bills.filter((b) => e === 'All' || b.patient.encounter === e).length}</span>
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <Empty icon="receipt" text="No bills yet." />
          ) : (
            <div className="ph-table-wrap">
              <table className="ph-table ph-bill-table">
                <thead>
                  <tr><th>Bill</th><th>Patient</th><th>Paid by</th><th className="num">Amount</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr
                      key={b.no}
                      id={'bill-' + b.no}
                      className={`is-link ${selected?.no === b.no ? 'is-open' : ''}`}
                      onClick={() => store.setFocusBill(b.no)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && store.setFocusBill(b.no)}
                    >
                      <td data-label="Bill">
                        <span className="ph-bill-no">
                          <strong className="mono">{b.txnId}</strong>
                          <span>{hhmm(b.at)} · {b.no}</span>
                        </span>
                      </td>
                      <td data-label="Patient">
                        <span className="ph-patient-cell">
                          <Avatar name={b.patient.name} type={TYPE_FOR[b.patient.encounter]} />
                          <span>
                            <strong>{b.patient.name}</strong>
                            <span>{b.patient.encounter}{b.patient.ipNo ? ` · ${b.patient.ipNo}` : ''}</span>
                          </span>
                        </span>
                      </td>
                      <td data-label="Paid by">
                        <span className={`ph-status ${b.status === 'Paid' ? 'ph-status--ok' : 'ph-status--info'}`}>
                          <Icon name={b.status === 'Paid' ? 'checkCircle' : 'hospital'} size={12} />
                          {b.status === 'Paid' ? b.payment : 'Account'}
                        </span>
                      </td>
                      <td data-label="Amount" className="num"><strong>{inr(b.total)}</strong></td>
                      <td data-label="" className="ph-cell-act">
                        <button
                          className="ph-icon-btn"
                          onClick={(e) => { e.stopPropagation(); downloadBill(b); }}
                          aria-label={`Download bill ${b.no}`}
                          title="Download bill (PDF)"
                        >
                          <Icon name="download" size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && <TransactionReceipt key={selected.no} bill={selected} />}
      </div>
    </div>
  );
}

