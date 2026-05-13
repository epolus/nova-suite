/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import {
  reports,
  type ReportComponentConfig,
  type ReportComponentResult,
  type ReportDatasetKey,
  type ReportFilter,
  type ReportFilterOperator,
  type ReportKpiMetric,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { hasReportingCreateRole } from '../../utils/roles';
import { DATASET_FIELDS, DATASET_LABELS, KPI_METRICS } from './reportBuilderConfig';

type BuilderState = {
  name: string;
  description: string;
  is_shared: boolean;
  allowed_roles: string;
  components: ReportComponentConfig[];
};

function createStableId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createTableComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'table',
    title: 'New table',
    dataset: 'incidents',
    columns: ['number', 'status', 'created_at'],
    filters: [],
    sort: { field: 'created_at', direction: 'desc' },
    limit: 25,
  };
}

function createKpiComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'kpi',
    title: 'New KPI',
    dataset: 'incidents',
    metric: 'count',
    filters: [],
  };
}

function createBarChartComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'bar_chart',
    title: 'New bar chart',
    dataset: 'incidents',
    group_by: 'status',
    metric: 'count',
    top_n: 8,
    filters: [],
  };
}

function createPieChartComponent(): ReportComponentConfig {
  return {
    id: createStableId(),
    type: 'pie_chart',
    title: 'New pie chart',
    dataset: 'incidents',
    group_by: 'category',
    metric: 'count',
    top_n: 6,
    filters: [],
  };
}

function emptyState(): BuilderState {
  return {
    name: 'Untitled report',
    description: '',
    is_shared: false,
    allowed_roles: '',
    components: [],
  };
}

function ensureComponentIds(components: ReportComponentConfig[]): ReportComponentConfig[] {
  return components.map((component) => {
    if (typeof component.id === 'string' && component.id.trim().length > 0) {
      return component;
    }
    return { ...component, id: createStableId() };
  });
}

function firstFilter(component: ReportComponentConfig): ReportFilter | null {
  const filters = component.filters ?? [];
  return filters.length > 0 ? filters[0] ?? null : null;
}

function updateFirstFilter(component: ReportComponentConfig, filter: ReportFilter | null): ReportComponentConfig {
  if (!filter) return { ...component, filters: [] };
  return { ...component, filters: [filter] };
}

