/* SPDX-License-Identifier: AGPL-3.0-only */

/** Percent of closed standard changes that succeeded, rounded to two decimals. */
export function standardChangeSuccessRate(successCount: number, closedCount: number): number | null {
  if (!Number.isFinite(closedCount) || closedCount <= 0) return null;
  if (!Number.isFinite(successCount) || successCount < 0) return null;
  const successes = Math.min(Math.floor(successCount), Math.floor(closedCount));
  return Math.round((successes * 10000) / Math.floor(closedCount)) / 100;
}
