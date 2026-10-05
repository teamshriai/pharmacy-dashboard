/**
 * The pharmacist's own to-do list on the Dashboard.
 *
 * Tasks are spoken (an offline speech engine; see below) or typed. Ticking one
 * removes it. Anything still open at the end of the pharmacist's shift turns
 * high priority (a task added after the shift is due at the end of the next), and the first time the Dashboard sees that each day it says
 * so in a pop-up. Older open tasks stay high until they are done.
 *
 * The list is kept on this computer for the signed-in pharmacist (browser
 * storage); it is a personal reminder list, not a shared record.
 */
import { useEffect, useState } from 'react';
import { Icon } from './design/Icon';
import { STAFF, USER, hhmm } from './data';
import { useVoice } from './voice';
import type { Store } from './store';

interface Task {
  id: string;
  text: string;
  /** ISO time it was added. */
  at: string;
  via: 'voice' | 'typed';
}

const KEY = `shri-pharmacy-todo-${USER.id}`;
const WARNED = `${KEY}-warned`;
/** How many were ticked off today, for the progress bar: { day, n }. */
const DONE_TODAY = `${KEY}-done-today`;
const readDone = (day: string) => {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_TODAY) ?? 'null');
    return v && v.day === day ? Number(v.n) || 0 : 0;
  } catch {
    return 0;
  }
};
const writeDone = (day: string, n: number) => {
  try {
    localStorage.setItem(DONE_TODAY, JSON.stringify({ day, n }));
  } catch {
    /* the bar resets after a refresh */
  }
};
/** The end of the signed-in pharmacist's shift, when open tasks become high priority. */
const END_HOUR = STAFF.find((s) => s.name === USER.name)?.shift[1] ?? 17;

const load = (): Task[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((t) => t && typeof t.text === 'string' && typeof t.at === 'string') : [];
  } catch {
    return [];
  }
};
const save = (tasks: Task[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    /* not remembered after a refresh, still works now */
  }
};

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfShift = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), END_HOUR);
const ampm = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;

/**
 * When a task is due: the end of the shift on the day it was added, or, if it
 * was added after that shift had ended, the end of the next day's shift.
 */
