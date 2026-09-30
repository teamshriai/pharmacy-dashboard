import { useState } from 'react';
import { Icon } from './design/Icon';
import { RX_TYPES, hhmm, placeOf, type RxType } from './data';
import { byUrgency } from './Dashboard';
import { Avatar, Empty, NurseLine, Stat, Status, TYPE_ICON, TypeBadge } from './parts';
import type { Store } from './store';

export function Queue({ store, type, setType }: { store: Store; type: RxType | 'All'; setType: (t: RxType | 'All') => void }) {
  const [view, setView] = useState<'pending' | 'done'>('pending');
  const source = view === 'pending' ? store.pending : store.rxs.filter((r) => r.status === 'Dispensed' || r.status === 'Partial');
  const rows = source.filter((r) => type === 'All' || r.type === type).sort(byUrgency);
  const count = (t: RxType | 'All') => source.filter((r) => t === 'All' || r.type === t).length;

  return (
    <section className="card ph-card step-enter">
      {store.flash && (
        <div className="ph-posted ph-posted--inline" role="status">
          <Icon name="checkCircle" size={16} />
          <span><strong>{store.flash}</strong>Pharmacist verification happens at dispensing.</span>
          <button className="ph-x" onClick={() => store.setFlash('')} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      )}
      <div className="ph-queue-bar">
        <div className="ph-queue-left">
        <button className="btn btn-primary ph-small-btn" onClick={store.startEntry}>
          <span className="btn-ico"><Icon name="plus" size={14} /></span>New prescription
        </button>
        <div className="ph-seg" role="tablist" aria-label="Queue">
          {(['pending', 'done'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
              {v === 'pending' ? 'Waiting' : 'Done'}
            </button>
          ))}
        </div>
        </div>

        <div className="ph-chips" role="tablist" aria-label="Prescription type">
          {(['All', ...RX_TYPES] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              className={`ph-chip ${type === t ? 'ph-chip--on' : ''} ${t !== 'All' ? `ph-chip--${t.toLowerCase()}` : ''}`}
              onClick={() => setType(t)}
            >
              {t !== 'All' && <Icon name={TYPE_ICON[t]} size={13} />}
              {t}
              <span className="ph-chip-count">{count(t)}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon={view === 'pending' ? 'checkCircle' : 'clipboard'} text={view === 'pending' ? 'Nothing pending.' : 'Nothing completed yet.'} />
      ) : (
        <div className="ph-table-wrap">
          <table className="ph-table ph-queue-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Patient</th>
                <th>Type</th>
                <th>Prescriber</th>
                <th className="num">Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`${view === 'pending' ? 'is-link' : ''} ${r.stat ? 'is-stat' : ''}`}
                  onClick={view === 'pending' ? () => store.openRx(r.id) : undefined}
                  tabIndex={view === 'pending' ? 0 : undefined}
                  onKeyDown={(e) => view === 'pending' && e.key === 'Enter' && store.openRx(r.id)}
                >
                  <td className="ph-time">{hhmm(r.time)}</td>
                  <td>
                    <span className="ph-patient-cell">
                      <Avatar name={r.patient.name} type={r.type} />
                      <span>
                        <strong>{r.patient.name}</strong>
                        <span>
                          {r.patient.mrn} ·{' '}
                          {r.patient.encounter === 'Outpatient' ? 'Outpatient' : `${r.patient.ipNo ? r.patient.ipNo + ' · ' : ''}${placeOf(r.patient)}`}
                        </span>
                        {r.patient.nurse && <NurseLine nurse={r.patient.nurse} compact />}
                      </span>
                    </span>
                  </td>
                  <td><span className="ph-rx-tags">{r.stat && <Stat />}<TypeBadge type={r.type} /></span></td>
                  <td>{r.doctor}</td>
                  <td className="num">{r.lines.length}</td>
                  <td>
                    <Status status={r.status} />
                    {r.note && <span className="ph-note">{r.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
