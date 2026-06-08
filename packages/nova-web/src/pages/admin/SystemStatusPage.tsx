/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
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

function formatBytes(value: number | null | undefined, naLabel: string): string {
  if (value == null || !Number.isFinite(value)) return naLabel;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let next = value;
  let idx = 0;
  while (next >= 1024 && idx < units.length - 1) {
    next /= 1024;
    idx += 1;
  }
  return `${next.toFixed(next >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatSignedBytes(value: number | null | undefined, naLabel: string): string {
  if (value == null || !Number.isFinite(value)) return naLabel;
  if (value === 0) return '0 B';
  const sign = value > 0 ? '+' : '-';
  return `${sign}${formatBytes(Math.abs(value), naLabel)}`;
}

function formatMs(value: number | null | undefined, naLabel: string): string {
  if (value == null || !Number.isFinite(value)) return naLabel;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value.toFixed(0)}ms`;
}

function formatPercent(value: number | null | undefined, naLabel: string): string {
  if (value == null || !Number.isFinite(value)) return naLabel;
  return `${value.toFixed(1)}%`;
}

function formatSeconds(value: number | null | undefined, naLabel: string): string {
  if (value == null || !Number.isFinite(value)) return naLabel;
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
  const t = useTranslations('pages.admin.systemStatus');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');

  const naLabel = tStates('unknown');

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
        setError(err instanceof Error ? err.message : t('loadFailed'));
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
  }, [t]);

  const status = useMemo(() => {
    if (!metrics) return { label: t('cacheStatus.loading'), dot: 'bg-gray-400' };
    const hasErrors = (metrics.getErrors + metrics.setErrors + metrics.delErrors) > 0;
    if (!metrics.enabled) return { label: t('cacheStatus.disabled'), dot: 'bg-gray-400' };
    if (!metrics.connected) return { label: t('cacheStatus.disconnected'), dot: 'bg-amber-500' };
    if (hasErrors) return { label: t('cacheStatus.degraded'), dot: 'bg-yellow-500' };
    return { label: t('cacheStatus.healthy'), dot: 'bg-green-500' };
  }, [metrics, t]);

  const overallStatus = useMemo(() => {
    if (!systemMetrics) return { label: t('overallStatus.unknown'), className: 'bg-gray-100 text-gray-700' };
    const statuses = [systemMetrics.database.status, systemMetrics.api.status, systemMetrics.queue.status];
    if (statuses.includes('critical')) return { label: t('overallStatus.critical'), className: 'bg-red-100 text-red-700' };
    if (statuses.includes('warning')) return { label: t('overallStatus.warning'), className: 'bg-amber-100 text-amber-700' };
    if (statuses.includes('healthy')) return { label: t('overallStatus.healthy'), className: 'bg-green-100 text-green-700' };
    return { label: t('overallStatus.unknown'), className: 'bg-gray-100 text-gray-700' };
  }, [systemMetrics, t]);

  const handleResetMetrics = async () => {
    setResetting(true);
    try {
      const res = await settingsApi.resetCacheMetrics();
      setMetrics(res.cache);
      setError('');
      setFlash({ type: 'success', message: t('resetSuccess') });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('resetFailed');
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
        title={t('title')}
        description={t('description')}
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
            {t('redisCache')}
            <span className="text-xs font-medium text-gray-500">{status.label}</span>
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {lastRefreshAt ? t('lastRefresh', { time: formatDateTime(lastRefreshAt) }) : t('refreshesEvery15s')}
            </span>
            <button
              type="button"
              onClick={handleResetMetrics}
              disabled={resetting}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {resetting ? t('resetting') : t('resetMetrics')}
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : loading || !metrics ? (
          <p className="text-sm text-gray-500">{t('loadingMetrics')}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">{t('enabled')}</p>
                <p className={`font-semibold ${metrics.enabled ? 'text-green-700' : 'text-gray-600'}`}>
                  {metrics.enabled ? tStates('yes') : tStates('no')}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">{t('connected')}</p>
                <p className={`font-semibold ${metrics.connected ? 'text-green-700' : 'text-amber-700'}`}>
                  {metrics.connected ? tStates('yes') : tStates('no')}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">{t('hitRatio')}</p>
                <p className="font-semibold text-gray-900">
                  {metrics.hitRatio == null ? tTable('emDash') : `${(metrics.hitRatio * 100).toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">{t('totalGets')}</p>
                <p className="font-semibold text-gray-900">{metrics.totalGets}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">{t('hitsMisses')}</p>
                <p className="font-semibold text-gray-900">{metrics.getHits} / {metrics.getMisses}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">{t('errors')}</p>
                <p className="font-semibold text-red-700">{metrics.getErrors + metrics.setErrors + metrics.delErrors}</p>
              </div>
            </div>
            <div className="text-[11px] text-gray-500 space-y-1">
              <p><span className="font-medium text-gray-600">{t('ttl')}</span> {metrics.defaultTtlSeconds}s</p>
              <p><span className="font-medium text-gray-600">{t('redisUrl')}</span> {metrics.url}</p>
              {metrics.lastErrorAt && metrics.lastErrorMessage && (
                <p className="text-red-600">
                  <span className="font-medium">{t('lastError')}</span> {metrics.lastErrorMessage} ({formatDateTime(metrics.lastErrorAt)})
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
          <h3 className="font-semibold text-gray-900">{t('systemTelemetry')}</h3>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${overallStatus.className}`}>
              {overallStatus.label}
            </span>
            {systemMetrics?.timestamp && (
              <span className="text-xs text-gray-500">{t('snapshot', { time: formatDateTime(systemMetrics.timestamp) })}</span>
            )}
          </div>
        </div>
        {!systemMetrics ? (
          <p className="text-sm text-gray-500">{t('telemetryUnavailable')}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">{t('database')}</p>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] ${statusClass(systemMetrics.database.status)}`}>
                    {systemMetrics.database.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-900">{formatBytes(systemMetrics.database.totalBytes, naLabel)}</p>
                <p className="text-gray-600">{t('p95Query', { value: formatMs(systemMetrics.database.p95QueryMs, naLabel) })}</p>
                <p className="text-gray-600">{t('connUsage', { value: formatPercent(systemMetrics.database.connectionUsagePct, naLabel) })}</p>
                <p className="text-gray-600">{t('growth24h', { value: formatSignedBytes(systemMetrics.database.growthBytes24h, naLabel) })}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">{t('apiLatency')}</p>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] ${statusClass(systemMetrics.api.status)}`}>
                    {systemMetrics.api.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-900">{t('p95', { value: formatMs(systemMetrics.api.p95Ms, naLabel) })}</p>
                <p className="text-gray-600">{t('p99', { value: formatMs(systemMetrics.api.p99Ms, naLabel) })}</p>
                <p className="text-gray-600">{t('error5xx', { value: formatPercent(systemMetrics.api.errorRate5xxPct, naLabel) })}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">{t('trafficWindow')}</p>
                  <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-700">
                    {systemMetrics.api.sourceWindowMinutes}m
                  </span>
                </div>
                <p className="font-semibold text-gray-900">{systemMetrics.api.rpm == null ? naLabel : t('rpm', { value: systemMetrics.api.rpm.toFixed(1) })}</p>
                <p className="text-gray-600">{t('error4xx', { value: formatPercent(systemMetrics.api.errorRate4xxPct, naLabel) })}</p>
                <p className="text-gray-600">{t('error5xx', { value: formatPercent(systemMetrics.api.errorRate5xxPct, naLabel) })}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-gray-500">{t('queueWorkers')}</p>
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] ${statusClass(systemMetrics.queue.status)}`}>
                    {systemMetrics.queue.status}
                  </span>
                </div>
                <p className="font-semibold text-gray-900">{t('backlog', { value: systemMetrics.queue.backlog })}</p>
                <p className="text-gray-600">{t('failed24h', { value: systemMetrics.queue.failed24h ?? naLabel })}</p>
                <p className="text-gray-600">{t('oldestQueued', { value: formatSeconds(systemMetrics.queue.oldestQueuedAgeSec, naLabel) })}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500 mb-1">{t('topDatabaseTables')}</p>
                {systemMetrics.database.topTables.length === 0 ? (
                  <p className="text-gray-600">{t('noTableSizeData')}</p>
                ) : (
                  <ul className="space-y-1">
                    {systemMetrics.database.topTables.map((table) => (
                      <li key={table.table} className="flex items-center justify-between text-gray-700">
                        <span>{table.table}</span>
                        <span className="font-medium text-gray-900">{formatBytes(table.bytes, naLabel)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-1">
                <p className="text-gray-500">{t('runtimeDetails')}</p>
                <p className="text-gray-700">{t('uptime')} <span className="font-semibold text-gray-900">{formatSeconds(systemMetrics.runtime.uptimeSec, naLabel)}</span></p>
                <p className="text-gray-700">{t('app')} <span className="font-semibold text-gray-900">{systemMetrics.runtime.appStatus}</span></p>
                <p className="text-gray-700">{t('db')} <span className="font-semibold text-gray-900">{systemMetrics.runtime.dbStatus}</span> · {t('redis')} <span className="font-semibold text-gray-900">{systemMetrics.runtime.redisStatus}</span></p>
                <p className="text-gray-700">{t('temporal')} <span className="font-semibold text-gray-900">{systemMetrics.runtime.temporalStatus}</span> · {t('worker')} <span className="font-semibold text-gray-900">{systemMetrics.runtime.workerStatus}</span></p>
                <p className="text-gray-700">{t('dbGrowth7d')} <span className="font-semibold text-gray-900">{formatSignedBytes(systemMetrics.database.growthBytes7d, naLabel)}</span></p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {runtimeHealth && (
        <Card className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">{t('rawDiagnostics')}</h3>
            <button
              type="button"
              onClick={() => setShowRawRuntime((prev) => !prev)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              {showRawRuntime ? t('hideJson') : t('showJson')}
            </button>
          </div>
          {showRawRuntime ? (
            <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto">
              {JSON.stringify(runtimeHealth.checks || {}, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-gray-500">
              {t('rawPayloadHint')}
            </p>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{t('recentAuditEvents')}</h3>
          <span className="text-xs text-gray-500">{t('auditSubtitle')}</span>
        </div>
        {auditEvents.length === 0 ? (
          <p className="text-sm text-gray-500">{t('noAuditEvents')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3 font-medium">{t('table.time')}</th>
                  <th className="py-2 pr-3 font-medium">{t('table.level')}</th>
                  <th className="py-2 pr-3 font-medium">{t('table.actor')}</th>
                  <th className="py-2 pr-3 font-medium">{t('table.action')}</th>
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
                    <td className="py-2 pr-3 text-gray-800">{evt.actor_name || t('systemActor')}</td>
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