function ResultPreview({ result }: { result: ReportComponentResult }) {
  if (result.type === 'kpi') {
    return <p className="text-2xl font-bold text-indigo-600">{result.value ?? '—'}</p>;
  }
  if (result.type === 'bar_chart' || result.type === 'pie_chart') {
    return (
      <div className="space-y-1.5">
        {result.points.slice(0, 5).map((point) => (
          <div key={`${point.label}:${point.value}`} className="flex items-center justify-between text-xs text-gray-600">
            <span className="truncate">{point.label}</span>
            <span className="font-medium">{point.value}</span>
          </div>
        ))}
        {result.points.length === 0 && <p className="text-xs text-gray-500">No chart data.</p>}
      </div>
    );
  }
  if (result.type !== 'table') return null;
  return (
    <div className="text-xs text-gray-600">
      <p>{result.row_count} rows</p>
      {result.rows.length > 0 && (
        <p className="mt-1 text-gray-500">
          {Object.entries(result.rows[0] || {})
            .slice(0, 3)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}

export default function ReportBuilderPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [state, setState] = useState<BuilderState>(emptyState());
  const [canEdit, setCanEdit] = useState(false);
  const [previewById, setPreviewById] = useState<Record<string, ReportComponentResult>>({});

  const selectedComponent = useMemo(
    () => state.components.find((component) => component.id === selectedComponentId) || null,
    [state.components, selectedComponentId],
  );

  const canCreate = hasReportingCreateRole(user?.roles);
  const isExistingReport = !!reportId;

  const setComponent = (id: string, next: ReportComponentConfig) => {
    setState((prev) => ({
      ...prev,
      components: prev.components.map((component) => (component.id === id ? next : component)),
    }));
  };

  const load = async () => {
    if (!isExistingReport) {
      setCanEdit(canCreate);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await reports.getDefinition(reportId);
      const components = Array.isArray(res.report.components)
        ? ensureComponentIds(res.report.components)
        : [];
      setCanEdit(res.can_edit && canCreate);
      setState({
        name: res.report.name,
        description: res.report.description || '',
        is_shared: res.report.is_shared,
        allowed_roles: (res.report.allowed_roles || []).join(', '),
        components,
      });
      setSelectedComponentId(components[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [reportId, canCreate]);

  const addComponent = (kind: 'table' | 'kpi' | 'bar_chart' | 'pie_chart') => {
    if (!canEdit) return;
    const component = kind === 'table'
      ? createTableComponent()
      : kind === 'kpi'
        ? createKpiComponent()
        : kind === 'bar_chart'
          ? createBarChartComponent()
          : createPieChartComponent();
    setState((prev) => ({ ...prev, components: [...prev.components, component] }));
    setSelectedComponentId(component.id);
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const components = ensureComponentIds(state.components);
      const payload = {
        name: state.name.trim() || 'Untitled report',
        description: state.description.trim() || null,
        is_shared: state.is_shared,
        allowed_roles: state.is_shared
          ? state.allowed_roles.split(',').map((role) => role.trim()).filter(Boolean)
          : [],
        components,
        layout: { order: components.map((component) => component.id) },
      };
      if (isExistingReport) {
        await reports.updateDefinition(reportId, payload);
      } else {
        const created = await reports.createDefinition(payload);
        window.location.href = `/reports/${created.report.id}/builder`;
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save report');
    } finally {
      setSaving(false);
    }
  };

  const runReport = async () => {
    if (!isExistingReport) {
      setError('Save the report first to run it.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const run = await reports.runDefinition(reportId);
      const map: Record<string, ReportComponentResult> = {};
      run.results.forEach(({ component, result }) => { map[component.id] = result; });
      setPreviewById(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run report');
    } finally {
      setRunning(false);
    }
  };

  const previewComponent = async (component: ReportComponentConfig) => {
    setError(null);
    try {
      const response = await reports.previewComponent(component);
      setPreviewById((prev) => ({ ...prev, [component.id]: response.preview }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview component');
    }
  };

  const exportReport = async () => {
    if (!isExistingReport) {
      setError('Save the report first to export it.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await reports.createDefinitionExport(reportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  if (!canCreate) {
    return (
      <>
        <PageHeader title="Report Builder" description="Drag and drop reporting canvas." />
        <Card>
          <p className="text-sm text-gray-600">You do not have permission to edit reports.</p>
        </Card>
      </>
    );
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={state.name || 'Report Builder'}
        description="Compose widgets, preview data, and save reusable reports."
        action={(
          <div className="flex items-center gap-2">
            {isExistingReport && (
              <Link
                to={`/reports/${reportId}`}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
              >
                View mode
              </Link>
            )}
            <button
              onClick={() => void runReport()}
              disabled={running}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {running ? 'Running...' : 'Run'}
            </button>
            <button
              onClick={() => void exportReport()}
              disabled={exporting}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || !canEdit}
              className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      />

      {error && (
        <Card className="mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_320px] gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-400">Palette</p>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => addComponent('table')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              + Table widget
            </button>
            <button
              onClick={() => addComponent('kpi')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              + KPI widget
            </button>
            <button
              onClick={() => addComponent('bar_chart')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              + Bar chart
            </button>
            <button
              onClick={() => addComponent('pie_chart')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              + Pie chart
            </button>
          </div>
          <p className="mt-4 text-xs text-gray-500">Click a widget to edit its settings.</p>
        </Card>

        <div className="space-y-3">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Report name</label>
                <input
                  value={state.name}
                  onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Visibility</label>
                <select
                  value={state.is_shared ? 'shared' : 'private'}
                  onChange={(event) => setState((prev) => ({ ...prev, is_shared: event.target.value === 'shared' }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="private">Private (owner only)</option>
                  <option value="shared">Shared</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <input
                  value={state.description}
                  onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {state.is_shared && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Allowed roles (comma separated)</label>
                  <input
                    value={state.allowed_roles}
                    onChange={(event) => setState((prev) => ({ ...prev, allowed_roles: event.target.value }))}
                    placeholder="report_viewer, report_creator"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>
          </Card>

          {state.components.map((component, index) => (
            <Card
              key={component.id}
              className={`border ${selectedComponentId === component.id ? 'border-indigo-300' : 'border-transparent'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setSelectedComponentId(component.id)}
                  className="text-left min-w-0 flex-1"
                >
                  <p className="text-xs uppercase text-gray-400">{component.type}</p>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-1">{component.title || `Widget ${index + 1}`}</p>
                  <p className="text-xs text-gray-500 mt-1">{DATASET_LABELS[component.dataset]}</p>
                </button>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void previewComponent(component)}
                    className="px-2 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      setState((prev) => ({ ...prev, components: prev.components.filter((entry) => entry.id !== component.id) }));
                      setSelectedComponentId((prev) => (prev === component.id ? null : prev));
                    }}
                    className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {previewById[component.id] && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <ResultPreview result={previewById[component.id]!} />
                </div>
              )}
            </Card>
          ))}
          {state.components.length === 0 && (
            <Card>
              <p className="text-sm text-gray-500">No widgets yet. Add a table or KPI from the palette.</p>
            </Card>
          )}
        </div>

        <Card>
          {!selectedComponent && (
            <p className="text-sm text-gray-500">Select a widget to edit its configuration.</p>
          )}
          {selectedComponent && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Widget settings</h3>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                <input
                  value={selectedComponent.title}
                  onChange={(event) => setComponent(selectedComponent.id, { ...selectedComponent, title: event.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Dataset</label>
                <select
                  value={selectedComponent.dataset}
                  onChange={(event) => {
                    const dataset = event.target.value as ReportDatasetKey;
                    if (selectedComponent.type === 'table') {
                      const fallbackColumns = DATASET_FIELDS[dataset].slice(0, 3).map((field) => field.key);
                      setComponent(selectedComponent.id, {
                        ...selectedComponent,
                        dataset,
                        columns: fallbackColumns,
                        sort: { field: fallbackColumns[0] || 'created_at', direction: 'desc' },
                      });
                      return;
                    }
                    if (selectedComponent.type === 'kpi') {
                      setComponent(selectedComponent.id, {
                        ...selectedComponent,
                        dataset,
                        metric: 'count',
                        metric_field: undefined,
                      });
                      return;
                    }
                    const groupableField = DATASET_FIELDS[dataset].find((field) => field.groupable)?.key || 'status';
                    setComponent(selectedComponent.id, {
                      ...selectedComponent,
                      dataset,
                      group_by: groupableField,
                      metric: 'count',
                      metric_field: undefined,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {(Object.keys(DATASET_LABELS) as ReportDatasetKey[]).map((dataset) => (
                    <option key={dataset} value={dataset}>{DATASET_LABELS[dataset]}</option>
                  ))}
                </select>
              </div>

              {selectedComponent.type === 'table' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Columns</label>
                    <div className="max-h-40 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1">
                      {DATASET_FIELDS[selectedComponent.dataset].map((field) => (
                        <label key={field.key} className="flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedComponent.columns.includes(field.key)}
                            onChange={(event) => {
                              const current = selectedComponent.columns;
                              const next = event.target.checked
                                ? Array.from(new Set([...current, field.key]))
                                : current.filter((column) => column !== field.key);
                              setComponent(selectedComponent.id, {
                                ...selectedComponent,
                                columns: next.length > 0 ? next : current,
                              });
                            }}
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Row limit</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={selectedComponent.limit ?? 25}
                      onChange={(event) => {
                        const limit = Number.parseInt(event.target.value, 10);
                        setComponent(selectedComponent.id, { ...selectedComponent, limit: Number.isFinite(limit) ? limit : 25 });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </>
              )}

              {selectedComponent.type === 'kpi' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Metric</label>
                    <select
                      value={selectedComponent.metric}
                      onChange={(event) => {
                        const metric = event.target.value as ReportKpiMetric;
                        setComponent(selectedComponent.id, {
                          ...selectedComponent,
                          metric,
                          metric_field: metric === 'count'
                            ? undefined
                            : selectedComponent.metric_field,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {KPI_METRICS.map((metric) => (
                        <option key={metric.value} value={metric.value}>{metric.label}</option>
                      ))}
                    </select>
                  </div>
                  {selectedComponent.metric !== 'count' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Metric field</label>
                      <select
                        value={selectedComponent.metric_field || ''}
                        onChange={(event) => setComponent(selectedComponent.id, {
                          ...selectedComponent,
                          metric_field: event.target.value || undefined,
                        })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">Select numeric field</option>
                        {DATASET_FIELDS[selectedComponent.dataset]
                          .filter((field) => field.type === 'number')
                          .map((field) => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              {(selectedComponent.type === 'bar_chart' || selectedComponent.type === 'pie_chart') && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Group by</label>
                    <select
                      value={selectedComponent.group_by}
                      onChange={(event) => setComponent(selectedComponent.id, { ...selectedComponent, group_by: event.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {DATASET_FIELDS[selectedComponent.dataset]
                        .filter((field) => field.groupable)
                        .map((field) => (
                          <option key={field.key} value={field.key}>{field.label}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Metric</label>
                    <select
                      value={selectedComponent.metric}
                      onChange={(event) => {
                        const metric = event.target.value as ReportKpiMetric;
                        setComponent(selectedComponent.id, {
                          ...selectedComponent,
                          metric,
                          metric_field: metric === 'count' ? undefined : selectedComponent.metric_field,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    >
                      {KPI_METRICS.map((metric) => (
                        <option key={metric.value} value={metric.value}>{metric.label}</option>
                      ))}
                    </select>
                  </div>
                  {selectedComponent.metric !== 'count' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Metric field</label>
                      <select
                        value={selectedComponent.metric_field || ''}
                        onChange={(event) => setComponent(selectedComponent.id, {
                          ...selectedComponent,
                          metric_field: event.target.value || undefined,
                        })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">Select numeric field</option>
                        {DATASET_FIELDS[selectedComponent.dataset]
                          .filter((field) => field.type === 'number')
                          .map((field) => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Top buckets</label>
                    <input
                      type="number"
                      min={2}
                      max={24}
                      value={selectedComponent.top_n ?? 8}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        setComponent(selectedComponent.id, {
                          ...selectedComponent,
                          top_n: Number.isFinite(value) ? value : 8,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Filter (optional)</label>
                <FilterEditor
                  dataset={selectedComponent.dataset}
                  filter={firstFilter(selectedComponent)}
                  onChange={(nextFilter) => setComponent(selectedComponent.id, updateFirstFilter(selectedComponent, nextFilter))}
                />
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function FilterEditor({
  dataset,
  filter,
  onChange,
}: {
  dataset: ReportDatasetKey;
  filter: ReportFilter | null;
  onChange: (filter: ReportFilter | null) => void;
}) {
  const fields = DATASET_FIELDS[dataset];
  const defaultField = fields[0]?.key || '';
  const selectedField = fields.find((entry) => entry.key === filter?.field) || fields[0];
  const operator = (filter?.operator || 'eq') as ReportFilterOperator;
  const rawValue = filter ? String(filter.value) : '';
  const disableValue = operator === 'in';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          value={filter?.field || defaultField}
          onChange={(event) => {
            const next: ReportFilter = {
              field: event.target.value,
              operator: filter?.operator || 'eq',
              value: '',
            };
            onChange(next);
          }}
          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs"
        >
          {fields.map((field) => (
            <option key={field.key} value={field.key}>{field.label}</option>
          ))}
        </select>
        <select
          value={operator}
          onChange={(event) => {
            const nextOperator = event.target.value as ReportFilterOperator;
            const next: ReportFilter = {
              field: filter?.field || defaultField,
              operator: nextOperator,
              value: nextOperator === 'in' ? [] : '',
            };
            onChange(next);
          }}
          className="px-2 py-1.5 border border-gray-200 rounded-md text-xs"
        >
          <option value="eq">equals</option>
          <option value="neq">not equals</option>
          <option value="contains">contains</option>
          <option value="gte">greater or equal</option>
          <option value="lte">less or equal</option>
          <option value="in">in list</option>
        </select>
      </div>
      <input
        disabled={disableValue}
        value={rawValue}
        onChange={(event) => {
          if (!selectedField) return;
          const value = event.target.value;
          let parsed: string | number | boolean = value;
          if (selectedField.type === 'number') parsed = Number.parseFloat(value);
          if (selectedField.type === 'boolean') parsed = value.toLowerCase() === 'true';
          onChange({
            field: filter?.field || defaultField,
            operator,
            value: value.length === 0 ? '' : parsed,
          });
        }}
        placeholder={disableValue ? 'Use advanced API for list filters' : 'Value'}
        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs disabled:bg-gray-100 disabled:text-gray-400"
      />
      <button
        onClick={() => onChange(null)}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Clear filter
      </button>
    </div>
  );
}

