/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { admin as adminApi, settings as settingsApi, type AuditEvent, type CacheMetrics } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import { formatDateTime } from '../../utils/dateTime';

export default function SystemStatusPage() {
  const [metrics, setMetrics] = useState<CacheMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [runtimeHealth, setRuntimeHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [res, audit, healthResp] = await Promise.all([
          settingsApi.cacheMetrics(),
          adminApi.auditEvents(20),
          fetch('/health').then(async (r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (!alive) return;
        setMetrics(res.cache);
        setAuditEvents(audit.events || []);
        setRuntimeHealth(healthResp);
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
        description="Live operational health and cache telemetry for this instance."
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
            <span className="text-xs text-gray-500">refreshes every 15s</span>
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

      {runtimeHealth && (
        <Card className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Runtime health</h3>
            <span className="text-xs text-gray-500">{String(runtimeHealth.status || 'unknown')}</span>
          </div>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto">
            {JSON.stringify(runtimeHealth.checks || {}, null, 2)}
          </pre>
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
