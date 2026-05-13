/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { reports, type ReportComponentConfig, type ReportComponentResult, type ReportDatasetKey } from '../../api/client';
import { hasReportingViewRole } from '../../utils/roles';
import { useAuth } from '../../context/AuthContext';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import { DATASET_LABELS } from './reportBuilderConfig';

function datasetBasePath(dataset: ReportDatasetKey): string {
  if (dataset === 'incidents') return '/incidents';
  if (dataset === 'changes') return '/changes';
  return '/requests';
}

function rowDetailPath(dataset: ReportDatasetKey, row: Record<string, unknown>): string | null {
  const idValue = row._row_id;
  if (typeof idValue === 'string' && idValue.length > 0) {
    return `${datasetBasePath(dataset)}/${idValue}`;
  }
  return null;
}

function chartFilterPath(dataset: ReportDatasetKey, groupBy: string, value: string | number | boolean | null): string {
  const qs = new URLSearchParams();
  if (value !== null && value !== undefined) {
    qs.set(`cf.${groupBy}`, String(value));
  }
  return `${datasetBasePath(dataset)}?${qs.toString()}`;
}

const CHART_COLORS = ['#4f46e5', '#16a34a', '#f97316', '#dc2626', '#0891b2', '#a855f7', '#ca8a04', '#64748b'];

