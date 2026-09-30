/**
 * Needs attention: stock and workflow problems the console finds by itself.
 *
 * Deliberately operational only: expired or expiring stock, stock too short to
 * fill a waiting prescription, and orders past their turnaround target. It
 * never comments on what a doctor prescribed; clinical checks belong to the
 * pharmacist's verification on the Dispense screen.
 *
 * Every alert is derived from current state, so it disappears the moment the
 * problem is resolved (a batch removed from use, a prescription held or
 * dispensed). Each one is a single plain sentence and, where there is one, the
 * action that fixes it.
 */
import {
  DISPENSE_FROM,
  band,
  daysLeft,
  dispensable,
  duration,
  productById,
  turnaround,
  type Batch,
  type Prescription,
} from './data';

export type Level = 'stop' | 'warn' | 'info';

export interface Alert {
  id: string;
  level: Level;
  icon: 'ban' | 'clock' | 'layers';
  text: string;
  action?: { label: string; kind: 'quarantine' | 'open' | 'receive' | 'stock'; ref: string };
}


export function detectAlerts(s: { batches: Batch[]; pending: Prescription[] }): Alert[] {
  const out: Alert[] = [];

  // Expired stock still on a shelf: it must be taken out of use.
  for (const b of s.batches) {
    if (b.quarantined || b.qty === 0 || band(b) !== 'expired') continue;
    const p = productById(b.productId);
    out.push({
      id: 'exp-' + b.id,
      level: 'stop',
      icon: 'ban',
      text: `${b.batchNo} ${p.generic} expired · ${b.qty} still on the shelf`,
      action: { label: 'Remove from use', kind: 'quarantine', ref: b.id },
    });
  }

  const active = s.pending.filter((r) => r.status !== 'On hold');

  for (const r of active) {
    // Past its turnaround target (STAT or routine).
    const t = turnaround(r);
    if (t.level === 'over') {
      out.push({
        id: 'tat-' + r.id,
        level: 'warn',
        icon: 'clock',
        text: `${r.patient.name}${r.stat ? ' (STAT)' : ''} waiting ${duration(t.waited)} · target ${duration(t.target)}`,
        action: { label: 'Dispense now', kind: 'open', ref: r.id },
      });
    }

    // Not enough at the counter to fill the prescription.
    for (const l of r.lines) {
      const p = productById(l.productId);
      const counter = s.batches.filter((b) => b.productId === p.id && b.location === DISPENSE_FROM && dispensable(b)).reduce((n, b) => n + b.qty, 0);
      if (counter >= l.qty) continue;
      const store = s.batches
        .filter((b) => b.productId === p.id && b.location !== DISPENSE_FROM && !b.quarantined && band(b) !== 'expired')
        .reduce((n, b) => n + b.qty, 0);
      out.push({
        id: `short-${r.id}-${p.id}`,
        level: 'warn',
        icon: 'layers',
        text: `${r.patient.name}: ${p.generic} ${counter} of ${l.qty} in stock` + (store > 0 ? ` · ${store} in store` : ''),
        action: store > 0 ? { label: 'View stock', kind: 'stock', ref: p.id } : { label: 'Receive stock', kind: 'receive', ref: p.id },
      });
    }
  }

  // Stock close to expiry: use it first.
  for (const b of s.batches) {
    if (b.quarantined || b.qty === 0 || band(b) !== 'lt30') continue;
    const p = productById(b.productId);
    out.push({
      id: 'soon-' + b.id,
      level: 'info',
      icon: 'clock',
      text: `${b.batchNo} ${p.generic} expires in ${daysLeft(b.expiry)} d · use first`,
      action: { label: 'View', kind: 'stock', ref: p.id },
    });
  }

  const rank: Record<Level, number> = { stop: 0, warn: 1, info: 2 };
  return out.sort((a, z) => rank[a.level] - rank[z.level]);
}
