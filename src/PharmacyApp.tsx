import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './design/shell.css';
import './design/nav.css';
import './pharmacy.css';
import { Icon } from './design/Icon';
import { DISPENSE_FROM, PRODUCTS, USER, band, productName } from './data';
import { usePharmacyStore, type Section, type Store } from './store';
import { Dashboard } from './Dashboard';
import { AiChat } from './AiChat';
import { NewOrder } from './NewOrder';
import { Dispense } from './Dispense';
import { Stock } from './Stock';
import { Billing } from './Billing';
import { NewRx } from './NewRx';
import { Reports } from './Reports';
import { Formulary } from './Formulary';
import { Patients } from './Patients';
import { Staff } from './Staff';
import { Settings } from './Settings';
import { Status, TypeBadge } from './parts';

/**
 * Day (light) is the default. Only a theme someone picks is remembered, under a new
 * key: the old one was written on every load, so it cannot tell a choice from the default.
 */
const THEME_KEY = 'shri-pharmacy-theme-choice';
/** The SHRI HEALTH ribbon, served from public/ next to the page (works under any sub-path). */
const LOGO = `${import.meta.env.BASE_URL}favicon-192.png`;

/** Each destination owns one hue (DESIGN_SYSTEM.md §4.4), shown on its nav glyph. */
type Hue = 'blue' | 'teal' | 'green' | 'amber' | 'orange' | 'pink' | 'indigo' | 'gray';
type NavItem = { key: Section; label: string; icon: Parameters<typeof Icon>[0]['name']; hue: Hue };

/** Daily work first, then records; Settings sits apart at the foot of the rail. */
const NAV_GROUPS: { head: string; items: NavItem[] }[] = [
  {
    head: 'Pharmacy',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'grid', hue: 'blue' },
      { key: 'billing', label: 'Billing', icon: 'receipt', hue: 'orange' },
      { key: 'stock', label: 'Inventory', icon: 'layers', hue: 'teal' },
    ],
  },
  {
    head: 'Records',
    items: [
      { key: 'formulary', label: 'Formulary', icon: 'book', hue: 'amber' },
      { key: 'reports', label: 'Reports', icon: 'chart', hue: 'indigo' },
      { key: 'patients', label: 'Patients', icon: 'users', hue: 'pink' },
      { key: 'staff', label: 'Staff', icon: 'badge', hue: 'green' },
    ],
  },
];
const SETTINGS: NavItem = { key: 'settings', label: 'Settings', icon: 'sliders', hue: 'gray' };
const NAV = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS];

/** One line under each page title, so a first-time user knows what the page is for. */
const HINT: Record<Section | 'dispense' | 'entry', string> = {
  dashboard: 'Today at a glance.',
  order: 'Order medicines from Procurement.',
  billing: 'Every bill and payment today.',
  stock: 'Every medicine: stock, category, maker and expiry.',
  formulary: 'Doses, brands, Schedules and norms for every medicine (sample).',
  reports: "Today's sales, GST, stock value and the H1 register.",
  patients: 'Everyone served today.',
  staff: 'Who is on shift, and what they did today.',
  settings: 'Theme and turnaround targets.',
  dispense: 'Check, pick, give.',
  entry: 'Patient, medicines, review.',
};

