/* SPDX-License-Identifier: AGPL-3.0-only */
export interface ThemeSettings {
  app_name: string;
  app_subtitle: string;
  primary_color: string;
  sidebar_bg: string;
  sidebar_active_bg: string;
  content_bg: string;
  login_bg_from: string;
  login_bg_to: string;
  dark_content_bg: string;
  dark_surface_bg: string;
  dark_muted_bg: string;
  dark_border_color: string;
  dark_text_primary: string;
  dark_text_muted: string;
  catalog_currency: string;
  logo_url: string;
  [key: string]: string;
}

export interface CacheMetrics {
  enabled: boolean;
  connected: boolean;
  url: string;
  defaultTtlSeconds: number;
  getHits: number;
  getMisses: number;
  getErrors: number;
  setOps: number;
  setErrors: number;
  delOps: number;
  delErrors: number;
  totalGets: number;
  hitRatio: number | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

export interface RuntimeHealth {
  status: string;
  version: string;
  timestamp: string;
  checks: Record<string, unknown>;
}

export interface SystemMetrics {
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
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    lastUpdatedAt: string;
  };
  api: {
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    rpm: number | null;
    errorRate5xxPct: number | null;
    errorRate4xxPct: number | null;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    sourceWindowMinutes: number;
    lastUpdatedAt: string;
  };
  queue: {
    backlog: number;
    failed24h: number | null;
    oldestQueuedAgeSec: number | null;
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
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
}

export interface AppNotification {
  id: string;
  type: 'assignment' | 'mention' | 'sla_warning' | 'workflow';
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SearchResult {
  type: 'incident' | 'change' | 'problem' | 'knowledge' | 'ci';
  id: string;
  identifier: string;
  title: string;
  subtitle: string | null;
  path: string;
  score: number;
}

export interface PendingApproval {
  type: 'change' | 'knowledge' | 'request';
  approval_id: string;
  approval_type: string;
  entity_id: string;
  entity_number: string;
  entity_title: string;
  created_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Attachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  category: string;
  action: string;
  level: 'info' | 'warning' | 'critical';
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_user_id: string | null;
  actor_name?: string | null;
}
