/* SPDX-License-Identifier: AGPL-3.0-only */
import { createClient, type RedisClientType } from 'redis';
import { config } from '../config';
import { logger } from '../logger';

let client: RedisClientType | null = null;
let connectPromise: Promise<void> | null = null;
let connected = false;
let lastErrorAt: string | null = null;
let lastErrorMessage: string | null = null;

const metrics = {
  getHits: 0,
  getMisses: 0,
  getErrors: 0,
  setOps: 0,
  setErrors: 0,
  delOps: 0,
  delErrors: 0,
};

function markError(err: unknown): void {
  lastErrorAt = new Date().toISOString();
  lastErrorMessage = err instanceof Error ? err.message : String(err);
}

function isRedisEnabled(): boolean {
  return config.redis.enabled;
}

async function getClient(): Promise<RedisClientType | null> {
  if (!isRedisEnabled()) return null;
  if (client) return client;

  client = createClient({ url: config.redis.url });
  client.on('error', (err) => {
    connected = false;
    markError(err);
    logger.warn({ err }, 'Redis client error');
  });

  connectPromise = client.connect().then(() => {
    connected = true;
    logger.info({ url: config.redis.url }, 'Redis connected');
  }).catch((err) => {
    connected = false;
    markError(err);
    logger.warn({ err, url: config.redis.url }, 'Redis connection failed; continuing without cache');
    client = null;
  }).finally(() => {
    connectPromise = null;
  });

  await connectPromise;
  return client;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  try {
    const c = await getClient();
    if (!c) {
      metrics.getMisses += 1;
      return null;
    }
    const raw = await c.get(key);
    if (!raw) {
      metrics.getMisses += 1;
      return null;
    }
    metrics.getHits += 1;
    return JSON.parse(raw) as T;
  } catch (err) {
    metrics.getErrors += 1;
    markError(err);
    logger.warn({ err, key }, 'Redis GET failed');
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds = config.redis.defaultTtlSeconds): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    metrics.setOps += 1;
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await c.set(key, payload, { EX: ttlSeconds });
    } else {
      await c.set(key, payload);
    }
  } catch (err) {
    metrics.setErrors += 1;
    markError(err);
    logger.warn({ err, key }, 'Redis SET failed');
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const c = await getClient();
    if (!c) return;
    metrics.delOps += 1;
    await c.del(key);
  } catch (err) {
    metrics.delErrors += 1;
    markError(err);
    logger.warn({ err, key }, 'Redis DEL failed');
  }
}

export function cacheMetrics(): Record<string, unknown> {
  const totalGets = metrics.getHits + metrics.getMisses;
  const hitRatio = totalGets > 0 ? metrics.getHits / totalGets : null;
  return {
    enabled: config.redis.enabled,
    connected,
    url: config.redis.url,
    defaultTtlSeconds: config.redis.defaultTtlSeconds,
    ...metrics,
    totalGets,
    hitRatio,
    lastErrorAt,
    lastErrorMessage,
  };
}

export function resetCacheMetrics(): void {
  metrics.getHits = 0;
  metrics.getMisses = 0;
  metrics.getErrors = 0;
  metrics.setOps = 0;
  metrics.setErrors = 0;
  metrics.delOps = 0;
  metrics.delErrors = 0;
  lastErrorAt = null;
  lastErrorMessage = null;
}

export async function cacheShutdown(): Promise<void> {
  try {
    if (connectPromise) await connectPromise;
    if (client) {
      await client.quit();
      client = null;
      connected = false;
    }
  } catch (err) {
    markError(err);
    logger.warn({ err }, 'Redis shutdown failed');
  }
}
