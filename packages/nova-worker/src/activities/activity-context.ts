/* SPDX-License-Identifier: AGPL-3.0-only */
import { CancelledFailure, Context } from '@temporalio/activity';

const HEARTBEAT_INTERVAL_MS = 15_000;

function currentContext(): Context | null {
  try {
    return Context.current();
  } catch {
    // Outside an activity context (tests, direct calls).
    return null;
  }
}

export function activityHeartbeat(detail?: unknown): void {
  currentContext()?.heartbeat(detail);
}

/**
 * Throws once Temporal has cancelled this attempt (including heartbeat timeouts),
 * so loops stop writing while a retry may already be running.
 */
export function throwIfActivityCancelled(): void {
  const signal = currentContext()?.cancellationSignal;
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new CancelledFailure('Activity cancelled');
}

/**
 * Heartbeats on an interval while `fn` runs. Proves the worker is alive during
 * long single calls (downloads, IMAP sessions) that cannot heartbeat themselves.
 */
export async function withActivityHeartbeat<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = currentContext();
  if (!ctx) return fn();
  ctx.heartbeat();
  const timer = setInterval(() => ctx.heartbeat(), HEARTBEAT_INTERVAL_MS);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}

/** Stable across retries of the same workflow run; `attempt` grows with each retry. */
export function activityExecution(): { key: string; attempt: number } | null {
  const ctx = currentContext();
  const execution = ctx?.info.workflowExecution;
  if (!ctx || !execution) return null;
  return { key: `${execution.workflowId}/${execution.runId}`, attempt: ctx.info.attempt };
}
