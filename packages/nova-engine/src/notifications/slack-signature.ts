/* SPDX-License-Identifier: AGPL-3.0-only */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function slackSignatureValid(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs / 1000 - ts) > 5 * 60) return false;
  const digest = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  const left = Buffer.from(digest);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
