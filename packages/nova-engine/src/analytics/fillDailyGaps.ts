/* SPDX-License-Identifier: AGPL-3.0-only */

export type TrendPoint = { date: string; value: number };

/** Build a continuous UTC daily series; zero-filled gaps by default, or carry-forward for snapshots. */
export function fillDailyGaps(
  points: TrendPoint[],
  days: number,
  mode: 'zero' | 'carry_forward' = 'zero',
): TrendPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point.value]));
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const filled: TrendPoint[] = [];
  let lastValue = 0;
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - offset);
    const date = day.toISOString().slice(0, 10);
    if (byDate.has(date)) {
      lastValue = byDate.get(date)!;
    } else if (mode === 'zero') {
      lastValue = 0;
    }
    filled.push({ date, value: lastValue });
  }
  return filled;
}
