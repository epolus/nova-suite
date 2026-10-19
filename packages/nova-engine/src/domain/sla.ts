/* SPDX-License-Identifier: AGPL-3.0-only */
type SlaProcessType = 'incident' | 'request' | 'task' | 'problem' | 'change';

type SlaContext = {
  priority?: number | string | null;
  impact?: string | null;
  urgency?: string | null;
  category?: string | null;
  serviceId?: string | null;
};

export type SlaDueAts = {
  responseDueAt: string | null;
  resolutionDueAt: string | null;
  slaDefinitionId: string | null;
};

export type BusinessHourWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type BusinessCalendarData = {
  timezone: string;
  hours: BusinessHourWindow[];
  holidays: string[];
};

export type SlaClockState = {
  sla_paused_at: string | Date | null;
  sla_paused_ms: number | string | null;
  response_due_at: string | Date | null;
  sla_due_at: string | Date | null;
};

/** Pending reasons that pause the SLA clock. */
export const SLA_PAUSE_REASONS = new Set([
  'waiting_for_caller',
  'waiting_for_vendor',
  'waiting_for_change_window',
  'waiting_for_approval',
  'waiting_for_dependency',
]);

/** `sla_definitions.condition_priority` is numeric (incident P1–P5 only). Never bind text priorities (change/problem). */
function conditionPriorityParam(
  processType: SlaProcessType,
  priority: number | string | null | undefined,
): number | null {
  if (processType !== 'incident') return null;
  if (priority == null) return null;
  if (typeof priority === 'number' && Number.isFinite(priority)) return priority;
  if (typeof priority === 'string') {
    const n = Number.parseInt(priority, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTimeToMinutes(value: string): number {
  const parts = String(value).split(':');
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const s = Number(parts[2] ?? 0);
  return h * 60 + m + s / 60;
}

function zonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
  dateKey: string;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/** Approximate instant for a calendar-local wall time (handles common IANA zones). */
function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = zonedParts(new Date(utcGuess), timeZone);
  const asLocalMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMs = asLocalMs - utcGuess;
  return new Date(utcGuess - offsetMs);
}

function nextCalendarDayUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const rollover = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  return zonedLocalToUtc(
    rollover.getUTCFullYear(),
    rollover.getUTCMonth() + 1,
    rollover.getUTCDate(),
    0, 0, 0,
    timeZone,
  );
}

/**
 * Add `hours` using the given business calendar, or wall-clock if no usable calendar.
 * Exported for unit tests.
 */
export function addBusinessHours(
  from: Date,
  hours: number,
  calendar?: BusinessCalendarData | null,
): Date {
  if (!Number.isFinite(hours) || hours <= 0) return new Date(from.getTime());
  if (!calendar || !calendar.hours.length) {
    return new Date(from.getTime() + hours * 60 * 60 * 1000);
  }

  const timeZone = calendar.timezone || 'UTC';
  const holidaySet = new Set(calendar.holidays.map((h) => h.slice(0, 10)));
  let remainingMs = hours * 60 * 60 * 1000;
  let cursor = new Date(from.getTime());
  const maxIterations = 366 * 24 * 60;
  let iterations = 0;

  while (remainingMs > 0 && iterations < maxIterations) {
    iterations += 1;
    const parts = zonedParts(cursor, timeZone);

    if (holidaySet.has(parts.dateKey)) {
      cursor = nextCalendarDayUtc(parts.year, parts.month, parts.day, timeZone);
      continue;
    }

    const windows = calendar.hours
      .filter((h) => h.dayOfWeek === parts.dayOfWeek)
      .map((h) => ({
        start: parseTimeToMinutes(h.startTime),
        end: parseTimeToMinutes(h.endTime),
      }))
      .filter((w) => w.end > w.start)
      .sort((a, b) => a.start - b.start);

    if (windows.length === 0) {
      cursor = nextCalendarDayUtc(parts.year, parts.month, parts.day, timeZone);
      continue;
    }

    const currentMinutes = parts.hour * 60 + parts.minute + parts.second / 60;
    let advanced = false;

    for (const window of windows) {
      if (currentMinutes >= window.end) continue;

      if (currentMinutes < window.start) {
        const startH = Math.floor(window.start / 60);
        const startM = Math.floor(window.start % 60);
        cursor = zonedLocalToUtc(parts.year, parts.month, parts.day, startH, startM, 0, timeZone);
        advanced = true;
        break;
      }

      const availableMs = (window.end - currentMinutes) * 60 * 1000;
      if (availableMs <= 0) continue;

      if (remainingMs <= availableMs) {
        cursor = new Date(cursor.getTime() + remainingMs);
        remainingMs = 0;
        advanced = true;
        break;
      }

      remainingMs -= availableMs;
      const endH = Math.floor(window.end / 60);
      const endM = Math.floor(window.end % 60);
      cursor = zonedLocalToUtc(parts.year, parts.month, parts.day, endH, endM, 0, timeZone);
      advanced = true;
      break;
    }

    if (!advanced) {
      cursor = nextCalendarDayUtc(parts.year, parts.month, parts.day, timeZone);
    }
  }

  return cursor;
}

export async function loadDefaultBusinessCalendar(
  client: any,
): Promise<BusinessCalendarData | null> {
  const cal = await client.query(
    `SELECT id, timezone
     FROM business_calendars
     WHERE is_default = true
     ORDER BY created_at ASC
     LIMIT 1`,
  );
  const row = cal.rows?.[0];
  if (!row) return null;

  const [hoursRes, holidaysRes] = await Promise.all([
    client.query(
      `SELECT day_of_week, start_time::text AS start_time, end_time::text AS end_time
       FROM business_hours WHERE calendar_id = $1
       ORDER BY day_of_week, start_time`,
      [row.id],
    ),
    client.query(
      `SELECT holiday_date::text AS holiday_date FROM holidays WHERE calendar_id = $1`,
      [row.id],
    ),
  ]);

  return {
    timezone: String(row.timezone || 'UTC'),
    hours: (hoursRes.rows || []).map((h: any) => ({
      dayOfWeek: Number(h.day_of_week),
      startTime: String(h.start_time),
      endTime: String(h.end_time),
    })),
    holidays: (holidaysRes.rows || []).map((h: any) => String(h.holiday_date).slice(0, 10)),
  };
}

function dueIsoFromHours(
  hours: number,
  from: Date,
  calendar: BusinessCalendarData | null,
): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return addBusinessHours(from, hours, calendar).toISOString();
}

