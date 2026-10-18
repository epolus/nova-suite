/* SPDX-License-Identifier: AGPL-3.0-only */

/** Instant when `warningPct` percent of the SLA window has elapsed. */
export function warningAtMs(
  dueMs: number,
  totalMs: number,
  startedAt: number,
  warningPct: number,
): number {
  const pct = Number.isFinite(warningPct) ? Math.min(99, Math.max(1, warningPct)) : 80;
  const remainingFraction = (100 - pct) / 100;
  const span = totalMs > 0 ? totalMs : Math.max(0, dueMs - startedAt);
  return dueMs - Math.floor(span * remainingFraction);
}