function ResultCard({
  component,
  result,
  onOpenPath,
}: {
  component: ReportComponentConfig;
  result: ReportComponentResult;
  onOpenPath: (path: string) => void;
}) {
  if (result.type === 'kpi') {
    return (
      <Card>
        <p className="text-xs uppercase tracking-wide text-gray-400">{DATASET_LABELS[result.dataset]}</p>
        <p className="text-sm font-medium text-gray-700 mt-1">{component.title || 'KPI'}</p>
        <p className="text-3xl font-bold text-indigo-600 mt-2">{result.value ?? '—'}</p>
      </Card>
    );
  }

  if (result.type === 'bar_chart') {
    const maxValue = result.points.reduce((max, point) => Math.max(max, point.value), 0) || 1;
    return (
      <Card>
        <p className="text-xs uppercase tracking-wide text-gray-400">{DATASET_LABELS[result.dataset]}</p>
        <p className="text-sm font-medium text-gray-800 mt-1">{component.title || 'Chart'}</p>
        <div className="mt-3 space-y-2">
          {result.points.map((point, index) => (
            <button
              key={`${point.label}:${index}`}
              onClick={() => onOpenPath(chartFilterPath(result.dataset, result.group_by, point.raw_label))}
              className="w-full text-left rounded-lg border border-gray-100 p-2 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate">{point.label}</span>
                <span className="font-semibold text-gray-900">{point.value}</span>
              </div>
              <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (point.value / maxValue) * 100)}%`,
                    backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                  }}
                />
              </div>
            </button>
          ))}
          {result.points.length === 0 && <p className="text-sm text-gray-500">No chart data.</p>}
        </div>
      </Card>
    );
  }
  if (result.type === 'pie_chart') {
    const total = result.points.reduce((sum, point) => sum + point.value, 0);
    const pieBackground = total > 0
      ? `conic-gradient(${result.points
        .reduce<{ parts: string[]; current: number }>((acc, point, index) => {
          const start = acc.current;
          const end = start + (point.value / total) * 100;
          const color = CHART_COLORS[index % CHART_COLORS.length];
          acc.parts.push(`${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
          acc.current = end;
          return acc;
        }, { parts: [], current: 0 }).parts.join(', ')})`
      : '#e5e7eb';

    return (
      <Card>
        <p className="text-xs uppercase tracking-wide text-gray-400">{DATASET_LABELS[result.dataset]}</p>
        <p className="text-sm font-medium text-gray-800 mt-1">{component.title || 'Chart'}</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[120px_minmax(0,1fr)] gap-3 items-start">
          <div
            className="h-[120px] w-[120px] rounded-full border border-gray-100"
            style={{ background: pieBackground }}
            aria-label="Pie chart"
          />
          <div className="space-y-1.5">
            {result.points.map((point, index) => (
              <button
                key={`${point.label}:${index}`}
                onClick={() => onOpenPath(chartFilterPath(result.dataset, result.group_by, point.raw_label))}
                className="w-full text-left rounded-md border border-gray-100 px-2 py-1.5 hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <span className="truncate text-gray-700">{point.label}</span>
                  </span>
                  <span className="font-semibold text-gray-900">
                    {point.value}
                    {total > 0 ? ` (${Math.round((point.value / total) * 100)}%)` : ''}
                  </span>
                </div>
              </button>
            ))}
            {result.points.length === 0 && <p className="text-sm text-gray-500">No chart data.</p>}
          </div>
        </div>
      </Card>
    );
  }
  if (result.type !== 'table') return null;

  const columns = result.rows.length > 0
    ? Object.keys(result.rows[0] || {}).filter((column) => column !== '_row_id')
    : component.type === 'table' ? component.columns : [];
  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs uppercase tracking-wide text-gray-400">{DATASET_LABELS[result.dataset]}</p>
        <p className="text-sm font-medium text-gray-800 mt-1">{component.title || 'Table'}</p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              {columns.map((column) => (
                <th key={column} className="text-left px-4 py-2 text-xs font-semibold text-gray-500">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr
                key={index}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  const path = rowDetailPath(result.dataset, row);
                  if (path) onOpenPath(path);
                }}
              >
                {columns.map((column) => (
                  <td key={column} className="px-4 py-2 text-gray-700 align-top">
                    {String(row[column] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="px-4 py-5 text-sm text-gray-500">
                  No data returned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function ReportViewerPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Report');
  const [description, setDescription] = useState<string | null>(null);
  const [results, setResults] = useState<Array<{ component: ReportComponentConfig; result: ReportComponentResult }>>([]);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useUserPreferenceState<number>(
    'reports:viewer:auto_refresh_seconds',
    0,
    'nova_report_viewer_auto_refresh_seconds',
  );
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(0);

  const canView = useMemo(() => hasReportingViewRole(user?.roles), [user?.roles]);

  useEffect(() => {
    const allowed = new Set([0, 30, 60, 300]);
    if (!allowed.has(autoRefreshSeconds)) {
      setAutoRefreshSeconds(0);
    }
  }, [autoRefreshSeconds, setAutoRefreshSeconds]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const run = await reports.runDefinition(reportId);
      setResults(run.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run report');
    } finally {
      setRunning(false);
      if (autoRefreshSeconds > 0) {
        setSecondsUntilRefresh(autoRefreshSeconds);
      }
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await reports.getDefinition(reportId);
      setTitle(detail.report.name);
      setDescription(detail.report.description);
      await runNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView || !reportId) {
      setLoading(false);
      return;
    }
    void load();
  }, [canView, reportId]);

  useEffect(() => {
    if (!canView || !reportId || autoRefreshSeconds <= 0) return;
    setSecondsUntilRefresh(autoRefreshSeconds);
    const timer = window.setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          if (!running && !loading) {
            void runNow();
          }
          return autoRefreshSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefreshSeconds, canView, reportId, running, loading]);

  useEffect(() => {
    if (autoRefreshSeconds <= 0) {
      setSecondsUntilRefresh(0);
    }
  }, [autoRefreshSeconds]);

  if (!canView) {
    return (
      <>
        <PageHeader title="Report viewer" description="Read-only report execution." />
        <Card>
          <p className="text-sm text-gray-600">You do not have permission to view reports.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={description || 'Custom report view.'}
        action={(
          <div className="flex items-center gap-2">
            <button
              onClick={() => void runNow()}
              disabled={running || loading}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {running ? 'Running...' : 'Run now'}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Auto update</label>
              <select
                value={String(autoRefreshSeconds)}
                onChange={(event) => setAutoRefreshSeconds(Number.parseInt(event.target.value, 10) || 0)}
                className="px-2 py-1.5 rounded-md border border-gray-200 text-xs"
              >
                <option value="0">Off</option>
                <option value="30">30s</option>
                <option value="60">1m</option>
                <option value="300">5m</option>
              </select>
            </div>
            {autoRefreshSeconds > 0 && (
              <span className="text-xs text-gray-500">
                refresh in {secondsUntilRefresh}s
              </span>
            )}
            <Link
              to={`/reports/${reportId}/builder`}
              className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Open builder
            </Link>
          </div>
        )}
      />

      {loading ? <Spinner /> : null}
      {error && (
        <Card className="mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {results.map(({ component, result }) => (
            <ResultCard key={component.id} component={component} result={result} onOpenPath={(path) => navigate(path)} />
          ))}
          {results.length === 0 && (
            <Card>
              <p className="text-sm text-gray-500">This report has no components yet.</p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

