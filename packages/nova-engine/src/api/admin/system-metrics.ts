/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Admin: system metrics helpers ───

export type StatusLevel = 'healthy' | 'warning' | 'critical' | 'unknown';

export type SystemMetricsResponse = {
  timestamp: string;
  database: {
    totalBytes: number | null;
    growthBytes24h: number | null;
    growthBytes7d: number | null;
    topTables: Array<{ table: string; bytes: number }>;
    p50QueryMs: number | null;
    p95QueryMs: number | null;
    slowQueriesPerMin: number | null;
    activeConnections: number | null;
    maxConnections: number | null;
    connectionUsagePct: number | null;
    status: StatusLevel;
    lastUpdatedAt: string;
  };
  api: {
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    rpm: number | null;
    errorRate5xxPct: number | null;
    errorRate4xxPct: number | null;
    status: StatusLevel;
    sourceWindowMinutes: number;
    lastUpdatedAt: string;
  };
  queue: {
    backlog: number;
    failed24h: number | null;
    oldestQueuedAgeSec: number | null;
    status: StatusLevel;
    lastUpdatedAt: string;
  };
  runtime: {
    uptimeSec: number;
    version: string;
    appStatus: 'healthy' | 'degraded';
    dbStatus: 'connected' | 'disconnected';
    redisStatus: 'connected' | 'disconnected' | 'disabled';
    temporalStatus: 'connected' | 'disconnected';
    workerStatus: 'alive' | 'stale';
    schemaStatus: 'compatible' | 'mismatch';
    lastDeployAt: string | null;
    lastUpdatedAt: string;
  };
};

export function statusFromThresholds(value: number | null, warningAt: number, criticalAt: number): StatusLevel {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value >= criticalAt) return 'critical';
  if (value >= warningAt) return 'warning';
  return 'healthy';
}

export function maxStatus(...statuses: StatusLevel[]): StatusLevel {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('healthy')) return 'healthy';
  return 'unknown';
}
