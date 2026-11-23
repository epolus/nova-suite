/* SPDX-License-Identifier: AGPL-3.0-only */

export type SlaTone = 'none' | 'breached' | 'soon' | 'ok';

export function slaCountdown(
  dueAt: string | null,
  breached: boolean,
  now: number,
): { tone: SlaTone; minutes: number } {
  if (!dueAt && !breached) return { tone: 'none', minutes: 0 };
  const due = dueAt ? new Date(dueAt).getTime() : Number.NaN;
  if (Number.isNaN(due)) {
    return breached ? { tone: 'breached', minutes: 0 } : { tone: 'none', minutes: 0 };
  }
  const minutes = Math.round((due - now) / 60000);
  if (breached || minutes <= 0) return { tone: 'breached', minutes: Math.abs(minutes) };
  if (minutes <= 30) return { tone: 'soon', minutes };
  return { tone: 'ok', minutes };
}
