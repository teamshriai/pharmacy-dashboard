/**
 * Dashboard charts, drawn in HTML so every mark has a hover label, keyboard
 * focus and theme colours. Each chart answers one question and carries its
 * numbers as text, so nothing relies on colour alone.
 */
import { useState } from 'react';
import { Icon } from './design/Icon';
import { YESTERDAY_BILLED_SO_FAR, band, daysLeft, earlierByHour, inr, lastDays, type Batch, type Bill, type Payment } from './data';

// ------------------------------------------------------------ footprints

const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;

type View = 'day' | 'week' | 'month';
/** title is the chart's accessible name and hover text. */
const VIEWS: { key: View; label: string; title: string; total: string }[] = [
  { key: 'day', label: 'Today', title: 'Footprints per hour', total: 'today' },
  { key: 'week', label: 'Week', title: 'Footprints per day, last 7 days', total: 'this week' },
  { key: 'month', label: 'Month', title: 'Footprints per day, last 30 days', total: 'this month' },
];

/**
 * Footprints: patients served at the counter (one per dispensed prescription).
 * Today by hour (the current hour is live), the last 7 days, or the last 30.
 * Click an hour to see the week; click today's column to go back to hours.
 */
export function FootprintsChart({ times, today, onOpen }: { times: Date[]; today: number; onOpen: () => void }) {
  const [view, setView] = useState<View>('day');
  const now = new Date();
  const v = VIEWS.find((x) => x.key === view)!;

  const hours = [...earlierByHour(now), { hour: now.getHours(), count: 0 }];
  for (const t of times) {
    const h = hours.find((x) => x.hour === t.getHours());
    if (h) h.count += 1;
  }

  const cols =
    view === 'day'
      ? hours.map((h, i) => {
          const current = i === hours.length - 1;
          return { key: String(h.hour), x: current ? 'Now' : hourLabel(h.hour), name: hourLabel(h.hour), count: h.count, current, tip: current ? ' (this hour)' : '' };
        })
      : lastDays(view === 'week' ? 7 : 30, today, now).map((d, i, all) => {
          const name = d.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
          // A month has too many columns to label each; mark every fifth day counting back from today.
          const x = d.today ? 'Today' : view === 'week' ? d.date.toLocaleDateString('en-IN', { weekday: 'short' }) : (all.length - 1 - i) % 5 === 0 ? String(d.date.getDate()) : '';
          return { key: d.date.toDateString(), x, name, count: d.count, current: d.today, tip: d.today ? ' (today so far)' : '' };
        });

  const max = Math.max(4, ...cols.map((c) => c.count));
  const peak = cols.reduce((a, b) => (b.count > a.count ? b : a));
  const total = cols.reduce((n, c) => n + c.count, 0);

  return (
    <section className="card ph-card ph-chart" aria-label={v.title}>
      <header className="ph-chart-head">
        {/* The switch names the period, so the title stays short. */}
        <h2 title={v.title}>Footprints</h2>
        <span className="ph-chart-tools">
          <span className="ph-toggle" role="group" aria-label="Period">
            {VIEWS.map((x) => (
              <button key={x.key} className={view === x.key ? 'is-on' : ''} aria-pressed={view === x.key} onClick={() => setView(x.key)}>{x.label}</button>
            ))}
          </span>
          <button className="btn-text" onClick={onOpen}>{total.toLocaleString('en-IN')} {v.total}</button>
        </span>
      </header>
      <div className={`ph-bars ph-bars--${view}`} role="list">
        {cols.map((c) => {
          const clickable = view === 'day' || c.current;
          const hint = view === 'day' ? ' · click for the week' : c.current ? ' · click for hours' : '';
          return (
            <div key={c.key} className={`ph-bar-col ${c.current ? 'is-now' : ''}`} role="listitem">
              <span className="ph-bar-track">
                <button
                  className={`ph-bar ${clickable ? 'is-click' : ''}`}
                  style={{ height: `${(c.count / max) * 100}%` }}
                  data-tip={`${c.name}: ${c.count} served${c.tip}${hint}`}
                  aria-label={`${c.name}: ${c.count} served`}
                  onClick={clickable ? () => setView(view === 'day' ? 'week' : 'day') : undefined}
                  tabIndex={clickable ? 0 : -1}
                >
                  {(view === 'week' || c.current || c === peak) && <em>{c.count}</em>}
                </button>
              </span>
              <span className="ph-bar-x">{c.x}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ today's report

const METHODS: { key: Payment; label: string; cls: string }[] = [
  { key: 'UPI', label: 'UPI', cls: 'upi' },
  { key: 'Card', label: 'Card', cls: 'card' },
  { key: 'Credit', label: 'Credit', cls: 'credit' },
  { key: 'Account', label: 'Hospital bill', cls: 'account' },
];

const RING = { size: 112, width: 8, gap: 3 };

/**
 * Today's report: the day's billing in one small card. One ring per payment
 * method, outer to inner in a fixed order; each ring fills to that method's
 * share of the total. Exact amounts sit in the legend beside it.
 */
export function TodayReport({ bills, onOpen }: { bills: Bill[]; onOpen: () => void }) {
  const total = bills.reduce((n, b) => n + b.total, 0);
  const parts = METHODS.map((m) => {
    const amount = bills.filter((b) => b.payment === m.key).reduce((n, b) => n + b.total, 0);
    return { ...m, amount, share: total ? amount / total : 0 };
  });
  const change = YESTERDAY_BILLED_SO_FAR ? Math.round(((total - YESTERDAY_BILLED_SO_FAR) / YESTERDAY_BILLED_SO_FAR) * 100) : 0;
  const c = RING.size / 2;

  return (
    <section className="card ph-card ph-chart ph-report" aria-label="Today's report">
      <header className="ph-chart-head">
        <h2>Today's report</h2>
        <button className="btn-text" onClick={onOpen}>Billing</button>
      </header>
      <div className="ph-report-body">
        <svg className="ph-rings" viewBox={`0 0 ${RING.size} ${RING.size}`} role="img" aria-label={parts.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(', ')}>
          {parts.map((p, i) => {
            const r = c - RING.width / 2 - i * (RING.width + RING.gap);
            const len = 2 * Math.PI * r;
            return (
              <g key={p.key} className={`ph-pay--${p.cls}`}>
                <circle className="ph-ring-track" cx={c} cy={c} r={r} strokeWidth={RING.width} />
                {p.share > 0 && (
                  <circle
                    className="ph-ring-arc"
                    cx={c}
                    cy={c}
                    r={r}
                    strokeWidth={RING.width}
                    strokeDasharray={`${Math.max(p.share * len, 0.5)} ${len}`}
                    transform={`rotate(-90 ${c} ${c})`}
                  >
                    <title>{`${p.label}: ${inr(p.amount)} (${Math.round(p.share * 100)}%)`}</title>
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
        <div className="ph-report-total">
          <span className="ph-report-label">Total billed</span>
          <strong>{inr(total)}</strong>
          <span className={`ph-report-change ${change >= 0 ? 'is-up' : 'is-down'}`} title="Compared with the same time yesterday">
            <Icon name="arrow" size={12} />
            {Math.abs(change)}%
            <em>vs yesterday</em>
          </span>
        </div>
      </div>
      <ul className="ph-pay-legend ph-report-legend">
        {parts.map((p) => (
          <li key={p.key} className={p.amount ? '' : 'is-zero'}>
            <span className={`ph-pay-key ph-pay--${p.cls}`} />
            <span>{p.label}</span>
            <strong>{inr(p.amount)}</strong>
            <em>{Math.round(p.share * 100)}%</em>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------ expiry

type Bin = { key: string; label: string; test: (d: number) => boolean; tone: 'danger' | 'warn' | 'amber' | 'calm'; filter: 'expired' | 'expiring' | 'all' };
const BINS: Bin[] = [
  { key: 'exp', label: 'Expired', test: (d) => d < 0, tone: 'danger', filter: 'expired' },
  { key: '30', label: '≤ 30 d', test: (d) => d >= 0 && d <= 30, tone: 'warn', filter: 'expiring' },
  { key: '90', label: '31–90 d', test: (d) => d > 30 && d <= 90, tone: 'amber', filter: 'expiring' },
  { key: '180', label: '3–6 mo', test: (d) => d > 90 && d <= 182, tone: 'calm', filter: 'all' },
  { key: '365', label: '6–12 mo', test: (d) => d > 182 && d <= 365, tone: 'calm', filter: 'all' },
  { key: 'later', label: '> 1 yr', test: (d) => d > 365, tone: 'calm', filter: 'all' },
];

/** How much stock expires when: batches by time to expiry. The first three need action. */
export function ExpiryChart({ batches, onOpen }: { batches: Batch[]; onOpen: (f: Bin['filter']) => void }) {
  const live = batches.filter((b) => !b.quarantined && b.qty > 0);
  const counts = BINS.map((bin) => ({ bin, n: live.filter((b) => bin.test(daysLeft(b.expiry))).length }));
  const max = Math.max(1, ...counts.map((c) => c.n));
  const urgent = live.filter((b) => band(b) !== 'ok').length;

  return (
    <section className="card ph-card ph-chart" aria-label="Expiry outlook">
      <header className="ph-chart-head">
        <h2>Expiry outlook</h2>
        <button className="btn-text" onClick={() => onOpen('expiring')}>{urgent} need action</button>
      </header>
      <div className="ph-bars ph-bars--expiry" role="list">
        {counts.map(({ bin, n }) => (
          <div key={bin.key} className="ph-bar-col" role="listitem">
            <span className="ph-bar-track">
              <button
                className={`ph-bar ph-bar--${bin.tone}`}
                style={{ height: `${Math.max(n ? 6 : 0, (n / max) * 100)}%` }}
                data-tip={`${bin.label}: ${n} batch${n === 1 ? '' : 'es'}`}
                aria-label={`${bin.label}: ${n} batches`}
                onClick={() => onOpen(bin.filter)}
              >
                <em>{n}</em>
              </button>
            </span>
            <span className="ph-bar-x">{bin.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
