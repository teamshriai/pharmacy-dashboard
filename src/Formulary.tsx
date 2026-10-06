/**
 * Formulary: every medicine this pharmacy stocks, described the way the Indian
 * formulary does (class, Schedule, NLEM, dose, brands, storage, counselling),
 * the norms the console enforces, and the distributors it buys through.
 *
 * Brands are searchable, so a prescription written by brand is matched to the
 * generic the pharmacy dispenses. All of it is sample data (see formulary.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './design/Icon';
import { DISTRIBUTORS, PRODUCTS, productById, productName } from './data';
import { FORMULARY, NLEM_RULE, NORMS, SCHEDULE_RULE, type Monograph } from './formulary';
import { Empty } from './parts';
import type { Store } from './store';

type Tab = 'medicines' | 'norms' | 'distributors';
type Only = 'all' | 'H1' | 'nlem' | 'cold';

const mg = (n: number) => (n >= 1000 ? `${n / 1000} g` : `${n} mg`);

export function Formulary({ store }: { store: Store }) {
  const [tab, setTab] = useState<Tab>('medicines');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<Only>('all');
  const focus = store.focusProduct;

  const term = q.trim().toLowerCase();
  const matchOf = (m: Monograph) => {
    const p = productById(m.productId);
    if (!term) return { hit: true, brand: '' };
    const brand = m.brands.find((b) => b.name.toLowerCase().includes(term));
    const hit = !!brand || `${productName(p)} ${p.form} ${m.klass}`.toLowerCase().includes(term);
    return { hit, brand: brand ? brand.name : '' };
  };
  const keep = (m: Monograph) => {
    const p = productById(m.productId);
    return only === 'all' || (only === 'H1' && m.schedule === 'H1') || (only === 'nlem' && m.nlem === true) || (only === 'cold' && !!p.cold);
  };
  const shown = FORMULARY.filter((m) => keep(m) && matchOf(m).hit);
  const count = (o: Only) => FORMULARY.filter((m) => o === 'all' || (o === 'H1' && m.schedule === 'H1') || (o === 'nlem' && m.nlem === true) || (o === 'cold' && !!productById(m.productId).cold)).length;

  // An entry opened by link (#/formulary/met500) is shown even if a filter would hide it.
  useEffect(() => {
    if (focus) {
      setTab('medicines');
      setOnly('all');
      setQ('');
    }
  }, [focus]);

  return (
    <div className="ph-stack step-enter">
      <p className="ph-fm-sample" role="note">
        <Icon name="book" size={15} />
        <span>
          <strong>Sample formulary</strong> written for this demonstration in the style of the National Formulary of India.
          Verify every entry against NFI 2021, NLEM 2022 and the current Drugs and Cosmetics Rules before live use. Doses are for adults.
        </span>
      </p>

      <section className="card ph-card">
        <div className="ph-queue-bar">
          <div className="ph-chips" role="tablist" aria-label="Formulary">
            {([
              ['medicines', 'Medicines', 'pill', FORMULARY.length],
              ['norms', 'Norms', 'scale', NORMS.length],
              ['distributors', 'Distributors', 'truck', DISTRIBUTORS.length],
            ] as const).map(([k, label, icon, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`ph-chip ${tab === k ? 'ph-chip--on' : ''}`} onClick={() => setTab(k)}>
                <Icon name={icon} size={13} />{label}<span className="ph-chip-count">{n}</span>
              </button>
            ))}
          </div>
          {tab === 'medicines' && (
            <label className="ph-finder">
              <Icon name="search" size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Generic, brand or class" aria-label="Find in the formulary" />
            </label>
          )}
        </div>

        {tab === 'medicines' && (
          <>
            <div className="ph-chips ph-fm-only" role="radiogroup" aria-label="Show">
              {([['all', 'All'], ['H1', 'Schedule H1'], ['nlem', 'NLEM 2022'], ['cold', 'Cold chain']] as const).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={only === k} className={`ph-chip ${only === k ? 'ph-chip--on' : ''}`} onClick={() => setOnly(k)}>
                  {label}<span className="ph-chip-count">{count(k)}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <Empty icon="book" text={term ? `Nothing in the formulary matches “${q.trim()}”.` : 'No medicines in this group.'} />
            ) : (
              <ul className="ph-fm-list">
                {shown.map((m) => (
                  <Entry key={m.productId} store={store} m={m} brandHit={matchOf(m).brand} focused={focus === m.productId} />
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'norms' && (
          <ul className="ph-fm-norms">
            {NORMS.map((n) => (
              <li key={n.key}>
                <h3>{n.title}</h3>
                <p>{n.text}</p>
                <p className="ph-fm-where"><Icon name="checkCircle" size={12} />In this console: {n.where}</p>
              </li>
            ))}
          </ul>
        )}

        {tab === 'distributors' && <Distributors store={store} />}
      </section>
    </div>
  );
}

function Entry({ store, m, brandHit, focused }: { store: Store; m: Monograph; brandHit: string; focused: boolean }) {
  const p = productById(m.productId);
  const [open, setOpen] = useState(focused);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focused]);
  const maker = store.makerFor(p.id);
  const stock = store.stockOf(p.id);
  const id = `fm-${p.id}`;

  return (
    <li ref={ref} className={`ph-fm ${open ? 'is-open' : ''} ${focused ? 'is-focus' : ''}`}>
      <button className="ph-fm-head" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        <span className="ph-fm-icon"><Icon name={p.route === 'Oral' ? 'pill' : 'droplet'} size={16} /></span>
        <span className="ph-fm-name">
          <strong>{productName(p)} {p.form}</strong>
          <span>{m.klass}{brandHit && <> · <em className="ph-fm-brandhit">brand {brandHit}</em></>}</span>
        </span>
        <span className="ph-fm-tags">
          <span className={`ph-fm-sch ph-fm-sch--${m.schedule.toLowerCase()}`} title={SCHEDULE_RULE[m.schedule]}>{m.schedule === 'OTC' ? 'OTC' : `Sch ${m.schedule}`}</span>
          {m.nlem && <span className="ph-fm-nlem" title={NLEM_RULE}>NLEM</span>}
          {p.cold && <span className="ph-flag" title="Cold chain: 2–8 °C"><Icon name="snow" size={11} /></span>}
        </span>
        <span className="ph-chev"><Icon name="chevron" size={15} /></span>
      </button>

      {open && (
        <div className="ph-fm-body step-enter" id={id}>
          <div className="ph-fm-dose">
            <span className="ph-fm-label">Adult dose</span>
            <p>{m.dose}</p>
            {(m.maxSingleMg != null || m.maxDailyMg != null) ? (
              <p className="ph-fm-max">
                <Icon name="shieldCheck" size={13} />
                Dose check: up to {m.maxSingleMg != null && <>{mg(m.maxSingleMg)} a dose</>}
                {m.maxSingleMg != null && m.maxDailyMg != null && ', '}
                {m.maxDailyMg != null && <>{mg(m.maxDailyMg)} a day</>}
              </p>
            ) : (
              <p className="ph-fm-max is-none"><Icon name="alert" size={13} />Dose set for each patient: no fixed maximum to check</p>
            )}
          </div>

          <dl className="ph-fm-facts">
            <div>
              <dt>Schedule</dt>
              <dd>{SCHEDULE_RULE[m.schedule]}</dd>
            </div>
            <div>
              <dt>NLEM 2022</dt>
              <dd>{m.nlem ? 'Listed: price controlled (DPCO 2013); MRP must not exceed the NPPA ceiling price.' : m.nlem === false ? 'Not listed.' : 'Not confirmed for this form: check the current list.'}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{m.storage}</dd>
            </div>
            <div>
              <dt>Tell the patient</dt>
              <dd>{m.counsel}</dd>
            </div>
          </dl>

          <div className="ph-fm-brands">
            <span className="ph-fm-label">Brands in India <em>(for reference: dispensed by generic name)</em></span>
            <span className="ph-fm-brand-list">
              {m.brands.map((b) => (
                <span key={b.name} className={`ph-fm-brand ${brandHit === b.name ? 'is-hit' : ''}`}>{b.name}<em>{b.company}</em></span>
              ))}
            </span>
          </div>

          <div className="ph-fm-foot">
            <span>
              <Icon name="factory" size={13} /> Stocked from {maker.name} · through {maker.supplier}
              <span className="ph-muted"> (sample)</span>
            </span>
            <button className="btn btn-secondary ph-small-btn" onClick={() => store.openProduct(p.id)}>
              <span className="btn-ico"><Icon name="layers" size={14} /></span>{stock} {p.unit} in stock · Inventory
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Distributors({ store }: { store: Store }) {
  return (
    <>
      <div className="ph-table-wrap">
        <table className="ph-table ph-fm-dist">
          <thead><tr><th>Distributor</th><th>Delivery</th><th>Cold chain</th><th>Medicines</th></tr></thead>
          <tbody>
            {DISTRIBUTORS.map((d) => {
              const meds = PRODUCTS.filter((p) => store.makerFor(p.id).supplier === d.name);
              const cold = meds.filter((p) => p.cold);
              return (
                <tr key={d.name}>
                  <td data-label="Distributor"><strong>{d.name}</strong><span className="ph-muted"> · {d.city}</span></td>
                  <td data-label="Delivery">{d.delivery}</td>
                  <td data-label="Cold chain">
                    {d.coldChain ? (
                      <span className="ph-status ph-status--ok"><Icon name="snow" size={12} />2–8 °C</span>
                    ) : cold.length ? (
                      <span className="ph-status ph-status--danger" title="Carries cold-chain stock but cannot deliver it cold"><Icon name="alert" size={12} />Needed for {cold.map((p) => p.generic).join(', ')}</span>
                    ) : (
                      <span className="ph-muted">No</span>
                    )}
                  </td>
                  <td data-label="Medicines">
                    {meds.length ? (
                      <span className="ph-fm-dist-meds">
                        {meds.map((p) => (
                          <button key={p.id} className="ph-fm-medlink" onClick={() => store.openFormulary(p.id)}>{p.generic}</button>
                        ))}
                      </span>
                    ) : <span className="ph-muted">None at present</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ph-sample-line">
        <Icon name="truck" size={12} />
        Sample distributors. Which one supplies a medicine follows its maker, chosen in Inventory. Buy only from licensed wholesalers (Form 20B / 21B).
      </p>
    </>
  );
}
