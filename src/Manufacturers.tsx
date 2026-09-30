import { Fragment, useState } from 'react';
import { Icon } from './design/Icon';
import { MANUFACTURERS, PRODUCTS, band, daysLeft, inr, monYr, productName } from './data';
import type { Store } from './store';

/** Who makes each medicine, what of theirs is in stock, and the distributor it comes through. */
export function Manufacturers({ store }: { store: Store }) {
  const [open, setOpen] = useState<string | null>(MANUFACTURERS[0].id);

  const toggle = (id: string) => setOpen(open === id ? null : id);

  const rows = MANUFACTURERS.map((m) => {
    const meds = PRODUCTS.filter((p) => p.mfr === m.id).map((p) => {
      const live = store.batches.filter((b) => b.productId === p.id && b.qty > 0 && !b.quarantined && band(b) !== 'expired');
      const next = [...live].sort((a, z) => a.expiry.getTime() - z.expiry.getTime())[0];
      const qty = store.stockOf(p.id);
      return { p, qty, value: qty * p.mrp, next, low: qty < p.reorder };
    });
    return { m, meds, units: meds.reduce((n, x) => n + x.qty, 0), value: meds.reduce((n, x) => n + x.value, 0), low: meds.filter((x) => x.low).length };
  });

  return (
    <section className="card ph-card step-enter">
      <p className="ph-mfr-note">
        <Icon name="alert" size={13} />
        Sample data. Makers and distributors shown here are examples for demonstration, not this pharmacy's supply records.
      </p>
      <div className="ph-table-wrap">
        <table className="ph-table ph-mfr-table">
          <thead>
            <tr><th>Manufacturer</th><th>Supplied through</th><th className="num">Medicines</th><th className="num">Units</th><th className="num">Value (MRP)</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(({ m, meds, units, value, low }) => (
              <Fragment key={m.id}>
                <tr
                  className={`is-link ${open === m.id ? 'is-open' : ''}`}
                  onClick={() => toggle(m.id)}
                  tabIndex={0}
                  aria-expanded={open === m.id}
                  onKeyDown={(e) => e.key === 'Enter' && toggle(m.id)}
                >
                  <td>
                    <span className="ph-mfr-name">
                      <span className="ph-mfr-icon"><Icon name="factory" size={16} /></span>
                      <span><strong>{m.name}</strong><span>{m.city}</span></span>
                    </span>
                  </td>
                  <td>{m.supplier}</td>
                  <td className="num">
                    {meds.length}
                    {low > 0 && <span className="ph-people-open ph-people-open--warn">{low} low</span>}
                  </td>
                  <td className="num">{units}</td>
                  <td className="num"><strong>{inr(value)}</strong></td>
                  <td className="ph-mfr-chev"><Icon name="chevron" size={15} /></td>
                </tr>
                {open === m.id && (
                  <tr className="ph-mfr-detail">
                    <td colSpan={6}>
                      <ul className="ph-mfr-meds">
                        {meds.map(({ p, qty, next, low: isLow }) => (
                          <li key={p.id}>
                            <button onClick={() => store.openProduct(p.id)}>
                              <span><strong>{productName(p)}</strong><span>{p.form} · {p.route}</span></span>
                              <span className={isLow ? 'ph-mfr-low' : ''}>{qty} in stock</span>
                              <span className="ph-muted">{next ? `Next expiry ${monYr(next.expiry)}${daysLeft(next.expiry) <= 90 ? ` · ${daysLeft(next.expiry)} d` : ''}` : 'No usable stock'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
