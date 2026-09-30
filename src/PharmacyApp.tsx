import { useEffect, useRef, useState } from 'react';
import './design/shell.css';
import './design/nav.css';
import './pharmacy.css';
import { Icon } from './design/Icon';
import { DISPENSE_FROM, PRODUCTS, USER, band, productName, type RxType } from './data';
import { usePharmacyStore, type Section, type Store } from './store';
import { Dashboard } from './Dashboard';
import { Queue } from './Queue';
import { Dispense } from './Dispense';
import { Stock } from './Stock';
import { Receive } from './Receive';
import { Billing } from './Billing';
import { NewRx } from './NewRx';
import { Reports } from './Reports';
import { Patients } from './Patients';
import { Manufacturers } from './Manufacturers';
import { Staff } from './Staff';
import { Settings } from './Settings';
import { Status, TypeBadge } from './parts';

const THEME_KEY = 'shri-pharmacy-theme';

type NavItem = { key: Section; label: string; icon: Parameters<typeof Icon>[0]['name'] };

/** Daily work first, then records; Settings sits apart at the foot of the rail. */
const NAV_GROUPS: { head: string; items: NavItem[] }[] = [
  {
    head: 'Pharmacy',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
      { key: 'queue', label: 'Queue', icon: 'clipboard' },
      { key: 'billing', label: 'Billing', icon: 'receipt' },
      { key: 'stock', label: 'Stock', icon: 'layers' },
      { key: 'receive', label: 'Receive', icon: 'package' },
    ],
  },
  {
    head: 'Records',
    items: [
      { key: 'reports', label: 'Reports', icon: 'chart' },
      { key: 'patients', label: 'Patients', icon: 'users' },
      { key: 'manufacturers', label: 'Manufacturers', icon: 'factory' },
      { key: 'staff', label: 'Staff', icon: 'badge' },
    ],
  },
];
const SETTINGS: NavItem = { key: 'settings', label: 'Settings', icon: 'sliders' };
const NAV = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS];

/** One line under each page title, so a first-time user knows what the page is for. */
const HINT: Record<Section | 'dispense' | 'entry', string> = {
  dashboard: 'Today at a glance.',
  queue: 'Prescriptions waiting. Select one to start.',
  billing: 'Every bill and payment today.',
  stock: 'Stock, low items and expiry.',
  receive: 'Record a delivery, then add it to stock.',
  reports: "Today's sales, GST and stock value.",
  patients: 'Everyone served today.',
  manufacturers: 'Medicines by maker, and what is in stock.',
  staff: 'Who is on shift, and what they did today.',
  settings: 'Theme and turnaround targets.',
  dispense: 'Check, pick, pay.',
  entry: 'Patient, medicines, review.',
};

