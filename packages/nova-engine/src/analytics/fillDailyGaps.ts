/* SPDX-License-Identifier: AGPL-3.0-only */

export type TrendPoint = { date: string; value: number };

/** Build a continuous UTC daily series with zero-filled gaps. */
export function fillDailyGaps(points: TrendPoint[], days: number): TrendPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point.value]));
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const filled: TrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - offset);
    const date = day.toISOString().slice(0, 10);
    filled.push({ date, value: byDate.get(date) ?? 0 });
  }
  return filled;
}
