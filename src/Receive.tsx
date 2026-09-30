import { useState } from 'react';
import { Icon } from './design/Icon';
import { LOCATIONS, PRODUCTS, SUPPLIERS, inr, productById, productName } from './data';
import { Head } from './parts';
import { blankLine, type GrnLine, type Store } from './store';

/** Months between now and the end of a yyyy-mm value. */
function monthsAhead(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
}

/** Everything that stops a line from posting, plus a softer short-expiry warning. */
function problems(l: GrnLine) {
  const errs: string[] = [];
  if (!l.productId) errs.push('Medicine');
  if (!l.batchNo.trim()) errs.push('Batch');
  if (!l.mfg) errs.push('Made date');
  if (!l.expiry) errs.push('Expiry');
  if (l.mfg && l.expiry && l.expiry <= l.mfg) errs.push('Expiry before made date');
  if (l.expiry && monthsAhead(l.expiry) < 0) errs.push('Already expired');
  if (l.qty <= 0) errs.push('Qty');
  if (l.rate <= 0) errs.push('Cost');
  const shortExpiry = !!l.expiry && monthsAhead(l.expiry) >= 0 && monthsAhead(l.expiry) < 6;
  return { errs, shortExpiry };
}

/**
 * Month entry as printed on strips and invoices, MM/YYYY, stored as yyyy-mm.
 * A text field rather than <input type="month">, which Firefox renders as a
 * bare text box that expects an unguessable yyyy-mm.
 */
function MonthField({ value, onChange, label, bad }: { value: string; onChange: (v: string) => void; label: string; bad: boolean }) {
  const shown = value ? `${value.slice(5, 7)}/${value.slice(0, 4)}` : '';
  const [text, setText] = useState(shown);
  return (
    <input
      className={`field-input mono ${bad ? 'is-bad' : ''}`}
      value={text}
      inputMode="numeric"
      placeholder="MM/YYYY"
      aria-label={label}
      maxLength={7}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, 6);
        const t = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
        setText(t);
        const mm = Number(d.slice(0, 2));
        onChange(d.length === 6 && mm >= 1 && mm <= 12 ? `${d.slice(2)}-${d.slice(0, 2)}` : '');
      }}
    />
  );
}