function dueAt(t: Task) {
  const added = new Date(t.at);
  const end = endOfShift(added);
  return added < end ? end : endOfShift(new Date(added.getFullYear(), added.getMonth(), added.getDate() + 1));
}
/** High once it is past due and still not done. */
function overdue(t: Task, now: Date) {
  return now >= dueAt(t);
}
function since(t: Task, now: Date) {
  const d = new Date(t.at);
  const days = Math.round((dayStart(now).getTime() - dayStart(d).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'since yesterday';
  return `since ${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

// ------------------------------------------------------------- card

export function TodoCard({ store }: { store: Store }) {
  const [tasks, setTasks] = useState<Task[]>(load);
  const [draft, setDraft] = useState('');
  const [done, setDone] = useState<Task | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Re-check every minute, so tasks turn high priority as the shift ends.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => save(tasks), [tasks]);

  function add(text: string, via: Task['via']) {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const at = new Date();
    setTasks((list) => [{ id: 't' + at.getTime() + Math.random().toString(36).slice(2, 6), text: clean[0].toUpperCase() + clean.slice(1), at: at.toISOString(), via }, ...list]);
  }
  const voice = useVoice((text) => add(text, 'voice'));

  const day = dayStart(now).toDateString();
  const [doneToday, setDoneToday] = useState(() => readDone(dayStart(new Date()).toDateString()));
  useEffect(() => setDoneToday(readDone(day)), [day]);
  const bump = (by: number) =>
    setDoneToday((n) => {
      const v = Math.max(0, n + by);
      writeDone(day, v);
      return v;
    });

  function complete(t: Task) {
    setTasks((list) => list.filter((x) => x.id !== t.id));
    setDone(t);
    bump(1);
  }
  const remove = (t: Task) => setTasks((list) => list.filter((x) => x.id !== t.id));
  const undo = () => {
    if (!done) return;
    setTasks((list) => [done, ...list]);
    setDone(null);
    bump(-1);
  };
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(t);
  }, [done]);

  // High priority first (oldest first among them), then newest first.
  const high = tasks.filter((t) => overdue(t, now)).sort((a, z) => a.at.localeCompare(z.at));
  const open = tasks.filter((t) => !overdue(t, now));
  const shown = [...high, ...open];

  // End of the day: say once per day that tasks were left undone.
  useEffect(() => {
    if (!high.length) return;
    const today = dayStart(now).toDateString();
    try {
      if (localStorage.getItem(WARNED) === today) return;
      localStorage.setItem(WARNED, today);
    } catch {
      /* without storage, the pop-up may show again after a refresh */
    }
    store.notify({
      tone: 'error',
      title: `${high.length} to-do ${high.length === 1 ? 'item' : 'items'} not done`,
      text: high.slice(0, 2).map((t) => t.text).join(' · ') + (high.length > 2 ? ` · +${high.length - 2} more` : ''),
      note: 'Marked high priority on the Dashboard.',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [high.length, now.toDateString()]);

  const total = doneToday + tasks.length;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;

  return (
    <section className={`card ph-card ph-chart ph-todo ${high.length ? 'has-high' : ''}`} aria-label="To-do">
      <header className="ph-todo-head">
        <span className="ph-todo-badge" aria-hidden="true"><Icon name="clipboard" size={18} /></span>
        <span className="ph-todo-title">
          <h2>
            To-do
            {tasks.length > 0 && <span className="ph-todo-count">{tasks.length}</span>}
            {high.length > 0 && <span className="ph-todo-high-count">{high.length} high</span>}
          </h2>
          <span>{now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        </span>
        <button
          className={`ph-mic ${voice.listening ? 'is-on' : ''}`}
          onClick={voice.listening ? voice.stop : voice.start}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? 'Stop listening' : 'Add a task by voice'}
          title={voice.listening ? 'Stop listening' : 'Speak a task'}
        >
          <Icon name="mic" size={16} />
          <span>{voice.listening ? 'Stop' : 'Speak'}</span>
        </button>
      </header>

      {total > 0 && (
        <div className="ph-todo-progress" aria-label={`${doneToday} of ${total} done today`}>
          <span className="ph-todo-bar"><span style={{ width: `${pct}%` }} /></span>
          <span className="ph-todo-progress-text"><strong>{doneToday}</strong> of {total} done today</span>
        </div>
      )}

      {voice.listening ? (
        <p className="ph-todo-heard" aria-live="polite">
          <span className="ph-todo-dot" />
          {voice.phase === 'loading' ? 'Getting voice ready… (the first time takes a moment)' : voice.heard ? `“${voice.heard}”` : 'Listening… say the task'}
        </p>
      ) : (
        <form
          className="ph-todo-add"
          onSubmit={(e) => {
            e.preventDefault();
            add(draft, 'typed');
            setDraft('');
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task, or tap the mic" aria-label="New task" maxLength={160} />
          <button className="btn-text" type="submit" disabled={!draft.trim()}>Add</button>
        </form>
      )}
      {voice.problem && (
        <p className="ph-todo-problem" role="status">
          <Icon name="alert" size={12} />
          <span>
            {/* A plain https address in the message becomes a link to open it. */}
            {voice.problem.split(/(https:\/\/\S+?)(?=,|\s|$)/).map((part, i) =>
              part.startsWith('https://') ? <a key={i} href={part}>{part}</a> : part,
            )}
          </span>
          <button className="ph-x" onClick={voice.clearProblem} aria-label="Dismiss"><Icon name="close" size={12} /></button>
        </p>
      )}

      {shown.length === 0 ? (
        <div className="ph-todo-empty">
          <span className="ph-todo-empty-icon"><Icon name="checkCircle" size={22} /></span>
          <strong>{doneToday ? 'All done for now' : 'Nothing to do yet'}</strong>
          <span>Tap the mic and say a task.</span>
        </div>
      ) : (
        <ul className="ph-todo-list">
          {shown.map((t) => {
            const isHigh = overdue(t, now);
            return (
              <li key={t.id} className={isHigh ? 'is-high' : ''}>
                <input type="checkbox" onChange={() => complete(t)} aria-label={`Done: ${t.text}`} title="Mark done" />
                <span className="ph-todo-text">
                  <span>{t.text}</span>
                  <em>
                    {isHigh ? <strong>High · not done {since(t, now)}</strong> : <>Added {hhmm(new Date(t.at))}</>}
                    {t.via === 'voice' && <span className="ph-todo-via"><Icon name="mic" size={10} />voice</span>}
                  </em>
                </span>
                <button className="ph-x" onClick={() => remove(t)} aria-label={`Delete: ${t.text}`} title="Delete"><Icon name="close" size={12} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {done ? (
        <p className="ph-todo-foot" role="status">
          <Icon name="checkCircle" size={12} /> Done: {done.text}
          <button className="btn-text" onClick={undo}>Undo</button>
        </p>
      ) : (
        <p className="ph-todo-foot">Anything not done by {ampm(END_HOUR)} (end of your shift) turns high priority.</p>
      )}
    </section>
  );
}
