import { Icon } from './design/Icon';
import { band, daysLeft, monYr, type Batch, type Encounter, type Nurse, type RxStatus, type RxType } from './data';

type IconName = Parameters<typeof Icon>[0]['name'];

export const TYPE_ICON: Record<RxType, IconName> = {
  OP: 'stethoscope',
  IP: 'hospital',
  Emergency: 'heartPulse',
  Discharge: 'home',
};

/** Prescription type: its own validated colour, always with icon and label. */
export function TypeBadge({ type }: { type: RxType }) {
  return (
    <span className={`ph-type ph-type--${type.toLowerCase()}`}>
      <Icon name={TYPE_ICON[type]} size={13} />
      {type}
    </span>
  );
}

const STATUS_TONE: Record<RxStatus, 'info' | 'warn' | 'ok' | 'neutral' | 'billing'> = {
  New: 'info',
  Reviewing: 'neutral',
  'On hold': 'warn',
  'At billing': 'billing',
  Dispensed: 'ok',
  Partial: 'warn',
};
const STATUS_ICON: Record<RxStatus, IconName> = {
  New: 'clipboard',
  Reviewing: 'search',
  'On hold': 'pause',
  'At billing': 'receipt',
  Dispensed: 'checkCircle',
  Partial: 'alert',
};

export function Status({ status }: { status: RxStatus }) {
  return (
    <span className={`ph-status ph-status--${STATUS_TONE[status]}`}>
      <Icon name={STATUS_ICON[status]} size={12} />
      {status}
    </span>
  );
}

const ENCOUNTER: Record<Encounter, { icon: IconName; cls: string }> = {
  Outpatient: { icon: 'stethoscope', cls: 'op' },
  Inpatient: { icon: 'hospital', cls: 'ip' },
  Emergency: { icon: 'heartPulse', cls: 'emergency' },
};

/** Outpatient, inpatient or emergency: shares the queue-type colours. */
export function EncounterBadge({ encounter }: { encounter: Encounter }) {
  const e = ENCOUNTER[encounter];
  return (
    <span className={`ph-type ph-encounter ph-type--${e.cls}`}>
      <Icon name={e.icon} size={13} />
      {encounter}
    </span>
  );
}

/** The nurse medicines are issued to, with their extension. */
export function NurseLine({ nurse, compact, encounter }: { nurse: Nurse; compact?: boolean; encounter?: Encounter }) {
  return (
    <span className={`ph-nurse ${compact ? 'ph-nurse--compact' : ''}`}>
      <span className="ph-nurse-icon"><Icon name="userCheck" size={compact ? 11 : 14} /></span>
      <span className="ph-nurse-text">
        {!compact && <em>{encounter === 'Emergency' ? 'Emergency nurse' : 'Ward nurse'}</em>}
        <strong>{nurse.name}</strong>
        <span>Ext {nurse.ext}</span>
      </span>
    </span>
  );
}

/** STAT (urgent): a siren on red, named "STAT" for hover and screen readers. */
export function Stat({ count }: { count?: number }) {
  const label = count === undefined ? 'STAT' : `${count} STAT`;
  return (
    <span className={`ph-stat ${count !== undefined ? 'ph-stat--count' : ''}`} title={label} aria-label={label} role="img">
      <Icon name="siren" size={13} strokeWidth={2.2} />
      {count !== undefined && <span aria-hidden="true">{count}</span>}
    </span>
  );
}

export function Avatar({ name, type }: { name: string; type: RxType }) {
  const initials = name.startsWith('Emergency')
    ? 'ER'
    : name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className={`ph-avatar ph-type--${type.toLowerCase()}`}>{initials}</span>;
}

/** Stock against its reorder level. The tick marks the reorder point. */
export function StockGauge({ qty, reorder }: { qty: number; reorder: number }) {
  const scale = reorder * 3;
  const low = qty < reorder;
  return (
    <span className={`ph-gauge ${low ? 'is-low' : ''}`} data-tip={`${qty} in stock · reorder at ${reorder}`}>
      <span className="ph-gauge-fill" style={{ width: `${Math.min(100, (qty / scale) * 100)}%` }} />
      <span className="ph-gauge-tick" style={{ left: `${(reorder / scale) * 100}%` }} />
    </span>
  );
}

const BAND_LABEL = { expired: 'Expired', lt30: '≤ 30 days', lt90: '31–90 days', ok: 'In date' } as const;
const BAND_ICON: Record<keyof typeof BAND_LABEL, IconName> = { expired: 'ban', lt30: 'alert', lt90: 'clock', ok: 'checkCircle' };

/** Expiry month with its band shown as icon + label, never colour alone. */
export function Expiry({ batch, compact }: { batch: Batch; compact?: boolean }) {
  const bd = band(batch);
  const d = daysLeft(batch.expiry);
  return (
    <span className={`ph-exp ph-exp--${bd}`} title={d < 0 ? `Expired ${-d} days ago` : `${d} days left`}>
      <Icon name={BAND_ICON[bd]} size={12} />
      {monYr(batch.expiry)}
      {!compact && bd !== 'ok' && <em>{d < 0 ? 'Expired' : `${d} d`}</em>}
    </span>
  );
}

export function Head({ icon, title, sub, action }: { icon: IconName; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="ph-head">
      <span className="ph-head-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="ph-head-text">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </span>
      {action}
    </div>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="ph-empty">
      <span className="ph-empty-icon"><Icon name={icon} size={20} /></span>
      {text}
    </div>
  );
}

export { BAND_LABEL, BAND_ICON };
