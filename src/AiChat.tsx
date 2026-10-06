/**
 * SHRI AI: the chat assistant behind the floating button, on every screen.
 *
 * Opens as a panel on the right. Questions are typed or spoken (the shared
 * offline voice engine), and every answer is built only from this console's
 * own records (assistant.ts): nothing is invented and nothing is sent anywhere.
 * Each answer lists the records it came from; a click opens that record, with
 * the chat kept open beside it. The conversation lasts until the page reloads.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './design/Icon';
import { SUGGESTIONS, ask, type Answer, type Source, type SourceKind } from './assistant';
import { USER, type Category } from './data';
import type { Store } from './store';
import { useVoice } from './voice';

const KIND_ICON: Record<SourceKind, Parameters<typeof Icon>[0]['name']> = {
  medicine: 'pill',
  batch: 'clock',
  prescription: 'clipboard',
  bills: 'receipt',
  rule: 'shieldCheck',
  order: 'package',
  alert: 'alert',
  staff: 'badge',
  category: 'layers',
  formulary: 'book',
  stock: 'layers',
};

type Turn = { id: number; q: string; a: Answer; via: 'voice' | 'typed' };

export function AiChat({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const fab = useRef<HTMLButtonElement>(null);

  function run(question: string, via: Turn['via'] = 'typed') {
    const text = question.trim();
    if (!text) return;
    setQ('');
    setTurns((t) => [...t, { id: Date.now() + Math.random(), q: text, a: ask(text, store), via }]);
  }
  const voice = useVoice((text) => run(text, 'voice'));

  // Newest answer in view; typing focus when the panel opens.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' });
  }, [turns, voice.heard]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      fab.current?.focus();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  // Each source opens the record it came from; rules have nowhere to go.
  function openSource(s: Source) {
    if (s.kind === 'medicine' || s.kind === 'batch') store.openProduct(s.ref);
    else if (s.kind === 'prescription') store.openRx(s.ref);
    else if (s.kind === 'bills') store.go('billing');
    else if (s.kind === 'order') store.go('stock');
    else if (s.kind === 'alert') store.go('dashboard');
    else if (s.kind === 'staff') store.go('staff');
    else if (s.kind === 'formulary') store.openFormulary(s.ref);
    else if (s.kind === 'stock') store.go('stock', 'all');
    else if (s.kind === 'category') {
      store.go('stock', 'all');
      store.setStockCats([s.ref as Category]);
    }
    // On a phone the panel covers the page, so step aside to show the record.
    if (window.innerWidth < 760) setOpen(false);
  }

  return (
    <>
      {!open && (
        <button ref={fab} className="ph-ai-fab" onClick={() => setOpen(true)} aria-label="Ask SHRI AI" title="Ask SHRI AI">
          <Icon name="sparkles" size={22} />
          <span className="ph-ai-fab-label">Ask AI</span>
        </button>
      )}

      {open && (
        <aside className="ph-ai" aria-label="SHRI AI chat">
          <header className="ph-ai-head">
            <span className="ph-ai-badge" aria-hidden="true"><Icon name="sparkles" size={18} /></span>
            <span className="ph-ai-title">
              <strong>SHRI AI</strong>
              <span>Answers from this console's records</span>
            </span>
            {turns.length > 0 && (
              <button className="ph-ai-iconbtn" onClick={() => setTurns([])} title="New chat" aria-label="New chat">
                <Icon name="edit" size={16} />
              </button>
            )}
            <button className="ph-ai-iconbtn" onClick={() => { setOpen(false); fab.current?.focus(); }} title="Close" aria-label="Close chat">
              <Icon name="close" size={16} />
            </button>
          </header>

          <div className="ph-ai-log" ref={log} aria-live="polite">
            <div className="ph-ai-msg is-ai">
              <span className="ph-ai-avatar" aria-hidden="true"><Icon name="sparkles" size={13} /></span>
              <div className="ph-ai-bubble">
                <p>Hello {USER.name}. Ask me about stock, expiry, waiting or served patients, bills, orders, staff, doses and brands, or a pharmacy rule. You can type or tap the mic.</p>
                {turns.length === 0 && (
                  <div className="ph-ai-suggest">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => run(s)}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {turns.map((t) => (
              <div key={t.id} className="ph-ai-turn">
                <div className="ph-ai-msg is-me">
                  <div className="ph-ai-bubble">
                    {t.q}
                    {t.via === 'voice' && <span className="ph-ai-via"><Icon name="mic" size={10} />voice</span>}
                  </div>
                </div>
                <div className="ph-ai-msg is-ai">
                  <span className="ph-ai-avatar" aria-hidden="true"><Icon name="sparkles" size={13} /></span>
                  <div className={`ph-ai-bubble ${t.a.found ? '' : 'is-none'}`}>
                    {t.a.readAs && <p className="ph-ai-readas">Read as: “{t.a.readAs}”</p>}
                    {t.a.lines.map((l, i) => <p key={i}>{l}</p>)}
                    {t.a.suggest && t === turns[turns.length - 1] && (
                      <div className="ph-ai-suggest">
                        {t.a.suggest.map((x) => <button key={x} onClick={() => run(x)}>{x}</button>)}
                      </div>
                    )}
                    {t.a.sources.length > 0 && (
                      <div className="ph-ai-sources">
                        <span>From</span>
                        {t.a.sources.map((s, i) => (
                          <button key={i} className={s.kind === 'rule' ? 'is-static' : ''} onClick={() => openSource(s)} disabled={s.kind === 'rule'}>
                            <Icon name={KIND_ICON[s.kind]} size={11} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {voice.listening && (
              <div className="ph-ai-msg is-me">
                <div className="ph-ai-bubble is-listening">
                  <span className="ph-todo-dot" />
                  {voice.phase === 'loading' ? 'Getting voice ready…' : voice.heard ? `“${voice.heard}”` : 'Listening…'}
                </div>
              </div>
            )}
          </div>

          {voice.problem && (
            <p className="ph-ai-problem" role="status">
              <Icon name="alert" size={12} />
              <span>
                {voice.problem.split(/(https:\/\/\S+?)(?=,|\s|$)/).map((part, i) =>
                  part.startsWith('https://') ? <a key={i} href={part}>{part}</a> : part,
                )}
              </span>
              <button className="ph-x" onClick={voice.clearProblem} aria-label="Dismiss"><Icon name="close" size={12} /></button>
            </p>
          )}

          <form
            className="ph-ai-compose"
            onSubmit={(e) => {
              e.preventDefault();
              run(q);
            }}
          >
            <textarea
              ref={input}
              rows={1}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter starts a new line.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  run(q);
                }
              }}
              placeholder="Ask about stock, patients, orders…"
              aria-label="Ask SHRI AI"
              maxLength={300}
            />
            <button
              type="button"
              className={`ph-ai-mic ${voice.listening ? 'is-on' : ''}`}
              onClick={voice.listening ? voice.stop : voice.start}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Stop listening' : 'Ask by voice'}
              title={voice.listening ? 'Stop listening' : 'Ask by voice'}
            >
              <Icon name="mic" size={17} />
            </button>
            <button type="submit" className="ph-ai-send" disabled={!q.trim()} aria-label="Send" title="Send">
              <Icon name="send" size={16} />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}
