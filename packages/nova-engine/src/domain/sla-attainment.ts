/* SPDX-License-Identifier: AGPL-3.0-only */

export type SlaOutcome = 'met' | 'breached' | 'open' | 'none';

export type SlaClockSample = {
  status: string;
  dueAt: string | null;
  completedAt: string | null;
  breached: boolean;
  pausedAt: string | null;
  terminalWhenUnresolved: boolean;
};

function ms(value: string): number {
  return new Date(value).getTime();
}

/** Due date plus an in-progress pause that started before the clock stopped. */
export function adjustedDueMs(dueAt: string, pausedAt: string | null, endedAt: string): number {
  const due = ms(dueAt);
  if (!pausedAt) return due;
  const paused = ms(pausedAt);
  const ended = ms(endedAt);
  if (Number.isFinite(paused) && paused < ended) return due + (ended - paused);
  return due;
}

export function classifySlaClock(sample: SlaClockSample, now: string): SlaOutcome {
  if (sample.status === 'cancelled' || !sample.dueAt) return 'none';
  if (sample.completedAt) {
    const onTime = ms(sample.completedAt) <= adjustedDueMs(sample.dueAt, sample.pausedAt, sample.completedAt);
    if (onTime && !sample.breached) return 'met';
    return 'breached';
  }
  if (sample.terminalWhenUnresolved) return 'breached';
  if (sample.pausedAt) return 'open';
  if (ms(sample.dueAt) < ms(now)) return 'breached';
  return 'open';
}

export function attainmentRate(met: number, breached: number): number | null {
  const decided = met + breached;
  if (decided <= 0) return null;
  return Number((met / decided).toFixed(4));
}

/** Elapsed time with completed pauses and an in-progress pause removed. */
export function pauseAdjustedElapsedMs(input: {
  startedAt: string;
  endedAt: string;
  pausedMs: number;
  pausedAt: string | null;
}): number {
  const gross = ms(input.endedAt) - ms(input.startedAt);
  let paused = Number.isFinite(input.pausedMs) && input.pausedMs > 0 ? input.pausedMs : 0;
  if (input.pausedAt) {
    const pausedAt = ms(input.pausedAt);
    const ended = ms(input.endedAt);
    if (pausedAt < ended) paused += ended - pausedAt;
  }
  return Math.max(0, gross - paused);
}

export const SLA_ATTAINMENT_COLUMNS = `
  count(*) FILTER (
    WHERE status <> 'cancelled'
      AND response_due_at IS NOT NULL
      AND responded_at IS NOT NULL
      AND response_breached = false
      AND responded_at <= response_due_at + CASE
        WHEN sla_paused_at IS NOT NULL AND sla_paused_at < responded_at
        THEN responded_at - sla_paused_at
        ELSE INTERVAL '0'
      END
  )::int AS response_met,
  count(*) FILTER (
    WHERE status <> 'cancelled'
      AND response_due_at IS NOT NULL
      AND NOT (
        responded_at IS NOT NULL
        AND response_breached = false
        AND responded_at <= response_due_at + CASE
          WHEN sla_paused_at IS NOT NULL AND sla_paused_at < responded_at
          THEN responded_at - sla_paused_at
          ELSE INTERVAL '0'
        END
      )
      AND (
        response_breached = true
        OR responded_at IS NOT NULL
        OR status IN ('resolved', 'closed')
        OR (sla_paused_at IS NULL AND response_due_at < now())
      )
  )::int AS response_breached,
  count(*) FILTER (
    WHERE status IN ('resolved', 'closed')
      AND sla_due_at IS NOT NULL
      AND resolved_at IS NOT NULL
      AND sla_breached = false
      AND resolved_at <= sla_due_at + CASE
        WHEN sla_paused_at IS NOT NULL AND sla_paused_at < resolved_at
        THEN resolved_at - sla_paused_at
        ELSE INTERVAL '0'
      END
  )::int AS resolution_met,
  count(*) FILTER (
    WHERE status <> 'cancelled'
      AND sla_due_at IS NOT NULL
      AND NOT (
        status IN ('resolved', 'closed')
        AND resolved_at IS NOT NULL
        AND sla_breached = false
        AND resolved_at <= sla_due_at + CASE
          WHEN sla_paused_at IS NOT NULL AND sla_paused_at < resolved_at
          THEN resolved_at - sla_paused_at
          ELSE INTERVAL '0'
        END
      )
      AND (
        sla_breached = true
        OR resolved_at IS NOT NULL
        OR status IN ('resolved', 'closed')
        OR (sla_paused_at IS NULL AND sla_due_at < now())
      )
  )::int AS resolution_breached,
  (
    avg(GREATEST(0,
      EXTRACT(EPOCH FROM (resolved_at - created_at))
      - (sla_paused_ms / 1000.0)
      - CASE
          WHEN sla_paused_at IS NOT NULL AND sla_paused_at < resolved_at
          THEN EXTRACT(EPOCH FROM (resolved_at - sla_paused_at))
          ELSE 0
        END
    )) FILTER (WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL)
    / 3600.0
  )::numeric(10,2) AS pause_adjusted_mttr_hours`;
