/* SPDX-License-Identifier: AGPL-3.0-only */

export type RotaBusinessHour = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type RotaBusinessCalendar = {
  id: string;
  name: string;
  timezone: string;
  is_default: boolean;
  hours: RotaBusinessHour[];
  holidays: string[];
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function addDaysKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(y!, mo! - 1, d! + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function dayOfWeek(dateKey: string): number {
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(y!, mo! - 1, d!).getDay(); // 0=Sun
}

function isHoliday(calendar: RotaBusinessCalendar, dateKey: string): boolean {
  return calendar.holidays.some((h) => h.slice(0, 10) === dateKey);
}

function hoursForDay(calendar: RotaBusinessCalendar, dateKey: string): RotaBusinessHour[] {
  if (isHoliday(calendar, dateKey)) return [];
  const dow = dayOfWeek(dateKey);
  return calendar.hours.filter((h) => h.day_of_week === dow);
}

function latestEnd(hours: RotaBusinessHour[]): string | null {
  if (hours.length === 0) return null;
  return hours.map((h) => String(h.end_time).slice(0, 5)).sort().at(-1) ?? null;
}

function earliestStart(hours: RotaBusinessHour[]): string | null {
  if (hours.length === 0) return null;
  return hours.map((h) => String(h.start_time).slice(0, 5)).sort()[0] ?? null;
}

function atLocal(dateKey: string, hm: string): string {
  return `${dateKey}T${String(hm).slice(0, 5)}`;
}

/**
 * Outside-working-hours window for a calendar day:
 * starts at that day's business end (or previous business day's end if the day is closed),
 * ends at the next open day's business start.
 */
export function outsideWorkingHoursWindow(
  dateKey: string,
  calendar: RotaBusinessCalendar,
): { starts_at: string; ends_at: string } | null {
  if (!calendar.hours.length) return null;

  let startDay = dateKey;
  let startHm = latestEnd(hoursForDay(calendar, dateKey));
  if (!startHm) {
    for (let i = 1; i <= 14; i++) {
      const prev = addDaysKey(dateKey, -i);
      const end = latestEnd(hoursForDay(calendar, prev));
      if (end) {
        startDay = prev;
        startHm = end;
        break;
      }
    }
  }
  if (!startHm) return null;

  let endDay: string | null = null;
  let endHm: string | null = null;
  for (let i = 1; i <= 14; i++) {
    const next = addDaysKey(startDay, i);
    const start = earliestStart(hoursForDay(calendar, next));
    if (start) {
      endDay = next;
      endHm = start;
      break;
    }
  }
  if (!endDay || !endHm) return null;

  return {
    starts_at: atLocal(startDay, startHm),
    ends_at: atLocal(endDay, endHm),
  };
}
