/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import Card from '../../components/Card';
import type {
  ReportComponentConfig,
  ReportDatasetKey,
  ReportKpiMetric,
} from '../../api/client';
import { DATASET_FIELDS, DATASET_LABELS, KPI_METRICS } from './reportBuilderConfig';
import { FilterEditor } from './FilterEditor';
import { firstFilter, updateFirstFilter } from './reportBuilderHelpers';

export function WidgetSettings({
  selectedComponent,
  setComponent,
}: {
  selectedComponent: ReportComponentConfig | null;
  setComponent: (id: string, next: ReportComponentConfig) => void;
}) {
  const t = useTranslations('pages.reports');
  const tFields = useTranslations('common.fields');

  return (
    <Card>
      {!selectedComponent && (
        <p className="text-sm text-gray-500">{t('selectWidget')}</p>
      )}
      {selectedComponent && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">{t('widgetSettings')}</h3>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('title')}</label>
            <input
              value={selectedComponent.title}
              onChange={(event) => setComponent(selectedComponent.id, { ...selectedComponent, title: event.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('dataset')}</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('columns')}</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('rowLimit')}</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('metric')}</label>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('metricField')}</label>
                  <select
                    value={selectedComponent.metric_field || ''}
                    onChange={(event) => setComponent(selectedComponent.id, {
                      ...selectedComponent,
                      metric_field: event.target.value || undefined,
                    })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">{t('selectNumericField')}</option>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('groupBy')}</label>
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
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('metric')}</label>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('metricField')}</label>
                  <select
                    value={selectedComponent.metric_field || ''}
                    onChange={(event) => setComponent(selectedComponent.id, {
                      ...selectedComponent,
                      metric_field: event.target.value || undefined,
                    })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">{t('selectNumericField')}</option>
                    {DATASET_FIELDS[selectedComponent.dataset]
                      .filter((field) => field.type === 'number')
                      .map((field) => (
                        <option key={field.key} value={field.key}>{field.label}</option>
                      ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('topBuckets')}</label>
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
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('filterOptional')}</label>
            <FilterEditor
              dataset={selectedComponent.dataset}
              filter={firstFilter(selectedComponent)}
              onChange={(nextFilter) => setComponent(selectedComponent.id, updateFirstFilter(selectedComponent, nextFilter))}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
