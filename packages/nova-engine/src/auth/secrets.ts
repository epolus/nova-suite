/* SPDX-License-Identifier: AGPL-3.0-only */
import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time comparison that does not leak the expected secret's length. */
export function secretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
