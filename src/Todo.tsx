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
import { useEffect, useRef, useState } from 'react';
import { Icon } from './design/Icon';
import { STAFF, USER, hhmm } from './data';
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

// ------------------------------------------------------------- speech
//
// Offline first: the console's own speech engine (Vosk, Indian English model,
// public/voice/) turns the microphone into text inside this browser, so nothing
// spoken leaves the computer, and it works in Brave and Firefox too. If the
// model is not installed, the browser's own speech service is used where there
// is one (Chrome, Edge), which does send audio to Google or Microsoft.

const MODEL_FILE = 'voice/vosk-model-small-en-in-0.4.tar.gz';
/** How long to wait for speech before giving up. */
const LISTEN_MS = 12_000;

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const Recognition = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

type VoskModel = Awaited<ReturnType<typeof import('vosk-browser')['createModel']>>;
let model: Promise<VoskModel> | null = null;
/** Loads the offline engine once per page (the model is about 36 MB the first time, then cached). */
function offlineModel(): Promise<VoskModel> {
  if (!model) {
    const url = new URL(MODEL_FILE, document.baseURI).href;
    model = fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (!r.ok || (r.headers.get('content-type') ?? '').includes('text/html')) throw new Error('no-model');
        return import('vosk-browser');
      })
      .then((v) => withWorkerFile(() => v.createModel(url, -1)));
    model.catch(() => (model = null));
  }
  return model;
}

/**
 * vosk-browser starts its worker from a blob: URL; the build also writes that same
 * worker to voice/vosk-worker.js (vite.config.ts). Starting it from the file keeps
 * the page's security policy strict: only that file is allowed to evaluate code.
 */
function withWorkerFile<T>(create: () => Promise<T>): Promise<T> {
  const Real = window.Worker;
  const file = new URL('voice/vosk-worker.js', document.baseURI).href;
  window.Worker = class extends Real {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(String(url).startsWith('blob:') ? file : url, options);
    }
  };
  // The worker is created synchronously inside createModel, so the swap is only needed briefly.
  const done = create();
  window.Worker = Real;
  return done;
}

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone is blocked. Allow it for this site in the browser, then try again.',
  'service-not-allowed': 'Microphone is blocked. Allow it for this site in the browser, then try again.',
  NotAllowedError: 'Microphone is blocked. Allow it for this site in the browser, then try again.',
  'no-speech': "Didn't hear anything. Tap the mic and speak again.",
  'audio-capture': 'No microphone found.',
  NotFoundError: 'No microphone found.',
  network: "This browser can't reach its speech service. Type the task instead.",
  'no-model': 'Voice is not installed on this console yet. Type the task.',
};

/** The same page on the https server (npm run preview:https), keeping the current screen. */
const secureUrl = () => `https://${location.hostname}:4443${location.pathname}${location.hash}`;

type Phase = 'idle' | 'loading' | 'listening';

function useVoice(onText: (text: string) => void) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const fail = (code: string) => {
    setProblem(SPEECH_ERRORS[code] ?? `Voice stopped (${code}). Try again, or type the task.`);
    setPhase('idle');
    setHeard('');
  };

  async function start() {
    setProblem(null);
    setHeard('');
    if (!window.isSecureContext) {
      // Browsers only allow the microphone on https (or localhost).
      setProblem(`The microphone only works on a secure address. Open ${secureUrl()}, or type the task.`);
      return;
    }
    setPhase('loading');
    try {
      await listenOffline(await offlineModel());
    } catch (e) {
      const code = (e as Error).name === 'Error' ? (e as Error).message : (e as Error).name;
      if (code === 'no-model' && Recognition) listenBrowser();
      else fail(code || 'unknown');
    }
  }

  /** The offline engine: microphone → audio → recognizer, all in this page. */
  async function listenOffline(m: VoskModel) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const rec = new m.KaldiRecognizer(ctx.sampleRate);
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is old but works everywhere the engine does, without a separate worklet file.
    const node = ctx.createScriptProcessor(4096, 1, 1);
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      node.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      rec.remove();
      stopRef.current = null;
      setPhase('idle');
      setHeard('');
    };
    const timer = setTimeout(() => {
      end();
      setProblem(SPEECH_ERRORS['no-speech']);
    }, LISTEN_MS);
    rec.on('partialresult', (msg) => {
      const partial = (msg as { result: { partial?: string } }).result.partial ?? '';
      if (partial) setHeard(partial);
    });
    rec.on('result', (msg) => {
      const text = ((msg as { result: { text?: string } }).result.text ?? '').trim();
      if (!text || finished) return;
      onText(text);
      end();
    });
    node.onaudioprocess = (e) => {
      try {
        rec.acceptWaveform(e.inputBuffer);
      } catch {
        /* the recognizer was removed between buffers */
      }
    };
    source.connect(node);
    node.connect(ctx.destination);
    // Stop: let the engine finish what it heard, then close.
    stopRef.current = () => {
      rec.retrieveFinalResult();
      setTimeout(end, 400);
    };
    setPhase('listening');
  }

  /** Fallback: the browser's own speech service (Chrome, Edge). */
  function listenBrowser() {
    const r = new Recognition!();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = '';
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        final ||= e.results[i].isFinal;
      }
      setHeard(text);
      if (final && text.trim()) onText(text.trim());
    };
    r.onerror = (e) => fail(e.error);
    r.onend = () => {
      setPhase('idle');
      setHeard('');
      stopRef.current = null;
    };
    stopRef.current = () => r.stop();
    setPhase('listening');
    try {
      r.start();
    } catch {
      fail('unknown');
    }
  }

  const stop = () => stopRef.current?.();
  useEffect(() => () => stopRef.current?.(), []);
  return { phase, listening: phase !== 'idle', heard, problem, start, stop, clearProblem: () => setProblem(null) };
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
