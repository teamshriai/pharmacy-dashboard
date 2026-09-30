import { useState } from 'react';
import { Icon } from './design/Icon';
import { SUGGESTIONS, ask, type Answer, type Source, type SourceKind } from './assistant';
import type { Store } from './store';

const KIND_ICON: Record<SourceKind, Parameters<typeof Icon>[0]['name']> = {
  medicine: 'pill',
  batch: 'clock',
  prescription: 'clipboard',
  bills: 'receipt',
  rule: 'shieldCheck',
};

/** Ask a question; the answer is built only from this pharmacy's records. */
export function Assistant({ store }: { store: Store }) {
  const [q, setQ] = useState('');
  const [turn, setTurn] = useState<{ q: string; a: Answer } | null>(null);

  function run(question: string) {
    const text = question.trim();
    if (!text) return;
    setQ('');
    setTurn({ q: text, a: ask(text, store) });
  }

  // Each source opens the record it came from; rules have nowhere to go.
  function open(s: Source) {
    if (s.kind === 'medicine' || s.kind === 'batch') store.openProduct(s.ref);
    else if (s.kind === 'prescription') store.openRx(s.ref);
    else if (s.kind === 'bills') store.go('billing');
  }

  return (
    <section className="card ph-card ph-ask" aria-label="Pharmacy helper">
      <div className="ph-ask-head">
        <span className="ph-ask-icon"><Icon name="brainPulse" size={17} /></span>
        <span>
          <h2>Ask</h2>
          <p>Answers come from this pharmacy’s records</p>
        </span>
      </div>

      <form className="ph-ask-form" onSubmit={(e) => { e.preventDefault(); run(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. stock of insulin" aria-label="Ask a question" />
        <button className="btn btn-primary" type="submit" disabled={!q.trim()} aria-label="Ask">
          <Icon name="search" size={15} />
        </button>
      </form>

      {turn ? (
        <div className="ph-ask-answer step-enter" aria-live="polite">
          <p className="ph-ask-q">{turn.q}</p>
          <ul className={`ph-ask-lines ${turn.a.found ? '' : 'is-none'}`}>
            {turn.a.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          {turn.a.sources.length > 0 && (
            <div className="ph-ask-sources">
              <span>From</span>
              {turn.a.sources.map((s, i) => (
                <button key={i} className={`ph-ask-src ${s.kind === 'rule' ? 'is-static' : ''}`} onClick={() => open(s)} disabled={s.kind === 'rule'}>
                  <Icon name={KIND_ICON[s.kind]} size={12} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <button className="btn-text ph-ask-again" onClick={() => setTurn(null)}>New question</button>
        </div>
      ) : (
        <div className="ph-ask-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="ph-chip" onClick={() => run(s)}>{s}</button>
          ))}
        </div>
      )}
    </section>
  );
}
