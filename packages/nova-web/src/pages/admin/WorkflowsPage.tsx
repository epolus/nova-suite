/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { temporal as temporalApi } from '../../api/client';
import type { TemporalOverview, WorkflowExecution } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';

const STATUS_FILTERS = ['all', 'Running', 'Completed', 'Failed', 'Cancelled', 'Terminated', 'TimedOut'];

const STATUS_COLORS: Record<string, string> = {
  Running: 'bg-blue-100 text-blue-800',
  Completed: 'bg-green-100 text-green-800',
  Failed: 'bg-red-100 text-red-800',
  Cancelled: 'bg-gray-100 text-gray-600',
  Terminated: 'bg-orange-100 text-orange-800',
  TimedOut: 'bg-yellow-100 text-yellow-800',
  ContinuedAsNew: 'bg-purple-100 text-purple-800',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = e - s;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ${Math.floor((diff % 60_000) / 1000)}s`;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

export default function WorkflowsPage() {
  const t = useTranslations('pages.admin.workflows');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = searchParams.get('status') || 'all';
  const searchQuery = searchParams.get('search') || '';

  const [overview, setOverview] = useState<TemporalOverview | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Load overview
  useEffect(() => {
    setOverviewLoading(true);
    temporalApi.overview()
      .then(setOverview)
      .catch((err) => console.error('Failed to load overview:', err))
      .finally(() => setOverviewLoading(false));
  }, []);

  // Load workflows
  const loadWorkflows = useCallback(async (pageToken?: string) => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { limit: '20' };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      if (pageToken) params.pageToken = pageToken;

      const res = await temporalApi.workflows(params);
      if (pageToken) {
        setWorkflows((prev) => [...prev, ...res.workflows]);
      } else {
        setWorkflows(res.workflows);
      }
      setNextPageToken(res.nextPageToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, t]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const setFilter = (status: string) => {
    const params = new URLSearchParams(searchParams);
    if (status === 'all') params.delete('status');
    else params.set('status', status);
    setSearchParams(params, { replace: true });
  };

  const setSearch = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('search', value);
    else params.delete('search');
    setSearchParams(params, { replace: true });
  };

  const fmtDays = (d: number | null | undefined) => {
    if (d == null || !Number.isFinite(d)) return null;
    const x = Math.round(d * 100) / 100;
    return x % 1 === 0 ? `${x}d` : `${x.toFixed(1)}d`;
  };

  const retentionMismatch =
    overview &&
    overview.retentionDaysServer != null &&
    Math.round(overview.retentionDaysServer * 100) !== Math.round(overview.retentionDaysConfigured * 100);

  const retentionPrimary =
    overview &&
    fmtDays(
      retentionMismatch ? overview.retentionDaysServer : (overview.retentionDaysServer ?? overview.retentionDaysConfigured),
    );

  const emDash = tTable('emDash');
  const overviewCards = [
    { label: t('overview.running'), value: overview?.running ?? emDash, color: 'text-blue-600', bg: 'bg-blue-50', sub: null as string | null },
    { label: t('overview.completed24h'), value: overview?.completedLast24h ?? emDash, color: 'text-green-600', bg: 'bg-green-50', sub: null as string | null },
    { label: t('overview.failed24h'), value: overview?.failedLast24h ?? emDash, color: 'text-red-600', bg: 'bg-red-50', sub: null as string | null },
    {
      label: t('overview.retention'),
      value: retentionPrimary ?? emDash,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      sub:
        retentionMismatch && overview
          ? t('overview.retentionMismatch', { app: fmtDays(overview.retentionDaysConfigured) ?? emDash, namespace: fmtDays(overview.retentionDaysServer) ?? emDash })
          : overview && overview.retentionDaysServer == null
            ? t('overview.retentionAppOnly', { app: fmtDays(overview.retentionDaysConfigured) ?? emDash })
            : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        description={overview ? t('descriptionWithNamespace', { namespace: overview.namespace }) : t('description')}
        action={
          <button
            onClick={() => navigate('/admin/workflows/editor')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {t('openEditor')}
          </button>
        }
      />

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {overviewCards.map((card) => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4`}>
            <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>
              {overviewLoading ? '...' : card.value}
            </p>
            {card.sub && (
              <p className="text-xs text-gray-500 mt-1 leading-snug">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? tStates('all') : t(`statuses.${s}` as 'statuses.Running')}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Table */}
      {loading && workflows.length === 0 ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.workflowId')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.type')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.status')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.taskQueue')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.startTime')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">{t('table.duration')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workflows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      {searchQuery ? t('emptySearch', { query: searchQuery }) : t('empty')}
                    </td>
                  </tr>
                ) : (
                  workflows.map((wf) => (
                    <tr
                      key={`${wf.workflowId}-${wf.runId}`}
                      onClick={() => navigate(`/admin/workflows/${encodeURIComponent(wf.workflowId)}/${encodeURIComponent(wf.runId)}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-indigo-600 truncate max-w-xs" title={wf.workflowId}>{wf.workflowId}</p>
                          <p className="text-xs text-gray-400 truncate max-w-xs" title={wf.runId}>{wf.runId.slice(0, 8)}...</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono">
                          {wf.type}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={wf.status} /></td>
                      <td className="px-4 py-3 text-gray-500">{wf.taskQueue || emDash}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDateTime(wf.startTime)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDuration(wf.startTime, wf.closeTime)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {nextPageToken && (
            <div className="border-t border-gray-100 px-4 py-3 text-center">
              <button
                onClick={() => loadWorkflows(nextPageToken)}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {loading ? tStates('loading') : t('loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