export function Receive({ store }: { store: Store }) {
  const g = store.grn;
  const [tried, setTried] = useState(false);
  const [posted, setPosted] = useState<{ invoice: string; lines: number; units: number; location: string; first: string } | null>(null);

  const set = (patch: Partial<typeof g>) => store.setGrn({ ...g, ...patch });
  const setLine = (i: number, patch: Partial<GrnLine>) =>
    set({ lines: g.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const checks = g.lines.map(problems);
  const headerOk = g.invoice.trim().length > 0 && !!g.invoiceDate;
  const linesOk = checks.every((c) => c.errs.length === 0);
  const units = g.lines.reduce((n, l) => n + l.qty + l.free, 0);
  const value = g.lines.reduce((n, l) => n + l.qty * l.rate, 0);
  const num = (v: string) => Math.max(0, Number(v) || 0);

  function post() {
    setTried(true);
    if (!headerOk || !linesOk) return;
    const summary = { invoice: g.invoice.trim(), lines: g.lines.length, units, location: g.location, first: g.lines[0].productId };
    store.postGrn(summary.invoice, g.location, g.lines);
    setPosted(summary);
    setTried(false);
  }

  return (
    <div className="ph-stack step-enter">
      {posted && (
        <div className="ph-posted">
          <Icon name="checkCircle" size={18} />
          <span>
            <strong>Added to stock · {posted.invoice}</strong>
            {posted.lines} lines · {posted.units} units now in {posted.location}
          </span>
          <button className="btn-text" onClick={() => store.openProduct(posted.first)}>View stock →</button>
          <button className="ph-x" onClick={() => setPosted(null)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      )}

      <section className="card ph-card">
        <Head icon="package" title="Invoice" sub="Nothing is added to stock until you press Add to stock." />
        <div className="ph-grn-head">
          <label className="field">
            <span className="field-label">Supplier</span>
            <select className="field-input" value={g.supplier} onChange={(e) => set({ supplier: e.target.value })}>
              {SUPPLIERS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Invoice no.<span className="field-required">*</span></span>
            <input className={`field-input ${tried && !g.invoice.trim() ? 'is-bad' : ''}`} value={g.invoice} onChange={(e) => set({ invoice: e.target.value })} placeholder="INV-88291" />
          </label>
          <label className="field">
            <span className="field-label">Invoice date<span className="field-required">*</span></span>
            <input className="field-input" type="date" value={g.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">PO no.</span>
            <input className="field-input" value={g.po} onChange={(e) => set({ po: e.target.value })} placeholder="Optional" />
          </label>
          <div className="field">
            <span className="field-label">Store in</span>
            <div className="ph-seg" role="radiogroup" aria-label="Location">
              {LOCATIONS.map((l) => (
                <button key={l} role="radio" aria-checked={g.location === l} className={g.location === l ? 'is-on' : ''} onClick={() => set({ location: l })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card ph-card">
        <Head
          icon="layers"
          title="Items"
          sub="One row per batch."
          action={
            <button className="btn btn-secondary ph-small-btn" onClick={() => set({ lines: [...g.lines, blankLine()] })}>
              <span className="btn-ico"><Icon name="plus" size={14} /></span>Add batch
            </button>
          }
        />
        <div className="ph-table-wrap">
          <table className="ph-table ph-grn">
            <thead>
              <tr>
                <th>Medicine</th><th>Batch</th><th>Made</th><th>Expiry</th>
                <th className="num">Qty</th><th className="num">Free</th><th className="num">Cost each</th><th className="num">Amount</th><th />
              </tr>
            </thead>
            <tbody>
              {g.lines.map((l, i) => {
                const c = checks[i];
                const bad = (k: string) => (tried && c.errs.some((e) => e.startsWith(k)) ? 'is-bad' : '');
                return (
                  <tr key={l.uid} className={tried && c.errs.length ? 'has-err' : ''}>
                    <td data-label="Medicine">
                      <select className={`field-input ${bad('Medicine')}`} value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} aria-label="Medicine">
                        <option value="">Select</option>
                        {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{productName(p)} {p.form}</option>)}
                      </select>
                    </td>
                    <td data-label="Batch"><input className={`field-input mono ${bad('Batch')}`} value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} placeholder="MFG234" aria-label="Batch" /></td>
                    <td data-label="Made"><MonthField value={l.mfg} onChange={(v) => setLine(i, { mfg: v })} label="Manufactured" bad={!!bad('Made date')} /></td>
                    <td data-label="Expiry">
                      <MonthField value={l.expiry} onChange={(v) => setLine(i, { expiry: v })} label="Expiry" bad={!!(bad('Expiry') || bad('Already'))} />
                      {c.shortExpiry && <span className="ph-field-warn"><Icon name="clock" size={11} /> Expires within 6 months</span>}
                    </td>
                    <td data-label="Qty"><input className={`field-input num ${bad('Qty')}`} type="number" min={0} value={l.qty || ''} onChange={(e) => setLine(i, { qty: num(e.target.value) })} aria-label="Quantity" /></td>
                    <td data-label="Free"><input className="field-input num" type="number" min={0} value={l.free || ''} onChange={(e) => setLine(i, { free: num(e.target.value) })} aria-label="Free quantity" /></td>
                    <td data-label="Cost each"><input className={`field-input num ${bad('Cost')}`} type="number" min={0} step="0.01" value={l.rate || ''} onChange={(e) => setLine(i, { rate: num(e.target.value) })} aria-label="Purchase rate" /></td>
                    <td data-label="Amount" className="num">{l.qty && l.rate ? inr(l.qty * l.rate) : '—'}</td>
                    <td className="ph-grn-x">
                      <button
                        className="ph-x"
                        onClick={() => set({ lines: g.lines.length > 1 ? g.lines.filter((_, j) => j !== i) : [blankLine()] })}
                        aria-label="Remove row"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {tried && (!headerOk || !linesOk) && (
          <div className="alert alert-error" style={{ marginTop: 14 }}>
            {!headerOk ? 'Enter the invoice number. ' : ''}
            {checks.map((c, i) => (c.errs.length ? `Row ${i + 1}: ${c.errs.join(', ')}. ` : '')).join('')}
          </div>
        )}

        <div className="ph-grn-foot">
          <dl className="ph-grn-sum">
            <div><dt>Rows</dt><dd>{g.lines.length}</dd></div>
            <div><dt>Units</dt><dd>{units}</dd></div>
            <div><dt>Invoice total</dt><dd>{inr(value)}</dd></div>
          </dl>
          <button className="btn btn-primary" onClick={post}>
            <span className="btn-ico"><Icon name="checkCircle" size={15} /></span>Add to stock
          </button>
        </div>
        {g.lines.some((l) => l.productId) && (
          <p className="ph-muted ph-grn-note">
            <Icon name="lock" size={12} /> Posting adds {units} units of {[...new Set(g.lines.filter((l) => l.productId).map((l) => productById(l.productId).generic))].join(', ')} to {g.location}. Posted receipts cannot be edited.
          </p>
        )}
      </section>
    </div>
  );
}
