import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './design/Icon';
import {
  COVER_DAYS,
  DISPENSE_FROM,
  LEAD_DAYS,
  LOCATIONS,
  PRODUCTS,
  SAFETY_DAYS,
  band,
  inr,
  makerOf,
  monYr,
  productName,
  suggestedOrder,
  type Batch,
  type Location,
  type Product,
} from './data';
import { Empty, Expiry, StockGauge } from './parts';
import { inCatalogue, oldPrice, packsFor, units } from './procurement';
import type { StockFilter, Store } from './store';

const FILTERS: { key: StockFilter; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { key: 'all', label: 'All', icon: 'layers' },
  { key: 'low', label: 'Low stock', icon: 'alert' },
  { key: 'expiring', label: 'Expire in 90 days', icon: 'clock' },
  { key: 'expired', label: 'Expired', icon: 'ban' },
];
const REASONS = ['Expired', 'Damaged', 'Recall'];

/** The stock list; opening a medicine shows that medicine alone, and browser Back returns to the list. */
export function Stock({ store }: { store: Store }) {
  const open = PRODUCTS.find((p) => p.id === store.focusProduct);
  return open ? <ProductPage key={open.id} store={store} p={open} /> : <StockList store={store} />;
}

type Notice = { icon: 'ban' | 'checkCircle'; title: string; text: string };