export default function PharmacyApp() {
  const store = usePharmacyStore();
  useClockTick(30_000);
  const [navOpen, setNavOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeNav = () => setNavOpen(false);

  // While the drawer is open: Escape closes it, the page behind does not scroll,
  // and focus moves into it, returning to the menu button afterwards.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    // Widening the window past the drawer breakpoint turns it back into the sidebar.
    const wide = window.matchMedia('(min-width: 1024px)');
    const onWide = () => wide.matches && setNavOpen(false);
    wide.addEventListener('change', onWide);
    document.documentElement.classList.add('nav-locked');
    document.querySelector<HTMLElement>('#side-drawer .rail-item')?.focus();
    const button = menuButton.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
      document.documentElement.classList.remove('nav-locked');
      button?.focus();
    };
  }, [navOpen]);
  const [dark, setDarkState] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  /** A theme picked with the toggle or in Settings: applied and remembered. */
  const setDark = (next: boolean | ((d: boolean) => boolean)) =>
    setDarkState((d) => {
      const v = typeof next === 'function' ? next(d) : next;
      try {
        localStorage.setItem(THEME_KEY, v ? 'dark' : 'light');
      } catch {
        /* storage unavailable: the choice is simply not remembered */
      }
      return v;
    });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    // The phone's browser bar follows the console's theme, not the device's.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14181f' : '#e8edf4');
  }, [dark]);

  const rx = store.activeRx ? store.rxs.find((r) => r.id === store.activeRx) : undefined;
  const alerts =
    PRODUCTS.filter((p) => store.stockOf(p.id) < p.reorder).length +
    store.batches.filter((b) => !b.quarantined && band(b) === 'expired').length;
  const counts: Partial<Record<Section, number>> = { dashboard: store.pending.length, stock: alerts };

  const heading = rx ? 'Dispense' : store.entering ? 'New prescription' : store.section === 'order' ? 'New order' : NAV.find((n) => n.key === store.section)!.label;

  return (
    <div className="app-shell ph-shell">
      <a href="#main-content" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to main content</a>
      <aside className={`side-nav ${navOpen ? 'is-open' : ''}`}>
        <div className="side-head">
          {/* The logo leads back to the SHRI-AI portal the console sits under. */}
          <a className="brand brand-link" href="https://www.shri-ai.org/dev/" title="SHRI-AI · www.shri-ai.org/dev">
            <img className="brand-mark brand-logo" src={LOGO} alt="" width={36} height={36} />
            <span className="brand-text">
              <span className="brand-name">SHRI HEALTH</span>
              <span className="brand-sub">Pharmacy</span>
            </span>
          </a>
          <button
            ref={menuButton}
            className="nav-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-expanded={navOpen}
            aria-controls="side-drawer"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
          >
            <Icon name={navOpen ? 'close' : 'menu'} size={18} />
            {!navOpen && counts.dashboard ? <span className="nav-toggle-dot" aria-hidden="true" /> : null}
          </button>
        </div>

        {/* On tablets and phones this is a slide-in drawer; on wider screens it is the sidebar. */}
        <div className="nav-scrim" onClick={closeNav} aria-hidden="true" />
        <div
          id="side-drawer"
          className="side-drawer"
          onClick={(e) => (e.target as HTMLElement).closest('.rail-item') && closeNav()}
        >
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
            {/* Day / night switch (DESIGN_SYSTEM.md §6.3). */}
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              aria-label="Night mode"
              className="theme-toggle"
              onClick={() => setDark((d) => !d)}
              title={dark ? 'Switch to day mode' : 'Switch to night mode'}
            >
              <span className="theme-track" aria-hidden="true">
                <span className="theme-knob"><Icon name={dark ? 'moon' : 'sun'} size={13} strokeWidth={2.5} /></span>
                <span className="theme-ghost theme-ghost--sun"><Icon name="sun" size={12} /></span>
                <span className="theme-ghost theme-ghost--moon"><Icon name="moon" size={12} /></span>
              </span>
            </button>
            <div className="user-chip">
              <span className="user-avatar"><Icon name="userCheck" size={15} /></span>
              <span className="user-meta">
                <span className="user-name">{USER.name} · {USER.role}</span>
                <span className="user-role">{DISPENSE_FROM}</span>
              </span>
            </div>
            {/* The hospital group's site; opens in a new tab so the console stays open. */}
            <a className="ph-partner" href="https://indostates.com/" target="_blank" rel="noopener noreferrer" title="Indo States Health · indostates.com">
              <img src={`${import.meta.env.BASE_URL}indostates-logo.png`} alt="Indo States Health" width={170} height={39} />
            </a>
          </div>
        </header>

        <Toast store={store} />
        <AiChat store={store} />

        <main id="main-content" tabIndex={-1} className="app-main ph-main">
          {rx ? (
            <Dispense key={rx.id} store={store} rx={rx} />
          ) : store.entering ? (
            <NewRx store={store} />
          ) : store.section === 'dashboard' ? (
            <Dashboard store={store} />
          ) : store.section === 'order' ? (
            <NewOrder store={store} />
          ) : store.section === 'billing' ? (
            <Billing store={store} />
          ) : store.section === 'stock' ? (
            <Stock store={store} />
          ) : store.section === 'formulary' ? (
            <Formulary store={store} />
          ) : store.section === 'reports' ? (
            <Reports store={store} />
          ) : store.section === 'patients' ? (
            <Patients store={store} />
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

/** Re-renders every `ms` so waiting times and "over target" flags stay current while nobody clicks. */
function useClockTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

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
      <span className="rail-icon" style={{ '--hue': `var(--tone-${n.hue})` } as CSSProperties}>
        <Icon name={n.icon} size={17} strokeWidth={on ? 2.2 : 1.8} />
      </span>
      <span className="rail-label">{n.label}{on && <span className="sr-only"> (current page)</span>}</span>
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