/**
 * Resolve response + resolution due timestamps from the matching active SLA definition.
 * Uses the tenant default business calendar when present; otherwise wall-clock hours.
 */
export async function resolveSlaDueAt(
  client: any,
  processType: SlaProcessType,
  context: SlaContext,
  from: Date = new Date(),
): Promise<SlaDueAts> {
  const rows = await client.query(
    `SELECT id, resolution_hours, response_hours
     FROM sla_definitions sd
     WHERE sd.process_type = $1
       AND sd.is_active = true
       AND (sd.condition_priority IS NULL OR sd.condition_priority = $2)
       AND (sd.condition_impact IS NULL OR sd.condition_impact = $3)
       AND (sd.condition_urgency IS NULL OR sd.condition_urgency = $4)
       AND (sd.condition_category IS NULL OR sd.condition_category = $5)
       AND (sd.condition_service_id IS NULL OR sd.condition_service_id = $6)
     ORDER BY sd.sort_order ASC, sd.name ASC
     LIMIT 1`,
    [
      processType,
      conditionPriorityParam(processType, context.priority ?? null),
      context.impact ?? null,
      context.urgency ?? null,
      context.category ?? null,
      context.serviceId ?? null,
    ],
  );
  const def = rows.rows?.[0];
  if (!def) {
    return { responseDueAt: null, resolutionDueAt: null, slaDefinitionId: null };
  }

  const calendar = await loadDefaultBusinessCalendar(client);
  const resolutionHours = Number(def.resolution_hours ?? 0);
  const responseHours = Number(def.response_hours ?? 0);

  return {
    responseDueAt: dueIsoFromHours(responseHours, from, calendar),
    resolutionDueAt: dueIsoFromHours(resolutionHours, from, calendar),
    slaDefinitionId: def.id ? String(def.id) : null,
  };
}