function StockList({ store }: { store: Store }) {
  // Filter and location live in the store and the address, so they survive opening a medicine.
  const loc = store.stockLoc;
  const setLoc = store.setStockLoc;
  /** One row at a time can have its order form, or its "remove expired" confirmation, open. */
  const [ordering, setOrdering] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Coming back from a medicine: the same scroll position, with focus on the row that was opened.
  useLayoutEffect(() => {
    const back = store.stockReturn;
    if (!back) return;
    document.getElementById('prod-' + back.id)?.focus({ preventScroll: true });
    window.scrollTo({ top: back.y });
    // Only on mount: later changes to the list must not jump the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = PRODUCTS.map((p) => {
    // Used-up batches drop out of the live stock view.
    const all = store.batches.filter((b) => b.productId === p.id && b.qty > 0 && (loc === 'All' || b.location === loc));
    const live = all.filter((b) => !b.quarantined);
    const usable = live.filter((b) => band(b) !== 'expired');
    const qty = usable.reduce((n, b) => n + b.qty, 0);
    const soonest = [...usable].sort((a, z) => a.expiry.getTime() - z.expiry.getTime())[0];
    const expiring = live.some((b) => band(b) === 'lt30' || band(b) === 'lt90');
    const expired = live.some((b) => band(b) === 'expired');
    // Low stock is judged on the whole hospital, not the filtered location.
    const low = store.stockOf(p.id) < p.reorder;
    // Earliest date among the batches that put the medicine in its group.
    const due = (keep: (b: Batch) => boolean) => Math.min(...live.filter(keep).map((b) => b.expiry.getTime()));
    const group = expired ? 0 : expiring ? 1 : low ? 2 : 3;
    const date = expired ? due((b) => band(b) === 'expired') : expiring ? due((b) => band(b) === 'lt30' || band(b) === 'lt90') : soonest?.expiry.getTime() ?? Infinity;
    return { p, all, qty, soonest, expiring, expired, low, group, date };
  });

  // Expired first, then expiring soonest first, then low stock (emptiest first), then the rest by expiry.
  rows.sort((a, z) =>
    a.group - z.group ||
    (a.group === 2 ? store.stockOf(a.p.id) / a.p.reorder - store.stockOf(z.p.id) / z.p.reorder : a.date - z.date),
  );

  const match = (r: (typeof rows)[number], f: StockFilter) =>
    f === 'all' || (f === 'low' && r.low) || (f === 'expiring' && r.expiring) || (f === 'expired' && r.expired);
  const shown = rows.filter((r) => match(r, store.stockFilter) && (loc === 'All' || r.all.length));

  function removeExpired(p: Product) {
    const done = store.removeExpired(p.id, loc === 'All' ? undefined : loc);
    setRemoving(null);
    if (done.batches) {
      setNotice({
        icon: 'ban',
        title: `${productName(p)} · ${done.nos?.join(', ')} removed from use`,
        text: `${done.qty} ${p.unit} expired. Keep it apart for return to the supplier or disposal.`,
      });
    }
  }

  return (
    <section className="card ph-card step-enter">
      {notice && (
        <div className="ph-posted ph-posted--inline" role="status">
          <Icon name={notice.icon} size={16} />
          <span><strong>{notice.title}</strong>{notice.text}</span>
          <button className="ph-x" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      )}
      <div className="ph-queue-bar">
        <div className="ph-chips" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={store.stockFilter === f.key}
              className={`ph-chip ${store.stockFilter === f.key ? 'ph-chip--on' : ''}`}
              onClick={() => store.setStockFilter(f.key)}
            >
              <Icon name={f.icon} size={13} />
              {f.label}
              <span className="ph-chip-count">{rows.filter((r) => match(r, f.key)).length}</span>
            </button>
          ))}
        </div>
        <div className="ph-seg" role="radiogroup" aria-label="Location">
          {(['All', ...LOCATIONS] as const).map((l) => (
            <button key={l} role="radio" aria-checked={loc === l} className={loc === l ? 'is-on' : ''} onClick={() => setLoc(l)}>
              {l === 'All' ? 'All locations' : l}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty icon="checkCircle" text="No medicines match this filter." />
      ) : (
        <div className="ph-table-wrap">
          <table className="ph-table ph-stock">
            <thead>
              <tr>
                <th>Medicine</th>
                <th className="num">Batches</th>
                <th>Stock</th>
                <th>Next expiry</th>
                <th>Status</th>
                <th className="ph-act-col"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, all, qty, soonest, expiring, expired, low }) => (
                <Fragment key={p.id}>
                  <tr
                    id={'prod-' + p.id}
                    className={`is-link ${ordering === p.id ? 'is-open' : ''}`}
                    onClick={() => store.openFromList(p.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && store.openFromList(p.id)}
                  >
                    <td><ProductCell p={p} /></td>
                    <td className="num">{all.length}</td>
                    <td>
                      <span className="ph-stock-cell">
                        <strong>{qty}</strong>
                        <StockGauge qty={store.stockOf(p.id)} reorder={p.reorder} />
                      </span>
                    </td>
                    <td>{soonest ? <Expiry batch={soonest} /> : '—'}</td>
                    <td><StatusChips low={low} expired={expired} expiring={expiring} ordered={store.onOrder(p.id)} /></td>
                    {/* The row opens the medicine; clicks and keys in this cell stay here. */}
                    <td className="ph-act" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <RowAction
                        p={p}
                        expired={expired}
                        low={low}
                        removing={removing === p.id}
                        expiredQty={all.filter((b) => !b.quarantined && band(b) === 'expired').reduce((n, b) => n + b.qty, 0)}
                        onRemove={() => { setOrdering(null); setRemoving(p.id); }}
                        onConfirmRemove={() => removeExpired(p)}
                        onCancelRemove={() => setRemoving(null)}
                        onOrder={() => { setRemoving(null); setOrdering(ordering === p.id ? null : p.id); }}
                      />
                    </td>
                  </tr>
                  {ordering === p.id && (
                    <tr className="ph-order-row">
                      <td colSpan={6}>
                        <OrderForm
                          p={p}
                          inStock={store.stockOf(p.id)}
                          onOrder={store.onOrder(p.id)}
                          onCancel={() => setOrdering(null)}
                          onPlace={async (n) => {
                            const done = await store.placeOrder(p.id, n);
                            if (done) setOrdering(null);
                            return done;
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * One action per row, chosen by what the medicine needs most:
 * expired stock must come off the shelf first (confirmed, as it cannot be undone);
 * low stock needs ordering (the main button); anything else can still be topped up.
 */
function RowAction({ p, expired, low, removing, expiredQty, onRemove, onConfirmRemove, onCancelRemove, onOrder }: {
  p: Product;
  expired: boolean;
  low: boolean;
  removing: boolean;
  expiredQty: number;
  onRemove: () => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onOrder: () => void;
}) {
  if (expired && removing) {
    return (
      <span className="ph-act-confirm" role="group" aria-label={`Remove expired ${productName(p)}`}>
        <span>Remove {expiredQty} {p.unit}?</span>
        <button className="btn ph-small-btn ph-btn-danger" onClick={onConfirmRemove}>Remove</button>
        <button className="btn-text" onClick={onCancelRemove}>Cancel</button>
      </span>
    );
  }
  if (expired) {
    return (
      <button className="btn ph-small-btn ph-btn-danger-soft" onClick={onRemove} title="Take the expired batches out of use">
        <span className="btn-ico"><Icon name="ban" size={13} /></span>Remove expired
      </button>
    );
  }
  return (
    <button className={`btn ph-small-btn ${low ? 'btn-primary' : 'btn-secondary'}`} onClick={onOrder} aria-label={`Order more ${productName(p)}`}>
      <span className="btn-ico"><Icon name="package" size={13} /></span>Order more
    </button>
  );
}

function ProductCell({ p }: { p: Product }) {
  return (
    <span className="ph-prod">
      <span className="ph-med-icon"><Icon name={p.route === 'Oral' ? 'pill' : 'droplet'} size={15} /></span>
      <span>
        <strong>{productName(p)}</strong>
        <span>{p.form} · {p.route}</span>
      </span>
      {p.schedule === 'H1' && <span className="ph-flag ph-flag--h1">H1</span>}
      {p.cold && <span className="ph-flag" title="Cold chain: 2–8 °C"><Icon name="snow" size={12} /></span>}
    </span>
  );
}

function StatusChips({ low, expired, expiring, ordered }: { low: boolean; expired: boolean; expiring: boolean; ordered: number }) {
  return (
    <span className="ph-status-stack">
      {low && <span className="ph-status ph-status--warn"><Icon name="alert" size={12} />Low</span>}
      {expired && <span className="ph-status ph-status--danger"><Icon name="ban" size={12} />Expired</span>}
      {expiring && !expired && <span className="ph-status ph-status--warn"><Icon name="clock" size={12} />Expiring</span>}
      {ordered > 0 && <span className="ph-status ph-status--info"><Icon name="package" size={12} />On order</span>}
      {!low && !expired && !expiring && !ordered && <span className="ph-status ph-status--ok"><Icon name="checkCircle" size={12} />Normal</span>}
    </span>
  );
}

/** One medicine: its figures, how the low-stock level is worked out, its batches, and Order more. */
function ProductPage({ store, p }: { store: Store; p: Product }) {
  const [quarantining, setQuarantining] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ icon: 'ban' | 'checkCircle'; title: string; text: string } | null>(null);
  const [ordering, setOrdering] = useState(false);

  const head = useRef<HTMLDivElement>(null);
  // A block body: in Chromium scrollTo returns a Promise, which React would take as the cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    // Focus the medicine's name, not a button: the Enter that opened this page would otherwise press it.
    head.current?.focus({ preventScroll: true });
  }, []);

  const batches = store.batches.filter((b) => b.productId === p.id && b.qty > 0).sort((a, z) => a.expiry.getTime() - z.expiry.getTime());
  const live = batches.filter((b) => !b.quarantined);
  const inStock = store.stockOf(p.id);
  const at = (l: Location) => live.filter((b) => b.location === l && band(b) !== 'expired').reduce((n, b) => n + b.qty, 0);
  const ordered = store.onOrder(p.id);
  const low = inStock < p.reorder;
  const daysLeft = p.perDay ? Math.floor(inStock / p.perDay) : Infinity;
  const perDay = Number.isInteger(p.perDay) ? String(p.perDay) : p.perDay.toFixed(1);
  const maker = makerOf(p);

  const figures = [
    { label: 'In stock', value: String(inStock), sub: LOCATIONS.map((l) => `${l === DISPENSE_FROM ? 'Counter' : 'Store'} ${at(l)}`).join(' · '), tone: low ? 'warn' : '' },
    { label: 'Sells per day', value: perDay, sub: `${p.sold30} ${p.unit} in 30 days` },
    { label: 'Low below', value: String(p.reorder), sub: `${COVER_DAYS} days of sales` },
    { label: 'Lasts about', value: daysLeft === Infinity ? '—' : `${daysLeft} d`, sub: ordered ? `${ordered} on order` : 'at current sales', tone: daysLeft < COVER_DAYS ? 'warn' : '' },
  ];

  return (
    <div className="ph-stack step-enter">
      <section className="card ph-card ph-prod-page">
        <div className="ph-prod-top">
          <button className="btn-text ph-back" onClick={store.backToStock}>
            <Icon name="arrow" size={14} />Back to Stock
          </button>
          <button className="btn btn-primary ph-small-btn" onClick={() => setOrdering(true)} disabled={ordering}>
            <span className="btn-ico"><Icon name="package" size={14} /></span>Order more
          </button>
        </div>

        <div className="ph-prod-head" ref={head} tabIndex={-1} aria-label={`${productName(p)}, ${p.form}`}>
          <ProductCell p={p} />
          <StatusChips low={low} expired={live.some((b) => band(b) === 'expired')} expiring={live.some((b) => band(b) === 'lt30' || band(b) === 'lt90')} ordered={ordered} />
        </div>

        {notice && (
          <div className="ph-posted ph-posted--inline" role="status">
            <Icon name={notice.icon} size={16} />
            <span><strong>{notice.title}</strong>{notice.text}</span>
            <button className="ph-x" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
          </div>
        )}

        {ordering && (
          <OrderForm
            p={p}
            inStock={inStock}
            onOrder={ordered}
            onCancel={() => setOrdering(false)}
            onPlace={async (qty) => {
              const done = await store.placeOrder(p.id, qty);
              if (done) setOrdering(false);
              return done;
            }}
          />
        )}

        <div className="ph-prod-figs">
          {figures.map((f) => (
            <div key={f.label} className={`ph-prod-fig ${f.tone ? 'is-' + f.tone : ''}`}>
              <span>{f.label}</span>
              <strong>{f.value}</strong>
              <em>{f.sub}</em>
            </div>
          ))}
        </div>
        <p className="ph-prod-why">
          Low-stock level: {perDay} sold a day × {COVER_DAYS} days ({LEAD_DAYS} days for delivery + {SAFETY_DAYS} days safety) = {p.reorder} {p.unit}.
        </p>

        <ul className="ph-master">
          <li><span>Strength</span>{p.strength}</li>
          <li><span>Schedule</span>{p.schedule}</li>
          <li><span>GST</span>{p.gst}%</li>
          <li><span>MRP</span>{inr(p.mrp)} / {p.unit}</li>
          <li><span>Maker</span>{maker.name}</li>
          <li><span>Supplier</span>{maker.supplier}</li>
        </ul>
        <p className="ph-sample-line">
          <Icon name="alert" size={12} />
          Sample data: maker, supplier, prices and batches are examples for demonstration, not real supply records.
        </p>
      </section>

      <section className="card ph-card ph-panel">
        <header className="ph-panel-head">
          <span><h2>Batches</h2><p>{batches.length} batch{batches.length === 1 ? '' : 'es'} · earliest expiry first</p></span>
        </header>
        {batches.length === 0 ? (
          <Empty icon="layers" text="No stock of this medicine." />
        ) : (
          <div className="ph-table-wrap">
            <table className="ph-table ph-batch-table">
              <thead>
                <tr><th>Batch</th><th>Made</th><th>Expiry</th><th className="num">Qty</th><th>Location</th><th /></tr>
              </thead>
              <tbody>
                {batches.map((b: Batch) => (
                  <tr key={b.id} className={b.quarantined ? 'is-off' : ''}>
                    <td className="mono">{b.batchNo}</td>
                    <td>{monYr(b.mfg)}</td>
                    <td><Expiry batch={b} /></td>
                    <td className="num">{b.qty}</td>
                    <td>{b.location}</td>
                    <td className="ph-batch-act">
                      {b.quarantined ? (
                        <span className="ph-status ph-status--danger"><Icon name="ban" size={12} />Removed from use · {b.quarantined}</span>
                      ) : quarantining === b.id ? (
                        <span className="ph-reasons">
                          {REASONS.map((r) => (
                            <button
                              key={r}
                              className="ph-hold-reason"
                              onClick={() => {
                                store.quarantine(b.id, r);
                                setQuarantining(null);
                                setNotice({ icon: 'ban', title: `${productName(p)} · ${b.batchNo} removed from use · ${r}`, text: 'It can no longer be dispensed.' });
                              }}
                            >
                              {r}
                            </button>
                          ))}
                          <button className="btn-text" onClick={() => setQuarantining(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button className="ph-link-btn" onClick={() => setQuarantining(b.id)}>
                          <Icon name="ban" size={12} /> Remove from use
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Order more: just the quantity. It goes to Procurement as a Pharmacy request,
 * where they choose the vendor and price, so neither is asked for here.
 */
function OrderForm({ p, inStock, onOrder, onCancel, onPlace }: {
  p: Product;
  inStock: number;
  /** Already requested and not yet received; counted towards the 30 days. */
  onOrder: number;
  onCancel: () => void;
  /** Resolves true once Procurement has accepted the request. */
  onPlace: (qty: number) => Promise<boolean>;
}) {
  const [qty, setQty] = useState(suggestedOrder(p, inStock + onOrder));
  const [sending, setSending] = useState(false);
  // Old price comes from Procurement, the same figure its request shows.
  const [price, setPrice] = useState<{ price: number; unit: string } | 'loading' | 'none'>('loading');
  useEffect(() => {
    let live = true;
    oldPrice(p.id).then((x) => live && setPrice(x ?? 'none'), () => live && setPrice('none'));
    return () => {
      live = false;
    };
  }, [p.id]);

  if (!inCatalogue(p.id)) {
    return (
      <div className="ph-po ph-po--none" role="status">
        <p className="ph-po-note">
          <Icon name="alert" size={13} /> {productName(p)} is not in the procurement catalogue, so it can't be requested from here. Ask Procurement to add it.
        </p>
        <span className="ph-po-actions"><button type="button" className="btn-text" onClick={onCancel}>Close</button></span>
      </div>
    );
  }

  const urgent = inStock < p.reorder;
  const packs = packsFor(p.id, qty);
  const cover = p.perDay ? Math.floor((inStock + onOrder) / p.perDay) : Infinity;
  const why =
    cover >= 30
      ? `Stock${onOrder ? ' and requests' : ''} already cover about ${cover === Infinity ? 'many' : cover} days, so this is a small top-up`
      : `Suggested: enough for 30 days of sales${onOrder ? `, counting ${onOrder} already requested` : ''}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (qty <= 0 || sending) return;
    setSending(true);
    const done = await onPlace(qty);
    // On success the form closes; on failure it stays so the pharmacist can try again.
    if (!done) setSending(false);
  }

  return (
    <form className="ph-po ph-po--send" onSubmit={submit}>
      <label className="field">
        <span className="field-label">Quantity ({p.unit})</span>
        <input className="field-input" type="number" min={1} value={qty || ''} onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value))))} aria-label="Order quantity" disabled={sending} />
      </label>
      <span className="ph-po-info">
        <span className="ph-po-price">
          {price === 'loading' ? (
            <span className="ph-muted">Old price: checking…</span>
          ) : price === 'none' ? (
            <span className="ph-muted">Old price: not available</span>
          ) : (
            <>
              Old price <strong>{inr(price.price)}</strong> / {price.unit}
              {packs && <> · about <strong>{inr(price.price * packs.packs)}</strong> for {units(packs.packs, price.unit)}</>}
            </>
          )}
        </span>
        <span className="ph-po-note">
          {why}
          {packs && packs.pack > 1 && <> · sent as <strong>{packs.packs} strips</strong> of {packs.pack}</>}
          {urgent && <> · <span className="ph-po-urgent">Urgent</span> (low stock)</>}
        </span>
      </span>
      <span className="ph-po-actions">
        <button type="button" className="btn-text" onClick={onCancel} disabled={sending}>Cancel</button>
        <button type="submit" className="btn btn-primary ph-small-btn" disabled={qty <= 0 || sending}>
          {sending ? 'Sending…' : 'Send to Procurement'}
        </button>
      </span>
    </form>
  );
}
