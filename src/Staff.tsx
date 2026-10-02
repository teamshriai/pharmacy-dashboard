import { useState } from 'react';
import { Icon } from './design/Icon';
import { STAFF, USER, hhmm, onShift } from './data';
import { Empty } from './parts';
import type { Store } from './store';

const hours = (s: [number, number]) => s.map((h) => `${String(h).padStart(2, '0')}:00`).join('–');
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Pharmacy staff, who is on shift now, and what each person has done today (from the activity log). */
export function Staff({ store }: { store: Store }) {
  const [pick, setPick] = useState(USER.name);
  const person = STAFF.find((s) => s.name === pick)!;
  const actions = (name: string) => store.audit.filter((a) => a.user === name);
  const log = actions(person.name);

  return (
    <div className="ph-billing ph-staff step-enter">
      <section className="card ph-card">
        <div className="ph-table-wrap">
          <table className="ph-table ph-people-table">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Shift</th><th>Now</th><th className="num">Actions today</th></tr>
            </thead>
            <tbody>
              {STAFF.map((s) => {
                const on = onShift(s);
                return (
                  <tr key={s.id} className={`is-link ${pick === s.name ? 'is-open' : ''}`} onClick={() => setPick(s.name)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPick(s.name)}>
                    <td>
                      <span className="ph-patient-cell">
                        <span className="ph-avatar ph-avatar--staff">{initials(s.fullName)}</span>
                        <span>
                          <strong>{s.fullName}{s.name === USER.name && <em className="ph-you">You</em>}</strong>
                          <span className="mono">{s.id} · ext {s.ext}</span>
                        </span>
                      </span>
                    </td>
                    <td>{s.role}</td>
                    <td className="ph-time">{hours(s.shift)}</td>
                    <td>
                      <span className={`ph-status ${on ? 'ph-status--ok' : 'ph-status--neutral'}`}>
                        <Icon name={on ? 'checkCircle' : 'clock'} size={12} />
                        {on ? 'On shift' : 'Off shift'}
                      </span>
                    </td>
                    <td className="num"><strong>{actions(s.name).length}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card ph-card ph-activity" aria-label={`${person.fullName}: activity today`}>
        <header className="ph-panel-head ph-panel-head--flush">
          <span>
            <h2>{person.fullName}</h2>
            <p>{person.role} · activity today</p>
          </span>
        </header>
        {log.length === 0 ? (
          <Empty icon="clock" text="No actions recorded today." />
        ) : (
          <ol className="ph-activity-list">
            {log.map((a) => (
              <li key={a.id}>
                <span className="ph-time">{hhmm(a.at)}</span>
                <span>
                  <strong>{a.action}</strong>
                  <span>{a.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
