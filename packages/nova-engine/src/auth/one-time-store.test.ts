/* SPDX-License-Identifier: AGPL-3.0-only */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  available: false,
  data: new Map<string, string>(),
}));

vi.mock('../cache/redis', () => ({
  cachePutOnce: vi.fn(async (key: string, value: unknown) => {
    if (!redis.available) return false;
    redis.data.set(key, JSON.stringify(value));
    return true;
  }),
  cacheTakeJson: vi.fn(async (key: string) => {
    if (!redis.available) return null;
    const raw = redis.data.get(key);
    redis.data.delete(key);
    return raw ? JSON.parse(raw) : null;
  }),
}));

const { OneTimeStore } = await import('./one-time-store');

beforeEach(() => {
  redis.available = false;
  redis.data.clear();
  vi.useRealTimers();
});

describe('OneTimeStore', () => {
  it('returns a value once from memory when Redis is unavailable', async () => {
    const store = new OneTimeStore<{ n: number }>('test', 1000);
    await store.put('k', { n: 1 });

    expect(await store.take('k')).toEqual({ n: 1 });
    expect(await store.take('k')).toBeNull();
  });

  it('uses Redis when available, under a prefixed key', async () => {
    redis.available = true;
    const store = new OneTimeStore<{ n: number }>('sso:state', 1000);
    await store.put('k', { n: 2 });

    expect(redis.data.has('sso:state:k')).toBe(true);
    expect(await store.take('k')).toEqual({ n: 2 });
    expect(await store.take('k')).toBeNull();
  });

  it('expires in-memory values after the TTL', async () => {
    vi.useFakeTimers();
    const store = new OneTimeStore<{ n: number }>('test', 1000);
    await store.put('k', { n: 3 });
    vi.advanceTimersByTime(1001);

    expect(await store.take('k')).toBeNull();
  });
});
