/**
 * Clinical review on the Dispense screen: what the knowledge base found for
 * this patient, the evidence from their past history, and the way forward:
 * hold and ask for a revised prescription, or record the revised one.
 */
import { useState } from 'react';
import { Icon } from './design/Icon';
import { DOCTORS, productById, type Prescription } from './data';
import type { Finding } from './clinical';
import type { Store } from './store';

export function ClinicalReview({ store, rx, findings }: { store: Store; rx: Prescription; findings: Finding[] }) {
  const [recording, setRecording] = useState(false);
  const open = findings.filter((f) => f.blocking);
  const notes = findings.filter((f) => !f.blocking && !f.resolved);
  const done = findings.filter((f) => f.resolved);
  if (!findings.length) return null;

  const meds = [...new Set(open.map((f) => productById(f.productId).generic))];
  const holdReason = `Revised prescription needed: ${open.map((f) => f.rule.title.toLowerCase()).join('; ')}`;

  return (
    <section className={`ph-cr ${open.length ? 'is-stop' : 'is-ok'}`} aria-label="Clinical review">
      <header className="ph-cr-head">
        <Icon name={open.length ? 'ban' : 'shieldCheck'} size={18} />
        <span>
          <strong>{open.length ? 'Revised prescription needed' : 'Clinical review'}</strong>
          <em>From the patient's history and the drug knowledge base (sample)</em>
        </span>
      </header>

      {open.map((f) => (
        <div key={f.rule.id + f.productId} className="ph-cr-item">
          <h4>{productById(f.productId).generic}: {f.rule.title.toLowerCase()}</h4>
          <p>{f.rule.why}</p>
          <dl>
            <div><dt>Past history</dt><dd>{f.evidence.join(' · ')}</dd></div>
            <div><dt>Prescription says</dt><dd>{rx.diagnosis ? `“${rx.diagnosis}”, ` : ''}no mention of {f.rule.condition ?? 'this'} · {rx.doctor}</dd></div>
          </dl>
          <p className="ph-cr-ask"><Icon name="clipboard" size={13} /> Ask for: the past history (record or latest reports) and {f.rule.ask.charAt(0).toLowerCase() + f.rule.ask.slice(1)}</p>
        </div>
      ))}

      {notes.map((f) => (
        <div key={f.rule.id + f.productId} className="ph-cr-item is-warn">
          <h4><Icon name="alert" size={13} /> {productById(f.productId).generic}: {f.rule.title.toLowerCase()}{f.mentioned ? ' (prescriber noted it)' : ''}</h4>
          <p>{f.rule.why} {f.rule.ask}</p>
          <p className="ph-cr-ev">{f.evidence.join(' · ')}</p>
        </div>
      ))}

      {done.length > 0 && rx.revision && (
        <div className="ph-cr-done" role="status">
          <Icon name="checkCircle" size={15} />
          <span>
            <strong>Revised prescription recorded</strong>
            {rx.revision.by} · {rx.revision.at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ·{' '}
            {rx.revision.outcome === 'continue' ? 'continue, prescriber aware' : `stopped ${rx.revision.productIds.map((id) => productById(id).generic).join(', ')}`}
            {rx.revision.note && <> · “{rx.revision.note}”</>}
          </span>
        </div>
      )}

      {open.length > 0 && !recording && (
        <div className="ph-cr-actions">
          <button className="btn btn-secondary ph-small-btn" onClick={() => store.hold(rx.id, holdReason)}>
            <span className="btn-ico"><Icon name="pause" size={14} /></span>Hold: ask for revised prescription
          </button>
          <button className="btn btn-primary ph-small-btn" onClick={() => setRecording(true)}>
            <span className="btn-ico"><Icon name="edit" size={14} /></span>Record revised prescription
          </button>
        </div>
      )}

      {recording && (
        <RevisionForm
          rx={rx}
          meds={meds}
          onCancel={() => setRecording(false)}
          onSave={(rev) => {
            store.reviseRx(rx.id, { ...rev, productIds: [...new Set(open.map((f) => f.productId))], at: new Date() });
            setRecording(false);
          }}
        />
      )}
    </section>
  );
}

function RevisionForm({ rx, meds, onCancel, onSave }: {
  rx: Prescription;
  meds: string[];
  onCancel: () => void;
  onSave: (r: { by: string; outcome: 'continue' | 'stop'; historySeen: boolean; note: string }) => void;
}) {
  const [by, setBy] = useState(rx.doctor);
  const [outcome, setOutcome] = useState<'continue' | 'stop' | ''>('');
  const [historySeen, setHistorySeen] = useState(false);
  const [note, setNote] = useState('');
  const ready = !!by && !!outcome && historySeen;
  return (
    <form
      className="ph-cr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSave({ by, outcome: outcome as 'continue' | 'stop', historySeen, note: note.trim() });
      }}
    >
      <label className="field">
        <span className="field-label">Revised by</span>
        <select className="field-input" value={by} onChange={(e) => setBy(e.target.value)}>
          {DOCTORS.map((d) => <option key={d}>{d}</option>)}
        </select>
      </label>
      <fieldset className="ph-cr-outcome">
        <legend className="field-label">The revised prescription says</legend>
        <label className={outcome === 'continue' ? 'is-on' : ''}>
          <input type="radio" name="outcome" checked={outcome === 'continue'} onChange={() => setOutcome('continue')} />
          Continue {meds.join(', ')}: prescriber aware, with monitoring
        </label>
        <label className={outcome === 'stop' ? 'is-on' : ''}>
          <input type="radio" name="outcome" checked={outcome === 'stop'} onChange={() => setOutcome('stop')} />
          Stop {meds.join(', ')}: not to be dispensed
        </label>
      </fieldset>
      <label className="field ph-cr-note">
        <span className="field-label">Note <em>(optional)</em></span>
        <input className="field-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Check sugar twice daily; Metformin unchanged" maxLength={160} />
      </label>
      <label className="ph-cr-seen">
        <input type="checkbox" checked={historySeen} onChange={(e) => setHistorySeen(e.target.checked)} />
        Past history seen (record or reports)
      </label>
      <span className="ph-cr-form-actions">
        <button type="button" className="btn-text" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary ph-small-btn" disabled={!ready}>Save revised prescription</button>
      </span>
    </form>
  );
}
