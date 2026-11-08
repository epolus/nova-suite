/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { dataManagement } from '../../api/client';
import type {
  DataManagementAction,
  DataManagementFilter,
  DataManagementOperator,
  DataManagementPreview,
  DataManagementTarget,
  DataManagementTargetKey,
  DataManagementUnit,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import UserDateTimeInput from '../../components/UserDateTimeInput';
import { formatDateTime } from '../../utils/dateTime';
import { defaultFilterRow, fieldInputClass, rowToFilter, type FilterRow } from './dataManagementForm';

export default function DataManagementFormView() {
  const navigate = useNavigate();
  const t = useTranslations('pages.admin.dataManagement');
  const [targets, setTargets] = useState<DataManagementTarget[]>([]);
  const [targetKey, setTargetKey] = useState<DataManagementTargetKey>('incidents');
  const [action, setAction] = useState<DataManagementAction>('delete');
  const [includeOpen, setIncludeOpen] = useState(false);
  const [rows, setRows] = useState<FilterRow[]>([defaultFilterRow()]);
  const [preview, setPreview] = useState<DataManagementPreview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);

  const target = targets.find((item) => item.key === targetKey) ?? targets[0];
  const fields = target?.fields ?? [];

  const formKey = useMemo(
    () => JSON.stringify({ targetKey, action, includeOpen, rows }),
    [targetKey, action, includeOpen, rows],
  );
  const previewCurrent = preview !== null && previewKey === formKey;
  const confirmReady = previewCurrent && confirmText === String(preview.count) && preview.count > 0;

  const load = () => dataManagement.targets()
    .then((targetRes) => {
      setTargets(targetRes.targets);
      setError('');
    })
    .catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    });

  useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldByKey = (key: string) => fields.find((field) => field.key === key);

  const updateRow = (index: number, patch: Partial<FilterRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setPreview(null);
    setConfirmText('');
  };

  const buildFilters = (): DataManagementFilter[] | null => {
    const filters = rows.map((row) => rowToFilter(row, fieldByKey(row.field)));
    if (filters.some((filter) => filter === null)) return null;
    return filters as DataManagementFilter[];
  };

  const handlePreview = async () => {
    const filters = buildFilters();
    if (!filters) {
      setError(t('filterRequired'));
      return;
    }
    setPreviewing(true);
    setError('');
    try {
      const result = await dataManagement.preview({
        target: targetKey,
        action,
        filters,
        include_open: includeOpen,
      });
      setPreview(result);
      setPreviewKey(formKey);
      setConfirmText('');
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : t('previewFailed'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleRun = async () => {
    const filters = buildFilters();
    if (!filters || !previewCurrent || preview === null) return;
    setRunning(true);
    setError('');
    try {
      const created = await dataManagement.createJob({
        target: targetKey,
        action,
        filters,
        include_open: includeOpen,
        confirm_count: preview.count,
      });
      navigate(`/admin/data-management/${created.job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('runFailed'));
      setPreview(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('newJob')}
        description={t('description')}
        action={
          <Link
            to="/admin/data-management"
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('back')}
          </Link>
        }
      />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <Card className="mb-6">
        {loading ? (
          <p className="text-sm text-gray-500">{t('previewing')}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">{t('target')}</span>
                <select
                  value={target?.key ?? 'incidents'}
                  onChange={(event) => {
                    const nextKey = event.target.value as DataManagementTargetKey;
                    const next = targets.find((item) => item.key === nextKey);
                    setTargetKey(nextKey);
                    if (next && !next.actions.includes(action)) setAction(next.actions[0] ?? 'delete');
                    const created = next?.fields.find((field) => field.key === 'created_at');
                    setRows([defaultFilterRow(created)]);
                    setPreview(null);
                    setConfirmText('');
                  }}
                  className={`${fieldInputClass} mt-1`}
                >
                  {(targets.length > 0 ? targets : [{ key: 'incidents' as const, actions: [], closed_statuses: [], fields: [] }]).map((item) => (
                    <option key={item.key} value={item.key}>{t(`targets.${item.key}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">{t('action')}</span>
                <select
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value as DataManagementAction);
                    setPreview(null);
                    setConfirmText('');
                  }}
                  className={`${fieldInputClass} mt-1`}
                >
                  {(target?.actions ?? ['delete', 'archive']).map((item) => (
                    <option key={item} value={item}>{t(`actions.${item}`)}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={includeOpen}
                onChange={(event) => {
                  setIncludeOpen(event.target.checked);
                  setPreview(null);
                  setConfirmText('');
                }}
              />
              <span>
                <span className="font-medium">{t('includeOpen')}</span>
                <span className="block text-gray-500">
                  {t('includeOpenHint', { statuses: (target?.closed_statuses ?? []).join(', ') })}
                </span>
              </span>
            </label>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{t('filters')}</h3>
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  onClick={() => {
                    const created = fieldByKey('created_at');
                    setRows((current) => [...current, defaultFilterRow(created)]);
                    setPreview(null);
                  }}
                >
                  {t('addFilter')}
                </button>
              </div>
              <div className="space-y-3">
                {rows.map((row, index) => {
                  const field = fieldByKey(row.field) ?? fields[0];
                  const operators = field?.operators ?? [];
                  return (
                    <div key={`${row.field}-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_auto] items-end">
                      <label className="block text-sm">
                        <span className="text-gray-600">{t('field')}</span>
                        <select
                          value={row.field}
                          onChange={(event) => {
                            const next = fieldByKey(event.target.value);
                            updateRow(index, {
                              field: event.target.value,
                              operator: next?.operators.includes(row.operator) ? row.operator : (next?.operators[0] ?? 'eq'),
                            });
                          }}
                          className={`${fieldInputClass} mt-1`}
                        >
                          {fields.map((item) => (
                            <option key={item.key} value={item.key}>{t(`fields.${item.key}`)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm">
                        <span className="text-gray-600">{t('operator')}</span>
                        <select
                          value={row.operator}
                          onChange={(event) => updateRow(index, { operator: event.target.value as DataManagementOperator })}
                          className={`${fieldInputClass} mt-1`}
                        >
                          {operators.map((item) => (
                            <option key={item} value={item}>{t(`operators.${item}`)}</option>
                          ))}
                        </select>
                      </label>
                      <div className="text-sm">
                        <span className="text-gray-600">{row.operator === 'older_than' ? t('amount') : t('value')}</span>
                        {row.operator === 'older_than' ? (
                          <div className="mt-1 flex gap-2">
                            <input
                              type="number"
                              min={1}
                              value={row.amount}
                              onChange={(event) => updateRow(index, { amount: event.target.value })}
                              className={fieldInputClass}
                            />
                            <select
                              value={row.unit}
                              onChange={(event) => updateRow(index, { unit: event.target.value as DataManagementUnit })}
                              className={fieldInputClass}
                            >
                              {(['days', 'months', 'years'] as const).map((unit) => (
                                <option key={unit} value={unit}>{t(`units.${unit}`)}</option>
                              ))}
                            </select>
                          </div>
                        ) : row.operator === 'in' ? (
                          <input
                            value={row.list}
                            placeholder={t('inHint')}
                            onChange={(event) => updateRow(index, { list: event.target.value })}
                            className={`${fieldInputClass} mt-1`}
                          />
                        ) : field?.type === 'boolean' ? (
                          <select
                            value={row.bool}
                            onChange={(event) => updateRow(index, { bool: event.target.value as 'true' | 'false' })}
                            className={`${fieldInputClass} mt-1`}
                          >
                            <option value="true">{t('yes')}</option>
                            <option value="false">{t('no')}</option>
                          </select>
                        ) : field?.type === 'timestamp' ? (
                          <div className="mt-1">
                            <UserDateTimeInput
                              value={row.text}
                              onChange={(value) => updateRow(index, { text: value })}
                              className={fieldInputClass}
                              ariaLabel={t('value')}
                            />
                          </div>
                        ) : (
                          <input
                            type={field?.type === 'number' ? 'number' : 'text'}
                            value={row.text}
                            onChange={(event) => updateRow(index, { text: event.target.value })}
                            className={`${fieldInputClass} mt-1`}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40"
                        disabled={rows.length === 1}
                        onClick={() => {
                          setRows((current) => current.filter((_, i) => i !== index));
                          setPreview(null);
                          setConfirmText('');
                        }}
                      >
                        {t('removeFilter')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || fields.length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {previewing ? t('previewing') : t('preview')}
            </button>

            {previewCurrent && preview && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-sm font-medium text-gray-900">{t('matchCount', { count: preview.count })}</p>
                <h3 className="text-sm font-semibold text-gray-900">{t('sample')}</h3>
                {preview.sample.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('noSample')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="py-2 pr-4 font-medium">{t('columns.number')}</th>
                          <th className="py-2 pr-4 font-medium">{t('columns.title')}</th>
                          <th className="py-2 pr-4 font-medium">{t('columns.status')}</th>
                          <th className="py-2 pr-4 font-medium">{t('columns.created')}</th>
                          <th className="py-2 font-medium">{t('columns.closed')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample.map((row) => (
                          <tr key={row.number} className="border-t border-gray-100">
                            <td className="py-2 pr-4">{row.number}</td>
                            <td className="py-2 pr-4">{row.title}</td>
                            <td className="py-2 pr-4">{row.status}</td>
                            <td className="py-2 pr-4">{formatDateTime(row.created_at)}</td>
                            <td className="py-2">{formatDateTime(row.closed_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <label className="block text-sm max-w-xs">
                  <span className="font-medium text-gray-700">{t('confirmLabel', { count: preview.count })}</span>
                  <input
                    value={confirmText}
                    onChange={(event) => setConfirmText(event.target.value.trim())}
                    className={`${fieldInputClass} mt-1`}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={!confirmReady || running}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {running ? t('running') : t('run')}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
