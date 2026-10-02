/**
 * New order: the Pharmacy's official order (requisition) to the Indostates
 * Procurement Centre, on its own page (#/order).
 *
 * It asks only for what Procurement receives: department (Pharmacy), requested
 * by, priority, notes, and each item with its quantity in the catalogue's unit.
 * Brand, strength, SKU and old price come from Procurement's catalogue and are
 * shown for checking. Vendor, new price and delivery date are Procurement's to
 * set, so they are not on this form. Procurement numbers the request (IPC-REQ-…).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './design/Icon';
import { PRODUCTS, USER, inr, productById, productName, suggestedOrder } from './data';
import { catalogueFor, inCatalogue, packOf, units, type CatalogueItem } from './procurement';
import type { Store } from './store';

interface Line {
  uid: string;
  productId: string;
  /** In the catalogue's unit (strips, vials …). */
  packs: number;
}
const blank = (): Line => ({ uid: 'o' + Date.now() + Math.random().toString(36).slice(2, 6), productId: '', packs: 0 });
const ORDERABLE = PRODUCTS.filter((p) => inCatalogue(p.id));

export function NewOrder({ store }: { store: Store }) {
  const [lines, setLines] = useState<Line[]>(() => {
    // Started from a Needs action alert: that medicine is already on the order.
    const seed = store.orderSeed && inCatalogue(store.orderSeed) ? productById(store.orderSeed) : null;
    if (!seed) return [blank()];
    return [{ ...blank(), productId: seed.id, packs: Math.ceil(suggestedOrder(seed, store.stockOf(seed.id) + store.onOrder(seed.id)) / packOf(seed.id)) }];
  });
  const [requestedBy, setRequestedBy] = useState(`${USER.name} (${USER.role})`);
  const [notes, setNotes] = useState('');
  const [urgentPick, setUrgentPick] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [cat, setCat] = useState<Record<string, CatalogueItem> | 'loading' | 'error'>('loading');
  const first = useRef<HTMLSelectElement>(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    first.current?.focus();
    catalogueFor(ORDERABLE.map((p) => p.id)).then(setCat, () => setCat('error'));
  }, []);

  const set = (uid: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  /** Suggests 30 days of sales, counting what is already in stock and on order, in whole packs. */
  const choose = (uid: string, productId: string) => {
    const p = productId ? productById(productId) : null;
    set(uid, { productId, packs: p ? Math.ceil(suggestedOrder(p, store.stockOf(p.id) + store.onOrder(p.id)) / packOf(p.id)) : 0 });
  };

  const item = (pid: string) => (typeof cat === 'object' ? cat[pid] : undefined);
  const ready = lines.filter((l) => l.productId && l.packs > 0);
  const low = ready.some((l) => store.stockOf(l.productId) < productById(l.productId).reorder);
  const urgent = urgentPick ?? low;
  const total = ready.reduce((n, l) => n + (item(l.productId)?.price ?? 0) * l.packs, 0);
  const chosen = new Set(lines.map((l) => l.productId).filter(Boolean));
  const back = () => store.go('dashboard');

  async function send() {
    if (!ready.length || sending) return;
    setSending(true);
    const done = await store.placeMultiOrder(
      ready.map((l) => ({ productId: l.productId, qty: l.packs * packOf(l.productId) })),
      urgent,
      { requestedBy, notes },
    );
    if (done) back();
    else setSending(false);
  }

  return (
    <div className="ph-stack step-enter">
      <section className="card ph-card ph-po-form" aria-labelledby="po-title">
        <div className="ph-po-top">
          <button className="btn-text ph-back" onClick={back} disabled={sending}>
            <Icon name="arrow" size={14} />Dashboard
          </button>
          <span className="ph-po-to"><Icon name="package" size={13} />To: Indostates Procurement Centre</span>
        </div>

        <header className="ph-po-head">
          <span>
            <h2 id="po-title">Pharmacy order</h2>
            <p>Material requisition · Procurement assigns the request number, vendor and price.</p>
          </span>
          <span className="ph-po-no">
            <em>Request no.</em>
            <strong>Assigned on sending</strong>
          </span>
        </header>

        <div className="ph-po-meta">
          <label className="field">
            <span className="field-label">Department</span>
            <input className="field-input" value="Pharmacy" readOnly aria-readonly="true" />
          </label>
          <label className="field">
            <span className="field-label">Requested by</span>
            <input className="field-input" value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} maxLength={80} disabled={sending} />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input className="field-input" value={today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} readOnly aria-readonly="true" />
          </label>
          <div className="field">
            <span className="field-label">Priority</span>
            <span className="ph-po-prio" role="radiogroup" aria-label="Priority">
              {(['Normal', 'Urgent'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={(v === 'Urgent') === urgent}
                  className={`${(v === 'Urgent') === urgent ? 'is-on' : ''} ${v === 'Urgent' ? 'is-urgent' : ''}`}
                  onClick={() => setUrgentPick(v === 'Urgent')}
                  disabled={sending}
                >
                  {v === 'Urgent' && <Icon name="alert" size={12} />}
                  {v}
                </button>
              ))}
            </span>
            {low && urgentPick === null && <span className="ph-po-hint">Urgent: an item is low on stock</span>}
          </div>
        </div>

        {cat === 'error' && (
          <p className="ph-todo-problem" role="status"><Icon name="alert" size={12} /><span>Procurement's catalogue could not be reached, so brand and price are not shown. The order can still be sent once it is back.</span></p>
        )}

        <div className="ph-table-wrap">
          <table className="ph-table ph-po-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Item</th>
                <th>SKU</th>
                <th>Brand</th>
                <th>Strength</th>
                <th className="num">Qty</th>
                <th>Unit</th>
                <th className="num">In stock</th>
                <th className="num">Old price</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const p = l.productId ? productById(l.productId) : null;
                const it = p ? item(p.id) : undefined;
                const stock = p ? store.stockOf(p.id) : 0;
                const pack = p ? packOf(p.id) : 1;
                return (
                  <tr key={l.uid}>
                    <td className="num ph-muted">{i + 1}</td>
                    <td className="ph-po-item">
                      <select
                        ref={i === 0 ? first : undefined}
                        className="field-input"
                        value={l.productId}
                        onChange={(e) => choose(l.uid, e.target.value)}
                        disabled={sending}
                        aria-label={`Item ${i + 1}`}
                      >
                        <option value="">Choose a medicine…</option>
                        {ORDERABLE.map((x) => (
                          <option key={x.id} value={x.id} disabled={chosen.has(x.id) && x.id !== l.productId}>
                            {productName(x)} · {x.form}
                          </option>
                        ))}
                      </select>
                      {it && <span className="ph-po-cat">{it.name}</span>}
                    </td>
                    <td className="mono">{it?.sku ?? '—'}</td>
                    <td>{it?.manufacturer ?? '—'}</td>
                    <td>{it?.strength ?? (p ? p.strength : '—')}</td>
                    <td className="num">
                      <input
                        className="field-input ph-po-qty"
                        type="number"
                        min={1}
                        value={l.packs || ''}
                        onChange={(e) => set(l.uid, { packs: Math.max(0, Math.floor(Number(e.target.value))) })}
                        onFocus={(e) => e.target.select()}
                        disabled={!p || sending}
                        aria-label={`Quantity ${i + 1}`}
                      />
                      {p && pack > 1 && l.packs > 0 && <span className="ph-po-sub">= {l.packs * pack} {p.unit}</span>}
                    </td>
                    <td>{it?.unit ?? (p ? p.unit : '—')}</td>
                    <td className="num">
                      {p ? (
                        <span className={stock < p.reorder ? 'ph-po-low' : ''}>
                          {stock} {p.unit}
                          {stock < p.reorder && <em> · low</em>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="num">{it ? inr(it.price) : p && cat === 'loading' ? '…' : '—'}</td>
                    <td className="num"><strong>{it && l.packs > 0 ? inr(it.price * l.packs) : '—'}</strong></td>
                    <td>
                      {lines.length > 1 && (
                        <button className="ph-x" onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))} aria-label={`Remove item ${i + 1}`} disabled={sending}>
                          <Icon name="close" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9}>
                  <button className="btn-text ph-neworder-add" onClick={() => setLines((ls) => [...ls, blank()])} disabled={sending || lines.length >= ORDERABLE.length}>
                    <Icon name="plus" size={14} /> Add item
                  </button>
                </td>
                <td className="num" colSpan={2}>
                  <span className="ph-po-total-label">Estimated total</span>
                  <strong className="ph-po-total">{total > 0 ? inr(total) : '—'}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {PRODUCTS.length > ORDERABLE.length && (
          <p className="ph-po-note">
            Not in Procurement's catalogue, so not orderable here: {PRODUCTS.filter((p) => !inCatalogue(p.id)).map(productName).join(', ')}.
          </p>
        )}

        <label className="field ph-po-notes">
          <span className="field-label">Notes for Procurement <em>(optional)</em></span>
          <textarea
            className="field-input"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Needed before the weekend; ICU running short"
            disabled={sending}
          />
        </label>

        <footer className="ph-po-foot">
          <span className="ph-po-summary">
            {ready.length} {ready.length === 1 ? 'item' : 'items'}
            {ready.length > 0 && <> · {ready.map((l) => units(l.packs, item(l.productId)?.unit ?? productById(l.productId).unit)).join(', ')}</>}
            {' · '}<strong className={urgent ? 'ph-po-urgent' : ''}>{urgent ? 'Urgent' : 'Normal'}</strong>
          </span>
          <button className="btn-text" onClick={back} disabled={sending}>Cancel</button>
          <button className="btn btn-primary" onClick={send} disabled={!ready.length || sending}>
            <span className="btn-ico"><Icon name="package" size={15} /></span>
            {sending ? 'Sending…' : 'Send to Procurement'}
          </button>
        </footer>
      </section>
    </div>
  );
}
