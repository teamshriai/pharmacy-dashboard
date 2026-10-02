import { Icon } from './design/Icon';
import { DISPENSE_FROM, USER, duration } from './data';
import type { Store } from './store';

const STAT_CHOICES = [15, 20, 30, 45, 60];
const ROUTINE_CHOICES = [60, 90, 120, 180, 240];

/** The few things a pharmacy changes: look, turnaround targets. The rest is shown for reference. */
export function Settings({ store, dark, setDark }: { store: Store; dark: boolean; setDark: (v: boolean) => void }) {
  return (
    <div className="ph-settings step-enter">
      <section className="card ph-card ph-set">
        <h2><Icon name="sun" size={15} />Appearance</h2>
        <div className="ph-set-row">
          <span><strong>Theme</strong><span>Night mode is easier on the eyes on late shifts.</span></span>
          <span className="ph-toggle" role="group" aria-label="Theme">
            <button className={!dark ? 'is-on' : ''} aria-pressed={!dark} onClick={() => setDark(false)}>Day</button>
            <button className={dark ? 'is-on' : ''} aria-pressed={dark} onClick={() => setDark(true)}>Night</button>
          </span>
        </div>
      </section>

      <section className="card ph-card ph-set">
        <h2><Icon name="clock" size={15} />Turnaround targets</h2>
        <div className="ph-set-row">
          <span><strong>STAT</strong><span>An urgent order is late after this long.</span></span>
          <select className="field-input ph-set-select" aria-label="STAT target" value={store.tat.stat} onChange={(e) => store.setTat({ ...store.tat, stat: Number(e.target.value) })}>
            {STAT_CHOICES.map((m) => <option key={m} value={m}>{duration(m)}</option>)}
          </select>
        </div>
        <div className="ph-set-row">
          <span><strong>Routine</strong><span>Any other order is late after this long.</span></span>
          <select className="field-input ph-set-select" aria-label="Routine target" value={store.tat.routine} onChange={(e) => store.setTat({ ...store.tat, routine: Number(e.target.value) })}>
            {ROUTINE_CHOICES.map((m) => <option key={m} value={m}>{duration(m)}</option>)}
          </select>
        </div>
        <p className="ph-set-note">Used for the waiting bars, Longest wait and Needs action.</p>
      </section>

      <section className="card ph-card ph-set">
        <h2><Icon name="hospital" size={15} />Counter</h2>
        <div className="ph-set-row">
          <span><strong>Dispensing from</strong><span>Medicines are picked only from this location.</span></span>
          <span className="ph-set-value">{DISPENSE_FROM}</span>
        </div>
        <div className="ph-set-row">
          <span><strong>Signed in</strong><span>Recorded on every bill and in the activity log.</span></span>
          <span className="ph-set-value">{USER.name} · {USER.role} · {USER.id}</span>
        </div>
      </section>

      <section className="card ph-card ph-set">
        <h2><Icon name="shieldCheck" size={15} />Data</h2>
        <div className="ph-set-row">
          <span>
            <strong>Sample data</strong>
            <span>This console runs on demonstration data. It is not connected to any hospital, UIDAI or ABDM system.</span>
          </span>
          <button className="btn btn-secondary ph-small-btn" onClick={() => { window.location.hash = '#/'; window.location.reload(); }}>
            Reset sample data
          </button>
        </div>
      </section>
    </div>
  );
}
