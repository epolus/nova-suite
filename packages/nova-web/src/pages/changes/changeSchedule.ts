/* SPDX-License-Identifier: AGPL-3.0-only */

export function hasInvalidScheduleRange(start: string, end: string): boolean {
  if (!start || !end) return false;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return endMs < startMs;
}
