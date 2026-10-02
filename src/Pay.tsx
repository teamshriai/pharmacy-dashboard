import { useMemo } from 'react';
import { Icon } from './design/Icon';
import { inr } from './data';

/**
 * The counter payment step: a QR to scan for UPI, or the card machine for a
 * card. Once the patient has paid, the pharmacist confirms and the receipt
 * follows.
 *
 * The QR is a drawn placeholder that encodes nothing. A real UPI code must come
 * from a payment gateway for the hospital's own account, which would also
 * confirm payment by itself instead of the "Payment received" button.
 */
export function PayPanel({
  method,
  amount,
  reference,
  onPaid,
  onCancel,
}: {
  method: 'UPI' | 'Card';
  amount: number;
  reference: string;
  onPaid: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="ph-paynow step-enter" role="dialog" aria-label={method === 'UPI' ? 'Scan to pay' : 'Card payment'}>
      <p className="ph-paynow-title">{method === 'UPI' ? 'Scan to pay' : 'Card payment'}</p>
      <p className="ph-paynow-amount">{inr(amount)}</p>

      {method === 'UPI' ? (
        <>
          <SampleQr seed={reference + amount} />
          <p className="ph-paynow-hint">Ask the patient to scan with any UPI app.</p>
        </>
      ) : (
        <>
          <span className="ph-paynow-card"><Icon name="card" size={34} strokeWidth={1.6} /></span>
          <p className="ph-paynow-hint">Tap, insert or swipe the card on the machine.</p>
        </>
      )}

      <p className="ph-paynow-wait"><span className="ph-spinner" aria-hidden="true" /> Waiting for payment</p>

      <button className="btn btn-primary ph-block" onClick={onPaid}>
        <span className="btn-ico"><Icon name="checkCircle" size={15} /></span>Payment received
      </button>
      <button className="btn-text ph-paynow-cancel" onClick={onCancel}>Cancel</button>
      {method === 'UPI' && <p className="ph-paynow-note">Sample QR · no real payment</p>}
    </div>
  );
}

/** A QR-style pattern, fixed for a given bill, that deliberately encodes nothing. */
function SampleQr({ seed }: { seed: string }) {
  const N = 25;
  const cells = useMemo(() => {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const next = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };
    // Leave the three corner squares (and their quiet border) for the finder marks.
    const finder = (x: number, y: number) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    const out: [number, number][] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!finder(x, y) && next() < 0.48) out.push([x, y]);
    return out;
  }, [seed]);

  return (
    <svg className="ph-qr" viewBox={`-1 -1 ${N + 2} ${N + 2}`} role="img" aria-label="Sample payment QR code">
      <rect x={-1} y={-1} width={N + 2} height={N + 2} rx={2} fill="#fff" />
      <g fill="currentColor">
        {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />)}
      </g>
      <Finder x={0} y={0} />
      <Finder x={N - 7} y={0} />
      <Finder x={0} y={N - 7} />
    </svg>
  );
}

/** QR corner mark: dark 7×7, white 5×5, dark 3×3. */
function Finder({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={7} height={7} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </>
  );
}
