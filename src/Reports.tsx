import { useState } from 'react';
import { Icon } from './design/Icon';
import { LOCATIONS, PRODUCTS, band, inr, productById, productName } from './data';
import { Empty } from './parts';
import type { Store } from './store';
import { saveBlob } from './download';

type Tab = 'sales' | 'gst' | 'stock';
const TABS: { key: Tab; label: string; icon: 'pill' | 'receipt' | 'layers' }[] = [
  { key: 'sales', label: 'Sales by medicine', icon: 'pill' },
  { key: 'gst', label: 'GST summary', icon: 'receipt' },
  { key: 'stock', label: 'Stock value', icon: 'layers' },
];

const round = (n: number) => Math.round(n * 100) / 100;

/** A CSV the accounts team can open in a spreadsheet. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const text = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // The byte-order mark tells Excel the file is UTF-8, so ₹ and non-English names survive.
  saveBlob(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }), `${name}-${new Date().toISOString().slice(0, 10)}.csv`);
}

/** Today's reports: what was sold, the tax on it, and what stock is worth. Each one downloads as CSV. */
export function Reports({ store }: { store: Store }) {
  const [tab, setTab] = useState<Tab>('sales');
  const lines = store.bills.flatMap((b) => b.lines);

  const sales = [...new Set(lines.map((l) => l.productId))]
    .map((id) => {
      const ls = lines.filter((l) => l.productId === id);
      return { p: productById(id), qty: ls.reduce((n, l) => n + l.qty, 0), amount: round(ls.reduce((n, l) => n + l.amount, 0)), tax: round(ls.reduce((n, l) => n + l.tax, 0)) };
    })
    .sort((a, z) => z.amount - a.amount);

  const gst = [...new Set(lines.map((l) => l.gst))]
    .sort((a, z) => a - z)
    .map((rate) => {
      const ls = lines.filter((l) => l.gst === rate);
      return { rate, taxable: round(ls.reduce((n, l) => n + l.taxable, 0)), tax: round(ls.reduce((n, l) => n + l.tax, 0)), amount: round(ls.reduce((n, l) => n + l.amount, 0)) };
    });

  const value = (keep: (b: (typeof store.batches)[number]) => boolean) =>
    round(store.batches.filter((b) => b.qty > 0 && keep(b)).reduce((n, b) => n + b.qty * productById(b.productId).mrp, 0));
  const usable = (b: (typeof store.batches)[number]) => !b.quarantined && band(b) !== 'expired';
  const stock = LOCATIONS.map((loc) => ({
    loc,
    items: new Set(store.batches.filter((b) => b.location === loc && b.qty > 0 && usable(b)).map((b) => b.productId)).size,
    units: store.batches.filter((b) => b.location === loc && usable(b)).reduce((n, b) => n + b.qty, 0),
    value: value((b) => b.location === loc && usable(b)),
    lost: value((b) => b.location === loc && !usable(b)),
  }));

  const total = round(store.bills.reduce((n, b) => n + b.total, 0));
  const tax = round(store.bills.reduce((n, b) => n + b.tax, 0));
  const kpis = [
    { icon: 'receipt' as const, tone: 'green', value: inr(total), label: 'Sales today' },
    { icon: 'clipboard' as const, tone: 'sky', value: inr(tax), label: 'GST collected' },
    { icon: 'pill' as const, tone: 'violet', value: String(lines.reduce((n, l) => n + l.qty, 0)), label: 'Units sold' },
    { icon: 'layers' as const, tone: 'teal', value: inr(stock.reduce((n, s) => n + s.value, 0)), label: 'Stock value (MRP)' },
  ];

  function exportTab() {
    if (tab === 'sales') downloadCsv('sales-by-medicine', [['Medicine', 'Qty', 'Amount', 'GST'], ...sales.map((s) => [productName(s.p), s.qty, s.amount, s.tax])]);
    else if (tab === 'gst') downloadCsv('gst-summary', [['GST rate', 'Taxable', 'GST', 'Total'], ...gst.map((g) => [`${g.rate}%`, g.taxable, g.tax, g.amount])]);
    else downloadCsv('stock-value', [['Location', 'Medicines', 'Units', 'Value (MRP)', 'Not usable'], ...stock.map((s) => [s.loc, s.items, s.units, s.value, s.lost])]);
  }

  return (
    <div className="ph-stack step-enter">
      <div className="ph-kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`ph-kpi ph-kpi--static tone-${k.tone}`}>
            <span className="ph-kpi-icon"><Icon name={k.icon} size={18} /></span>
            <span className="ph-kpi-value ph-kpi-value--money">{k.value}</span>
            <span className="ph-kpi-label">{k.label}</span>
          </div>
        ))}
      </div>

      <section className="card ph-card">
        <div className="ph-queue-bar">
          <div className="ph-chips" role="tablist" aria-label="Report">
            {TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`ph-chip ${tab === t.key ? 'ph-chip--on' : ''}`} onClick={() => setTab(t.key)}>
                <Icon name={t.icon} size={13} />{t.label}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary ph-small-btn" onClick={exportTab}>
            <span className="btn-ico"><Icon name="download" size={14} /></span>Download CSV
          </button>
        </div>

        {tab === 'sales' && (sales.length === 0 ? <Empty icon="receipt" text="Nothing sold yet today." /> : (
          <div className="ph-table-wrap">
          <table className="ph-table ph-report-table">
            <thead><tr><th>Medicine</th><th className="num">Qty</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.p.id} className="is-link" onClick={() => store.openProduct(s.p.id)}>
                  <td data-label="Medicine">{productName(s.p)}<span className="ph-muted"> · {s.p.form}</span></td>
                  <td data-label="Qty" className="num">{s.qty}</td>
                  <td data-label="GST" className="num">{inr(s.tax)}</td>
                  <td data-label="Amount" className="num"><strong>{inr(s.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td data-label="Medicine">Total</td><td data-label="Qty" className="num">{sales.reduce((n, s) => n + s.qty, 0)}</td><td data-label="GST" className="num">{inr(tax)}</td><td data-label="Amount" className="num">{inr(total)}</td></tr></tfoot>
          </table>
          </div>
        ))}

        {tab === 'gst' && (gst.length === 0 ? <Empty icon="receipt" text="No sales, so no GST yet." /> : (
          <div className="ph-table-wrap">
          <table className="ph-table ph-report-table">
            <thead><tr><th>GST rate</th><th className="num">Taxable value</th><th className="num">GST</th><th className="num">Total</th></tr></thead>
            <tbody>
              {gst.map((g) => (
                <tr key={g.rate}>
                  <td data-label="GST rate">{g.rate}%<span className="ph-muted"> · CGST {g.rate / 2}% + SGST {g.rate / 2}%</span></td>
                  <td data-label="Taxable value" className="num">{inr(g.taxable)}</td>
                  <td data-label="GST" className="num">{inr(g.tax)}</td>
                  <td data-label="Total" className="num"><strong>{inr(g.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td data-label="GST rate">Total</td><td data-label="Taxable value" className="num">{inr(round(gst.reduce((n, g) => n + g.taxable, 0)))}</td><td data-label="GST" className="num">{inr(tax)}</td><td data-label="Total" className="num">{inr(total)}</td></tr></tfoot>
          </table>
          </div>
        ))}

        {tab === 'stock' && (
          <div className="ph-table-wrap">
          <table className="ph-table ph-report-table">
            <thead><tr><th>Location</th><th className="num">Medicines</th><th className="num">Units</th><th className="num">Not usable</th><th className="num">Value (MRP)</th></tr></thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.loc} className="is-link" onClick={() => { store.go('stock', 'all'); store.setStockLoc(s.loc); }}>
                  <td data-label="Location">{s.loc}</td>
                  <td data-label="Medicines" className="num">{s.items} of {PRODUCTS.length}</td>
                  <td data-label="Units" className="num">{s.units}</td>
                  <td data-label="Not usable" className={`num ${s.lost ? 'ph-report-lost' : ''}`} title="Expired or removed from use">{inr(s.lost)}</td>
                  <td data-label="Value (MRP)" className="num"><strong>{inr(s.value)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td data-label="Location">Total</td>
                <td data-label="Medicines" className="num" />
                <td data-label="Units" className="num">{stock.reduce((n, s) => n + s.units, 0)}</td>
                <td data-label="Not usable" className="num">{inr(round(stock.reduce((n, s) => n + s.lost, 0)))}</td>
                <td data-label="Value (MRP)" className="num">{inr(round(stock.reduce((n, s) => n + s.value, 0)))}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
