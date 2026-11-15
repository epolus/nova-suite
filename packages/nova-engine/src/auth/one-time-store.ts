/* SPDX-License-Identifier: AGPL-3.0-only */
// Short-lived, single-use values (OIDC state, SSO exchange codes).
// Redis makes them visible to every engine replica; without Redis they live in
// this process only, which requires sticky sessions when running several replicas.

import { cachePutOnce, cacheTakeJson } from '../cache/redis';

export class OneTimeStore<T> {
  private readonly memory = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly prefix: string, private readonly ttlMs: number) {}

  async put(key: string, value: T): Promise<void> {
    const storedInRedis = await cachePutOnce(this.redisKey(key), value, Math.ceil(this.ttlMs / 1000));
    if (storedInRedis) return;
    this.sweep();
    this.memory.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async take(key: string): Promise<T | null> {
    const fromRedis = await cacheTakeJson<T>(this.redisKey(key));
    if (fromRedis !== null) return fromRedis;
    const entry = this.memory.get(key);
    if (!entry) return null;
    this.memory.delete(key);
    return entry.expiresAt > Date.now() ? entry.value : null;
  }

  private redisKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt <= now) this.memory.delete(key);
    }
  }
}