export default function PharmacyApp() {
  const store = usePharmacyStore();
  const [queueType, setQueueType] = useState<RxType | 'All'>('All');
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable: the choice is simply not remembered */
    }
  }, [dark]);

  const rx = store.activeRx ? store.rxs.find((r) => r.id === store.activeRx) : undefined;
  const alerts =
    PRODUCTS.filter((p) => store.stockOf(p.id) < p.reorder).length +
    store.batches.filter((b) => !b.quarantined && band(b) === 'expired').length;
  const counts: Partial<Record<Section, number>> = { queue: store.pending.length, stock: alerts };

  const heading = rx ? 'Dispense' : store.entering ? 'New prescription' : NAV.find((n) => n.key === store.section)!.label;

  return (
    <div className="app-shell ph-shell">
      <aside className="side-nav">
        <div className="brand">
          <span className="brand-mark"><Icon name="cross" size={15} strokeWidth={2.2} /></span>
          <span className="brand-text">
            <span className="brand-name">SHRI-AI</span>
            <span className="brand-sub">Pharmacy</span>
          </span>
        </div>

        <nav className="rail" aria-label="Pharmacy">
          {NAV_GROUPS.map((g) => (
            <div key={g.head} className="rail-group">
              <p className="rail-head">{g.head}</p>
              <ol className="rail-list">
                {g.items.map((n) => <li key={n.key}><NavButton item={n} store={store} count={counts[n.key]} /></li>)}
              </ol>
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <NavButton item={SETTINGS} store={store} />
          <div className="side-note">
            <span className="side-dot" />
            Sample data
          </div>
        </div>
      </aside>

      <div className="app-stage">
        <header className="top-bar ph-top">
          <div className="top-title">
            <h1 className="top-heading">{heading}</h1>
            <p className="top-hint">{HINT[rx ? 'dispense' : store.entering ? 'entry' : store.section]}</p>
          </div>

          <Search store={store} />

          <div className="top-actions">
            {/* The side menu's "Sample data" note is hidden once it collapses, so say it here. */}
            <span className="ph-sample-chip" title="Demonstration data only">Sample data</span>
            <button
              className="theme-toggle"
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Switch to day mode' : 'Switch to night mode'}
              title={dark ? 'Day mode' : 'Night mode'}
            >
              <Icon name={dark ? 'sun' : 'moon'} size={16} />
            </button>
            <div className="user-chip">
              <span className="user-avatar"><Icon name="userCheck" size={15} /></span>
              <span className="user-meta">
                <span className="user-name">{USER.name} · {USER.role}</span>
                <span className="user-role">{DISPENSE_FROM}</span>
              </span>
            </div>
          </div>
        </header>

        <Toast store={store} />

        <main className="app-main ph-main">
          {rx ? (
            <Dispense key={rx.id} store={store} rx={rx} />
          ) : store.entering ? (
            <NewRx store={store} />
          ) : store.section === 'dashboard' ? (
            <Dashboard store={store} />
          ) : store.section === 'queue' ? (
            <Queue store={store} type={queueType} setType={setQueueType} />
          ) : store.section === 'billing' ? (
            <Billing store={store} />
          ) : store.section === 'stock' ? (
            <Stock store={store} />
          ) : store.section === 'receive' ? (
            <Receive store={store} />
          ) : store.section === 'reports' ? (
            <Reports store={store} />
          ) : store.section === 'patients' ? (
            <Patients store={store} />
          ) : store.section === 'manufacturers' ? (
            <Manufacturers store={store} />
          ) : store.section === 'staff' ? (
            <Staff store={store} />
          ) : (
            <Settings store={store} dark={dark} setDark={setDark} />
          )}
        </main>
      </div>
    </div>
  );
}

const TOAST_MS = 5000;

/** The pop-up intimation (e.g. "Order placed"): bottom right, closes by itself, or with ×. */
function Toast({ store }: { store: Store }) {
  const t = store.toast;
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(store.closeToast, TOAST_MS);
    return () => clearTimeout(timer);
    // A new message (new id) restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id]);
  return (
    <div className="ph-toast-slot" role="status" aria-live="polite">
      {t && (
        <div key={t.id} className={`ph-toast ph-toast--${t.tone}`}>
          <span className="ph-toast-icon"><Icon name={t.tone === 'ok' ? 'checkCircle' : 'alert'} size={18} /></span>
          <span className="ph-toast-body">
            <strong>{t.title}</strong>
            <span>{t.text}</span>
            {t.note && <em>{t.note}</em>}
          </span>
          <button className="ph-x" onClick={store.closeToast} aria-label="Close"><Icon name="close" size={14} /></button>
        </div>
      )}
    </div>
  );
}

function NavButton({ item: n, store, count }: { item: NavItem; store: Store; count?: number }) {
  const on = store.section === n.key;
  return (
    <button className={`rail-item ${on ? 'rail-item--active' : ''}`} onClick={() => store.go(n.key)} aria-current={on ? 'page' : undefined}>
      <span className="rail-icon"><Icon name={n.icon} size={16} /></span>
      <span className="rail-label">{n.label}</span>
      {!!count && <span className="ph-nav-count">{count}</span>}
    </button>
  );
}

/** The one search: patients, MRNs, prescription numbers and medicines. */
function Search({ store }: { store: Store }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const term = q.trim().toLowerCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const rxHits = term
    ? store.rxs.filter((r) => `${r.patient.name} ${r.patient.mrn} ${r.id}`.toLowerCase().includes(term)).slice(0, 5)
    : [];
  const medHits = term ? PRODUCTS.filter((p) => productName(p).toLowerCase().includes(term)).slice(0, 5) : [];

  const pickRx = (id: string) => { store.openRx(id); setQ(''); setOpen(false); };
  const pickMed = (id: string) => { store.openProduct(id); setQ(''); setOpen(false); };

  return (
    <div className="ph-search" ref={wrap}>
      <Icon name="search" size={15} />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') {
            if (rxHits[0]) pickRx(rxHits[0].id);
            else if (medHits[0]) pickMed(medHits[0].id);
          }
        }}
        placeholder="Patient, MRN, Rx no. or medicine"
        aria-label="Search"
      />
      {open && term && (
        <div className="ph-results step-enter">
          {rxHits.length === 0 && medHits.length === 0 && <p className="ph-results-none">No match</p>}
          {rxHits.length > 0 && (
            <>
              <p className="ph-results-head">Prescriptions</p>
              {rxHits.map((r) => (
                <button key={r.id} className="ph-result" onClick={() => pickRx(r.id)}>
                  <span><strong>{r.patient.name}</strong><span>{r.patient.mrn} · {r.patient.encounter} · {r.id}</span></span>
                  <TypeBadge type={r.type} />
                  <Status status={r.status} />
                </button>
              ))}
            </>
          )}
          {medHits.length > 0 && (
            <>
              <p className="ph-results-head">Medicines</p>
              {medHits.map((p) => (
                <button key={p.id} className="ph-result" onClick={() => pickMed(p.id)}>
                  <span><strong>{productName(p)}</strong><span>{p.form} · {p.route}</span></span>
                  <span className="ph-result-qty">{store.stockOf(p.id)} in stock</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
