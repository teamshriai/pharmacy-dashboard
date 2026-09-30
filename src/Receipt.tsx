import type { ReactNode } from 'react';
import { Icon } from './design/Icon';
import { accountOf, hhmm, inr, placeOf, productById, productName, type Bill } from './data';
import { downloadBill } from './billPdf';

const when = (d: Date) => `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${hhmm(d)}`;

/** How the bill was settled, in words a patient would recognise. */
export const methodOf = (b: Bill) =>
  b.payment === 'Account' ? `Hospital account · ${accountOf(b.patient)}` : b.payment === 'Credit' ? 'Credit' : b.payment;

/**
 * The confirmation shown once a bill is settled: the outcome first, then the
 * references a patient or auditor asks for, then the items.
 */
export function TransactionReceipt({ bill, notes, actions }: { bill: Bill; notes?: ReactNode; actions?: ReactNode }) {
  const paid = bill.status === 'Paid';
  const p = bill.patient;
  const facts: [string, ReactNode][] = [
    ['Transaction ID', <span className="mono">{bill.txnId}</span>],
    ['Bill no.', <span className="mono">{bill.no}</span>],
    ['Date & time', when(bill.at)],
    ['Payment method', methodOf(bill)],
    ['Patient', <>{p.name} <span className="ph-muted mono">{p.mrn}</span></>],
    ['Prescription', <>{bill.rxId} · {bill.doctor}</>],
  ];

  return (
    <section className="card ph-card ph-txn step-enter" aria-label={`Transaction ${bill.txnId}`}>
      <div className="ph-txn-hero">
        <div className="success-ring">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path className="success-tick" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 className="ph-txn-title">{paid ? 'Payment successful' : 'Transaction successful'}</h2>
        <p className="ph-txn-amount">{inr(bill.total)}</p>
        <p className="ph-muted">
          {paid ? `Paid by ${bill.payment}` : `Charged to ${accountOf(p)} · paid at discharge`}
        </p>
      </div>

      <dl className="ph-txn-facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {bill.issuedTo && (
        <p className="ph-issued ph-txn-issued"><Icon name="userCheck" size={14} /> Issued to {bill.issuedTo.name} · {placeOf(p)}</p>
      )}

      <div className="ph-table-wrap">
        <table className="ph-table ph-txn-lines">
          <thead><tr><th>Medicine</th><th>Batch</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {bill.lines.map((l, i) => (
              <tr key={i}>
                <td>{productName(productById(l.productId))}</td>
                <td className="mono">{l.batchNo}</td>
                <td className="num">{l.qty}</td>
                <td className="num">{inr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ph-txn-tax">
              <td colSpan={3}>Includes GST · CGST {inr(bill.tax / 2)} + SGST {inr(bill.tax / 2)}</td>
              <td className="num">{inr(bill.tax)}</td>
            </tr>
            <tr><td colSpan={3}>{paid ? 'Total paid' : 'Total charged'}</td><td className="num">{inr(bill.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      {notes}

      <div className="ph-txn-actions">
        <button className="btn btn-primary" onClick={() => downloadBill(bill)}>
          <span className="btn-ico"><Icon name="download" size={15} /></span>Download bill (PDF)
        </button>
        {actions}
      </div>
    </section>
  );
}
