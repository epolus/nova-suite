/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import {
  reports,
  type ReportComponentConfig,
  type ReportComponentResult,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { hasReportingCreateRole } from '../../utils/roles';
import { DATASET_LABELS } from './reportBuilderConfig';
import { ResultPreview } from './ResultPreview';
import { WidgetSettings } from './WidgetSettings';
import {
  type BuilderState,
  createBarChartComponent,
  createKpiComponent,
  createPieChartComponent,
  createTableComponent,
  emptyState,
  ensureComponentIds,
} from './reportBuilderHelpers';

export default function ReportBuilderPage() {
  const t = useTranslations('pages.reports');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
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

  const load = useCallback(async () => {
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
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isExistingReport, reportId, canCreate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const addComponent = (kind: 'table' | 'kpi' | 'bar_chart' | 'pie_chart') => {
    if (!canEdit) return;
    const component = kind === 'table'
      ? createTableComponent()
      : kind === 'kpi'
        ? createKpiComponent()
        : kind === 'bar_chart'
          ? createBarChartComponent()
          : createPieChartComponent();
    component.title = kind === 'table'
      ? t('defaultTableTitle')
      : kind === 'kpi'
        ? t('defaultKpiTitle')
        : kind === 'bar_chart'
          ? t('defaultBarChartTitle')
          : t('defaultPieChartTitle');
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
        name: state.name.trim() || t('untitledReport'),
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
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const runReport = async () => {
    if (!isExistingReport) {
      setError(t('saveFirstRun'));
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
      setError(err instanceof Error ? err.message : t('runFailed'));
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
      setError(err instanceof Error ? err.message : t('previewFailed'));
    }
  };

  const exportReport = async () => {
    if (!isExistingReport) {
      setError(t('saveFirstExport'));
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await reports.createDefinitionExport(reportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  if (!canCreate) {
    return (
      <>
        <PageHeader title={t('builder')} description={t('builderDescription')} />
        <Card>
          <p className="text-sm text-gray-600">{t('noPermissionEdit')}</p>
        </Card>
      </>
    );
  }

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={state.name || t('builder')}
        description={t('composeDescription')}
        action={(
          <div className="flex items-center gap-2">
            {isExistingReport && (
              <Link
                to={`/reports/${reportId}`}
                className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
              >
                {t('viewMode')}
              </Link>
            )}
            <button
              onClick={() => void runReport()}
              disabled={running}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {running ? t('running') : t('run')}
            </button>
            <button
              onClick={() => void exportReport()}
              disabled={exporting}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? t('exporting') : t('export')}
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || !canEdit}
              className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? tActions('saving') : tActions('save')}
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
          <p className="text-xs uppercase tracking-wide text-gray-400">{t('palette')}</p>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => addComponent('table')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              {t('addTable')}
            </button>
            <button
              onClick={() => addComponent('kpi')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              {t('addKpi')}
            </button>
            <button
              onClick={() => addComponent('bar_chart')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              {t('addBarChart')}
            </button>
            <button
              onClick={() => addComponent('pie_chart')}
              className="w-full text-left px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              {t('addPieChart')}
            </button>
          </div>
          <p className="mt-4 text-xs text-gray-500">{t('paletteHint')}</p>
        </Card>

        <div className="space-y-3">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('reportName')}</label>
                <input
                  value={state.name}
                  onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('visibility')}</label>
                <select
                  value={state.is_shared ? 'shared' : 'private'}
                  onChange={(event) => setState((prev) => ({ ...prev, is_shared: event.target.value === 'shared' }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="private">{t('visibilityPrivate')}</option>
                  <option value="shared">{t('visibilityShared')}</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('description')}</label>
                <input
                  value={state.description}
                  onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {state.is_shared && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('allowedRoles')}</label>
                  <input
                    value={state.allowed_roles}
                    onChange={(event) => setState((prev) => ({ ...prev, allowed_roles: event.target.value }))}
                    placeholder={t('allowedRolesPlaceholder')}
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
                  <p className="text-sm font-semibold text-gray-800 truncate mt-1">{component.title || t('widgetFallback', { index: index + 1 })}</p>
                  <p className="text-xs text-gray-500 mt-1">{DATASET_LABELS[component.dataset]}</p>
                </button>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void previewComponent(component)}
                    className="px-2 py-1 text-xs border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    {t('preview')}
                  </button>
                  <button
                    onClick={() => {
                      setState((prev) => ({ ...prev, components: prev.components.filter((entry) => entry.id !== component.id) }));
                      setSelectedComponentId((prev) => (prev === component.id ? null : prev));
                    }}
                    className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                  >
                    {t('remove')}
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
              <p className="text-sm text-gray-500">{t('noWidgets')}</p>
            </Card>
          )}
        </div>

        <WidgetSettings selectedComponent={selectedComponent} setComponent={setComponent} />
      </div>
    </>
  );
}