/** Alias kept for call sites that prefer the plural name. */
export const resolveSlaDueAts = resolveSlaDueAt;

export type OlaClockFields = {
  ola_group_id: string | null;
  ola_response_due_at: string | null;
  ola_resolution_due_at: string | null;
  ola_responded_at: null;
  ola_paused_at: string | null;
  ola_paused_ms: number;
};

/**
 * Handoff clock for an assignment group. Hours come from the group.
 * Due dates use the same business calendar as the customer SLA.
 * A paused handoff freezes those due dates until resume.
 */
export async function startOlaClock(
  client: any,
  groupId: string | null,
  options: { paused?: boolean; now?: Date } = {},
): Promise<OlaClockFields> {
  const now = options.now ?? new Date();
  const empty: OlaClockFields = {
    ola_group_id: null,
    ola_response_due_at: null,
    ola_resolution_due_at: null,
    ola_responded_at: null,
    ola_paused_at: null,
    ola_paused_ms: 0,
  };
  if (!groupId) return empty;

  const row = await client.query(
    `SELECT ola_response_hours, ola_resolution_hours
     FROM assignment_groups WHERE id = $1`,
    [groupId],
  );
  const hours = row.rows?.[0] as { ola_response_hours?: number | null; ola_resolution_hours?: number | null } | undefined;
  const responseHours = Number(hours?.ola_response_hours ?? 0);
  const resolutionHours = Number(hours?.ola_resolution_hours ?? 0);
  if (responseHours <= 0 && resolutionHours <= 0) return empty;

  const calendar = await loadDefaultBusinessCalendar(client);
  return {
    ola_group_id: groupId,
    ola_response_due_at: dueIsoFromHours(responseHours, now, calendar),
    ola_resolution_due_at: dueIsoFromHours(resolutionHours, now, calendar),
    ola_responded_at: null,
    ola_paused_at: options.paused ? now.toISOString() : null,
    ola_paused_ms: 0,
  };
}

export type OlaMark = 'met' | 'breached' | 'paused' | null;

/** Labels for an incident handoff clock. `now` is supplied by the caller so the UI stays pure. */
export function olaMarks(
  row: {
    ola_response_due_at?: string | Date | null;
    ola_resolution_due_at?: string | Date | null;
    ola_responded_at?: string | Date | null;
    ola_paused_at?: string | Date | null;
    resolved_at?: string | Date | null;
  },
  now: Date = new Date(),
): { response: OlaMark; resolution: OlaMark } {
  const dueMs = (value: string | Date | null | undefined): number | null => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const responseDue = dueMs(row.ola_response_due_at);
  const resolutionDue = dueMs(row.ola_resolution_due_at);
  const resolvedAt = dueMs(row.resolved_at);
  let response: OlaMark = null;
  if (responseDue != null) {
    if (row.ola_responded_at) response = 'met';
    else if (row.ola_paused_at) response = 'paused';
    else if (responseDue < now.getTime()) response = 'breached';
  }
  let resolution: OlaMark = null;
  if (resolutionDue != null) {
    if (row.ola_paused_at) resolution = 'paused';
    else if (resolvedAt != null && resolvedAt <= resolutionDue) resolution = 'met';
    else if (resolutionDue < (resolvedAt ?? now.getTime())) resolution = 'breached';
  }
  return { response, resolution };
}

