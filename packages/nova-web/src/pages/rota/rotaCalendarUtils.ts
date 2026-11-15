/* SPDX-License-Identifier: AGPL-3.0-only */
import type { RotaShift } from '../../api/domains/rota';
import { toDatetimeLocalValue } from '../../utils/dateTime';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type ShiftForm = {
  id?: string;
  assignment_group_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  notes: string;
  business_calendar_id: string;
};

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const start = addDays(first, -startDow);
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) grid.push(addDays(start, i));
  return grid;
}

export function emptyShiftForm(): ShiftForm {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = addDays(start, 1);
  return {
    assignment_group_id: '',
    user_id: '',
    starts_at: toDatetimeLocalValue(start),
    ends_at: toDatetimeLocalValue(end),
    notes: '',
    business_calendar_id: '',
  };
}

export function groupShiftsByDay(shifts: RotaShift[]): Map<string, RotaShift[]> {
  const map = new Map<string, RotaShift[]>();
  for (const s of shifts) {
    const start = dayStart(new Date(s.starts_at));
    const end = dayStart(new Date(s.ends_at));
    const last = new Date(s.ends_at).getTime() === dayStart(new Date(s.ends_at)).getTime()
      ? addDays(end, -1)
      : end;
    let cursor = start;
    while (cursor <= last) {
      const key = toDateKey(cursor);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
      cursor = addDays(cursor, 1);
    }
  }
  return map;
}
