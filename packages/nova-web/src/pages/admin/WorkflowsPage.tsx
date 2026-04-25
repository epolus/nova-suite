/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
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
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

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

  const overviewCards = [
    { label: 'Running', value: overview?.running ?? '—', color: 'text-blue-600', bg: 'bg-blue-50', sub: null as string | null },
    { label: 'Completed (24h)', value: overview?.completedLast24h ?? '—', color: 'text-green-600', bg: 'bg-green-50', sub: null as string | null },
    { label: 'Failed (24h)', value: overview?.failedLast24h ?? '—', color: 'text-red-600', bg: 'bg-red-50', sub: null as string | null },
    {
      label: 'Retention',
      value: retentionPrimary ?? '—',
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      sub:
        retentionMismatch && overview
          ? `App setting ${fmtDays(overview.retentionDaysConfigured) ?? '—'} · namespace ${fmtDays(overview.retentionDaysServer) ?? '—'}`
          : overview && overview.retentionDaysServer == null
            ? `App setting ${fmtDays(overview.retentionDaysConfigured) ?? '—'}`
            : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Workflows"
        description={`Temporal workflow executions${overview ? ` — ${overview.namespace} namespace` : ''}`}
        action={
          <button
            onClick={() => navigate('/admin/workflows/designer')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Open Workflow Editor
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
            placeholder="Search by Workflow ID..."
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
              {s === 'all' ? 'All' : s}
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
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Workflow ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Task Queue</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Start Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workflows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      {searchQuery ? `No workflows matching "${searchQuery}"` : 'No workflow executions found'}
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
                      <td className="px-4 py-3 text-gray-500">{wf.taskQueue || '—'}</td>
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
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
