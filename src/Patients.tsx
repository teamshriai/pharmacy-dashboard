import { useState } from 'react';
import { Icon } from './design/Icon';
import { hhmm, inr, placeOf, type Encounter } from './data';
import { Avatar, Empty, EncounterBadge } from './parts';
import type { Store } from './store';

const ENCOUNTERS: (Encounter | 'All')[] = ['All', 'Outpatient', 'Inpatient', 'Emergency'];
const TYPE_FOR: Record<Encounter, 'OP' | 'IP' | 'Emergency'> = { Outpatient: 'OP', Inpatient: 'IP', Emergency: 'Emergency' };

/** Everyone the pharmacy has served or is serving today. A row opens their open prescription, or else their bill. */
export function Patients({ store }: { store: Store }) {
  const [enc, setEnc] = useState<Encounter | 'All'>('All');
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const rows = store.patients
    .map((p) => {
      const rxs = store.rxs.filter((r) => r.patient.mrn === p.mrn);
      const open = store.pending.filter((r) => r.patient.mrn === p.mrn);
      const bills = store.bills.filter((b) => b.patient.mrn === p.mrn);
      const times = [...rxs.map((r) => r.time), ...bills.map((b) => b.at)].map((d) => d.getTime());
      return { p, open, bills, rxCount: rxs.length, billed: bills.reduce((n, b) => n + b.total, 0), last: new Date(Math.max(...times)) };
    })
    .sort((a, z) => z.last.getTime() - a.last.getTime());

  const shown = rows.filter((r) => (enc === 'All' || r.p.encounter === enc) && (!term || `${r.p.name} ${r.p.mrn} ${r.p.ipNo ?? ''}`.toLowerCase().includes(term)));

  function open(r: (typeof rows)[number]) {
    if (r.open[0]) store.openRx(r.open[0].id);
    else if (r.bills[0]) store.openBill(r.bills[0].no);
  }

  return (
    <section className="card ph-card step-enter">
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
              <span className="ph-chip-count">{rows.filter((r) => e === 'All' || r.p.encounter === e).length}</span>
            </button>
          ))}
        </div>
        <label className="ph-find">
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, MRN or IP no." aria-label="Find a patient" />
        </label>
      </div>

      {shown.length === 0 ? (
        <Empty icon="users" text="No patients match." />
      ) : (
        <div className="ph-table-wrap">
          <table className="ph-table ph-people-table">
            <thead>
              <tr><th>Patient</th><th>Type</th><th>Location</th><th className="num">Prescriptions</th><th className="num">Billed</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.p.mrn} className="is-link" onClick={() => open(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(r)}>
                  <td>
                    <span className="ph-patient-cell">
                      <Avatar name={r.p.name} type={TYPE_FOR[r.p.encounter]} />
                      <span>
                        <strong>{r.p.name}</strong>
                        <span className="mono">{r.p.mrn}{r.p.age ? ` · ${r.p.age} ${r.p.sex ?? ''}` : ''}</span>
                      </span>
                    </span>
                  </td>
                  <td><EncounterBadge encounter={r.p.encounter} /></td>
                  <td>{placeOf(r.p)}</td>
                  <td className="num">
                    {r.rxCount}
                    {r.open.length > 0 && <span className="ph-people-open">{r.open.length} open</span>}
                  </td>
                  <td className="num">{r.billed ? <strong>{inr(r.billed)}</strong> : <span className="ph-muted">—</span>}</td>
                  <td className="ph-time">{hhmm(r.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