export function pauseOlaClock(
  state: {
    ola_paused_at: string | Date | null;
    ola_paused_ms: number | string | null;
    ola_response_due_at: string | Date | null;
    ola_resolution_due_at: string | Date | null;
  },
  now: Date = new Date(),
) {
  const paused = pauseSlaClock({
    sla_paused_at: state.ola_paused_at,
    sla_paused_ms: state.ola_paused_ms,
    response_due_at: state.ola_response_due_at,
    sla_due_at: state.ola_resolution_due_at,
  }, now);
  return {
    ola_paused_at: paused.sla_paused_at,
    ola_paused_ms: paused.sla_paused_ms,
    ola_response_due_at: paused.response_due_at,
    ola_resolution_due_at: paused.sla_due_at,
  };
}

export function resumeOlaClock(
  state: {
    ola_paused_at: string | Date | null;
    ola_paused_ms: number | string | null;
    ola_response_due_at: string | Date | null;
    ola_resolution_due_at: string | Date | null;
  },
  now: Date = new Date(),
) {
  const resumed = resumeSlaClock({
    sla_paused_at: state.ola_paused_at,
    sla_paused_ms: state.ola_paused_ms,
    response_due_at: state.ola_response_due_at,
    sla_due_at: state.ola_resolution_due_at,
  }, now);
  return {
    ola_paused_at: resumed.sla_paused_at,
    ola_paused_ms: resumed.sla_paused_ms,
    ola_response_due_at: resumed.response_due_at,
    ola_resolution_due_at: resumed.sla_due_at,
  };
}

function toIsoOrNull(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toMs(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Pause the SLA clock: set sla_paused_at if not already paused.
 * Due dates are left unchanged until resume.
 */
export function pauseSlaClock(
  state: SlaClockState,
  now: Date = new Date(),
): {
  sla_paused_at: string;
  sla_paused_ms: number;
  response_due_at: string | null;
  sla_due_at: string | null;
} {
  if (state.sla_paused_at) {
    return {
      sla_paused_at: toIsoOrNull(state.sla_paused_at)!,
      sla_paused_ms: toMs(state.sla_paused_ms),
      response_due_at: toIsoOrNull(state.response_due_at),
      sla_due_at: toIsoOrNull(state.sla_due_at),
    };
  }
  return {
    sla_paused_at: now.toISOString(),
    sla_paused_ms: toMs(state.sla_paused_ms),
    response_due_at: toIsoOrNull(state.response_due_at),
    sla_due_at: toIsoOrNull(state.sla_due_at),
  };
}

/**
 * Resume the SLA clock: accumulate paused duration into sla_paused_ms and
 * extend response/resolution due dates by the paused duration.
 */
export function resumeSlaClock(
  state: SlaClockState,
  now: Date = new Date(),
): {
  sla_paused_at: null;
  sla_paused_ms: number;
  response_due_at: string | null;
  sla_due_at: string | null;
} {
  const pausedAt = state.sla_paused_at ? new Date(state.sla_paused_at as string | Date) : null;
  const priorMs = toMs(state.sla_paused_ms);
  if (!pausedAt || Number.isNaN(pausedAt.getTime())) {
    return {
      sla_paused_at: null,
      sla_paused_ms: priorMs,
      response_due_at: toIsoOrNull(state.response_due_at),
      sla_due_at: toIsoOrNull(state.sla_due_at),
    };
  }

  const deltaMs = Math.max(0, now.getTime() - pausedAt.getTime());
  const extend = (due: string | Date | null | undefined): string | null => {
    const iso = toIsoOrNull(due);
    if (!iso) return null;
    return new Date(new Date(iso).getTime() + deltaMs).toISOString();
  };

  return {
    sla_paused_at: null,
    sla_paused_ms: priorMs + deltaMs,
    response_due_at: extend(state.response_due_at),
    sla_due_at: extend(state.sla_due_at),
  };
}

export function shouldPauseSlaForPending(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return SLA_PAUSE_REASONS.has(String(reason).trim());
}
