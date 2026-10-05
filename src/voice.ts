/**
 * Voice input, shared by the Dashboard To-do and the SHRI AI chat.
 *
 * Offline first: the console's own speech engine (Vosk, Indian English model,
 * public/voice/) turns the microphone into text inside this browser, so nothing
 * spoken leaves the computer, and it works in Brave and Firefox too. If the
 * model is not installed, the browser's own speech service is used where there
 * is one (Chrome, Edge), which does send audio to Google or Microsoft.
 */
import { useEffect, useRef, useState } from 'react';

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

export function useVoice(onText: (text: string) => void) {
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

