/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Incident service shared types ───

/** Authenticated caller as seen by incident services (no Express types). */
export interface IncidentActor {
  id: string;
  tenant_id: string;
  /** admin / fulfiller */
  isFulfiller: boolean;
}

/**
 * Early-exit HTTP outcome (403/400 ...) that routes translate into
 * `res.status(status).json({ error })`. Unexpected failures still throw.
 */
export interface IncidentHttpFailure {
  ok: false;
  status: number;
  error: string;
}

export type IncidentServiceResult<T> = { ok: true; data: T } | IncidentHttpFailure;

export const FORBIDDEN_INSUFFICIENT: IncidentHttpFailure = {
  ok: false,
  status: 403,
  error: 'Insufficient permissions',
};
