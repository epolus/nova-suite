/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import {
  admin as adminApi,
  settings as settingsApi,
  type AuditEvent,
  type CacheMetrics,
  type RuntimeHealth,
  type SystemMetrics,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import { formatDateTime } from '../../utils/dateTime';

function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let next = value;
  let idx = 0;
  while (next >= 1024 && idx < units.length - 1) {
    next /= 1024;
    idx += 1;
  }
  return `${next.toFixed(next >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatSignedBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (value === 0) return '0 B';
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(value))}`;
}

function formatMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value.toFixed(0)}ms`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(1)}%`;
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const sec = Math.max(0, Math.floor(value));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec % 60}s`;
  return `${sec}s`;
}

function statusClass(status: 'healthy' | 'warning' | 'critical' | 'unknown'): string {
  if (status === 'healthy') return 'bg-green-100 text-green-700';
  if (status === 'warning') return 'bg-amber-100 text-amber-700';
  if (status === 'critical') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

export default function SystemStatusPage() {
  const [metrics, setMetrics] = useState<CacheMetrics | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [showRawRuntime, setShowRawRuntime] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [res, audit, healthResp, systemResp] = await Promise.all([
          settingsApi.cacheMetrics(),
          adminApi.auditEvents(20),
          adminApi.runtimeHealth().catch(() => null),
          adminApi.systemMetrics().catch(() => null),
        ]);
        if (!alive) return;
        setMetrics(res.cache);
        setAuditEvents(audit.events || []);
        setRuntimeHealth(healthResp);
        setSystemMetrics(systemResp);
        setLastRefreshAt(new Date().toISOString());
        setError('');
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Failed to load system metrics');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const status = useMemo(() => {
    if (!metrics) return { label: 'Loading', dot: 'bg-gray-400' };
    const hasErrors = (metrics.getErrors + metrics.setErrors + metrics.delErrors) > 0;
    if (!metrics.enabled) return { label: 'Disabled', dot: 'bg-gray-400' };
    if (!metrics.connected) return { label: 'Disconnected', dot: 'bg-amber-500' };
    if (hasErrors) return { label: 'Degraded', dot: 'bg-yellow-500' };
    return { label: 'Healthy', dot: 'bg-green-500' };
  }, [metrics]);

  const overallStatus = useMemo(() => {
    if (!systemMetrics) return { label: 'Unknown', className: 'bg-gray-100 text-gray-700' };
    const statuses = [systemMetrics.database.status, systemMetrics.api.status, systemMetrics.queue.status];
    if (statuses.includes('critical')) return { label: 'Critical', className: 'bg-red-100 text-red-700' };
    if (statuses.includes('warning')) return { label: 'Warning', className: 'bg-amber-100 text-amber-700' };
    if (statuses.includes('healthy')) return { label: 'Healthy', className: 'bg-green-100 text-green-700' };
    return { label: 'Unknown', className: 'bg-gray-100 text-gray-700' };
  }, [systemMetrics]);

  const handleResetMetrics = async () => {
    setResetting(true);
    try {
      const res = await settingsApi.resetCacheMetrics();
      setMetrics(res.cache);
      setError('');
      setFlash({ type: 'success', message: 'Cache metrics reset.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset cache metrics';
      setError(message);
      setFlash({ type: 'error', message });
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <>
      <PageHeader
        title="System Status"
        description="Live operational health, telemetry and diagnostics for this instance."
      />

      <Card>
        {flash && (
          <div
            className={`mb-3 rounded-md border px-3 py-2 text-sm ${
              flash.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {flash.message}
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${status.dot}`} />
            Redis Cache
            <span className="text-xs font-medium text-gray-500">{status.label}</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {lastRefreshAt ? `last refresh ${formatDateTime(lastRefreshAt)}` : 'refreshes every 15s'}
            </span>
            <button
              type="button"
              onClick={handleResetMetrics}
              disabled={resetting}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {resetting ? 'Resetting...' : 'Reset metrics'}
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : loading || !metrics ? (
          <p className="text-sm text-gray-500">Loading system metrics...</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Enabled</p>
                <p className={`font-semibold ${metrics.enabled ? 'text-green-700' : 'text-gray-600'}`}>
                  {metrics.enabled ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Connected</p>
                <p className={`font-semibold ${metrics.connected ? 'text-green-700' : 'text-amber-700'}`}>
                  {metrics.connected ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Hit Ratio</p>
                <p className="font-semibold text-gray-900">
                  {metrics.hitRatio == null ? '—' : `${(metrics.hitRatio * 100).toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Total GETs</p>
                <p className="font-semibold text-gray-900">{metrics.totalGets}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Hits / Misses</p>
                <p className="font-semibold text-gray-900">{metrics.getHits} / {metrics.getMisses}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Errors</p>
                <p className="font-semibold text-red-700">{metrics.getErrors + metrics.setErrors + metrics.delErrors}</p>
              </div>
            </div>
            <div className="text-[11px] text-gray-500 space-y-1">
              <p><span className="font-medium text-gray-600">TTL:</span> {metrics.defaultTtlSeconds}s</p>
              <p><span className="font-medium text-gray-600">Redis URL:</span> {metrics.url}</p>
              {metrics.lastErrorAt && metrics.lastErrorMessage && (
                <p className="text-red-600">
                  <span className="font-medium">Last error:</span> {metrics.lastErrorMessage} ({formatDateTime(metrics.lastErrorAt)})
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
          <h3 className="font-semibold text-gray-900">System telemetry</h3>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${overallStatus.className}`}>
              {overallStatus.label}
            </span>
            {systemMetrics?.timestamp && (
              <span className="text-xs text-gray-500">snapshot {formatDateTime(systemMetrics.timestamp)}</span>
            )}
          </div>
        </div>
        {!systemMetrics ? (
          <p className="text-sm text-gray-500">Telemetry endpoint unavailable. Showing baseline health only.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">Database</p>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] ${statusClass(systemMetrics.database.status)}`}>
                    {systemMetrics.database.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-900">{formatBytes(systemMetrics.database.totalBytes)}</p>
                <p className="text-gray-600">p95 query {formatMs(systemMetrics.database.p95QueryMs)}</p>
                <p className="text-gray-600">Conn usage {formatPercent(systemMetrics.database.connectionUsagePct)}</p>
                <p className="text-gray-600">24h growth {formatSignedBytes(systemMetrics.database.growthBytes24h)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">API latency</p>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] ${statusClass(systemMetrics.api.status)}`}>
                    {systemMetrics.api.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-900">p95 {formatMs(systemMetrics.api.p95Ms)}</p>
                <p className="text-gray-600">p99 {formatMs(systemMetrics.api.p99Ms)}</p>
                <p className="text-gray-600">Error 5xx {formatPercent(systemMetrics.api.errorRate5xxPct)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">Traffic window</p>
                  <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-700">
                    {systemMetrics.api.sourceWindowMinutes}m
                  </span>
                </div>
                <p className="font-semibold text-gray-900">{systemMetrics.api.rpm == null ? 'N/A' : `${systemMetrics.api.rpm.toFixed(1)} RPM`}</p>
                <p className="text-gray-600">4xx {formatPercent(systemMetrics.api.errorRate4xxPct)}</p>
                <p className="text-gray-600">5xx {formatPercent(systemMetrics.api.errorRate5xxPct)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">Queue/workers</p>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] ${statusClass(systemMetrics.queue.status)}`}>
                    {systemMetrics.queue.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-900">Backlog {systemMetrics.queue.backlog}</p>
                <p className="text-gray-600">Failed 24h {systemMetrics.queue.failed24h ?? 'N/A'}</p>
                <p className="text-gray-600">Oldest queued {formatSeconds(systemMetrics.queue.oldestQueuedAgeSec)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500 mb-1">Top database tables</p>
                {systemMetrics.database.topTables.length === 0 ? (
                  <p className="text-gray-600">No table size data available.</p>
                ) : (
                  <ul className="space-y-1">
                    {systemMetrics.database.topTables.map((table) => (
                      <li key={table.table} className="flex items-center justify-between text-gray-700">
                        <span>{table.table}</span>
                        <span className="font-medium text-gray-900">{formatBytes(table.bytes)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <p className="text-gray-500">Runtime details</p>
                <p className="text-gray-700">Uptime <span className="font-semibold text-gray-900">{formatSeconds(systemMetrics.runtime.uptimeSec)}</span></p>
                <p className="text-gray-700">App <span className="font-semibold text-gray-900">{systemMetrics.runtime.appStatus}</span></p>
                <p className="text-gray-700">DB <span className="font-semibold text-gray-900">{systemMetrics.runtime.dbStatus}</span> · Redis <span className="font-semibold text-gray-900">{systemMetrics.runtime.redisStatus}</span></p>
                <p className="text-gray-700">Temporal <span className="font-semibold text-gray-900">{systemMetrics.runtime.temporalStatus}</span> · Worker <span className="font-semibold text-gray-900">{systemMetrics.runtime.workerStatus}</span></p>
                <p className="text-gray-700">DB growth 7d <span className="font-semibold text-gray-900">{formatSignedBytes(systemMetrics.database.growthBytes7d)}</span></p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {runtimeHealth && (
        <Card className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">Raw diagnostics</h3>
            <button
              type="button"
              onClick={() => setShowRawRuntime((prev) => !prev)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              {showRawRuntime ? 'Hide JSON' : 'Show JSON'}
            </button>
          </div>
          {showRawRuntime ? (
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto">
              {JSON.stringify(runtimeHealth.checks || {}, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-gray-500">
              Raw endpoint payload is available for deep troubleshooting.
            </p>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Recent audit events</h3>
          <span className="text-xs text-gray-500">admin and security actions</span>
        </div>
        {auditEvents.length === 0 ? (
          <p className="text-sm text-gray-500">No recent audit events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Level</th>
                  <th className="py-2 pr-3 font-medium">Actor</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((evt) => (
                  <tr key={evt.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-600">{formatDateTime(evt.created_at)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] ${
                        evt.level === 'critical'
                          ? 'bg-red-100 text-red-700'
                          : evt.level === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                      }`}
                      >
                        {evt.level}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-800">{evt.actor_name || 'System'}</td>
                    <td className="py-2 pr-3 text-gray-800">{evt.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
