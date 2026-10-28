/* SPDX-License-Identifier: AGPL-3.0-only */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import Card from '../../../components/Card';
import Spinner from '../../../components/Spinner';
import { migrations } from '../../../api/client';
import type {
  MigrationApplyResponse,
  MigrationConfigPackage,
  MigrationReport,
  MigrationRunDetail,
} from '../../../api/client';
import { errorMessage, primaryButton, secondaryButton } from './shared';
import { Pill } from './ui';

const UnifiedAutomationDesigner = lazy(() => import('../../../components/workflow/UnifiedAutomationDesigner'));

function PreviewModal({ title, config, onClose }: { title: string; config: Record<string, unknown>; onClose: () => void }) {
  const t = useTranslations('pages.admin.serviceNowMigration.review');
  const json = useMemo(() => JSON.stringify(config), [config]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">{t('previewHint')}</p>
          </div>
          <button type="button" className={secondaryButton} onClick={onClose}>{t('close')}</button>
        </div>
        <div className="flex-1 min-h-0">
          <Suspense fallback={<Spinner />}>
            <UnifiedAutomationDesigner initialConfigJson={json} onApply={() => undefined} fillAvailableSpace />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function ReviewStep({ run, onApplied }: { run: MigrationRunDetail; onApplied: () => void }) {
  const t = useTranslations('pages.admin.serviceNowMigration');
  const report = run.report as MigrationReport;
  const [pkg, setPkg] = useState<MigrationConfigPackage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(report.items.filter((i) => i.status !== 'unsupported').map((i) => i.externalKey)),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; config: Record<string, unknown> } | null>(null);
  const [createGroups, setCreateGroups] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<MigrationApplyResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    migrations.serviceNowRunPackage(run.id).then((r) => setPkg(r.package)).catch(() => setPkg(null));
  }, [run.id]);

  const automationFor = (key: string) =>
    pkg?.contents.catalog.service_items.find((i) => i.external_key === key)?.tasks.find((tk) => tk.task_type === 'automated');

  const apply = async () => {
    setApplying(true);
    setError('');
    setResult(null);
    try {
      const res = await migrations.serviceNowApply(run.id, { item_keys: [...selected], create_missing_groups: createGroups });
      setResult(res);
      onApplied();
    } catch (err) {
      setError(errorMessage(err, t('review.validationFailed')));
    } finally {
      setApplying(false);
    }
  };

  const totals = report.totals;
  return (
    <>
      <Card>
        <div className="flex flex-wrap gap-2">
          <Pill tone="full">{t('review.full')}: {totals.full}</Pill>
          <Pill tone="partial">{t('review.partial')}: {totals.partial}</Pill>
          <Pill tone="unsupported">{t('review.unsupported')}: {totals.unsupported}</Pill>
          <Pill tone="">{t('review.fields')}: {totals.fields}</Pill>
          <Pill tone="">{t('review.subflows')}: {totals.subflows}</Pill>
          <Pill tone={totals.scriptSteps > 0 ? 'partial' : ''}>{t('review.scriptSteps')}: {totals.scriptSteps}</Pill>
        </div>
        {report.warnings.length > 0 && (
          <details className="mt-3 text-xs text-amber-800">
            <summary className="cursor-pointer">{t('review.warnings')} ({report.warnings.length})</summary>
            <ul className="mt-1 list-disc pl-5">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </details>
        )}
      </Card>

      <Card className="mt-6">
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="select all"
                    checked={selected.size === report.items.length && report.items.length > 0}
                    onChange={(e) => setSelected(e.target.checked ? new Set(report.items.map((i) => i.externalKey)) : new Set())}
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium">{t('review.item')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('review.category')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('review.status')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('review.fields')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('review.tasks')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('review.notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.items.map((item) => {
                const automation = automationFor(item.externalKey);
                return (
                  <tr key={item.externalKey} className="align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.externalKey)}
                        onChange={() => setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.externalKey)) next.delete(item.externalKey);
                          else next.add(item.externalKey);
                          return next;
                        })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.flowName && <p className="text-xs text-gray-500">{item.flowName}</p>}
                      {automation && (
                        <button
                          type="button"
                          className="text-xs text-indigo-600 hover:underline"
                          onClick={() => setPreview({
                            title: t('review.previewTitle', { name: item.name }),
                            config: automation.automation_config,
                          })}
                        >
                          {t('review.preview')}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{item.categoryName}</td>
                    <td className="px-3 py-2"><Pill tone={item.status}>{t(`review.${item.status}`)}</Pill></td>
                    <td className="px-3 py-2 text-right">{item.fieldCount}</td>
                    <td className="px-3 py-2 text-right">{item.taskCount}</td>
                    <td className="px-3 py-2 text-xs">
                      {item.notes.length > 0 && (
                        <button
                          type="button"
                          className="text-indigo-600 hover:underline"
                          onClick={() => setExpanded(expanded === item.externalKey ? null : item.externalKey)}
                        >
                          {t('review.showNotes', { count: item.notes.length })}
                        </button>
                      )}
                      {expanded === item.externalKey && (
                        <ul className="mt-1 space-y-1">
                          {item.notes.map((n, idx) => (
                            <li
                              key={`${n.code}-${idx}`}
                              className={n.severity === 'error' ? 'text-red-700' : n.severity === 'warning' ? 'text-amber-700' : 'text-gray-600'}
                            >
                              {n.subject && <span className="font-mono">{n.subject}: </span>}
                              {n.message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {report.subflows.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('review.subflowList')}</h3>
            <ul className="text-sm space-y-1">
              {report.subflows.map((s) => (
                <li key={s.sysId} className="flex items-center gap-2">
                  <Pill tone={s.status}>{t(`review.${s.status}`)}</Pill>
                  <span>{s.name}</span>
                  <span className="font-mono text-xs text-gray-500">{s.workflowType}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 mt-4">
          <input type="checkbox" checked={createGroups} onChange={(e) => setCreateGroups(e.target.checked)} />
          {t('review.createGroups')}
        </label>
        <div className="mt-4">
          <button
            type="button"
            className={primaryButton}
            disabled={selected.size === 0 || applying || run.status === 'applying'}
            onClick={() => void apply()}
          >
            {applying ? t('review.applying') : t('review.apply', { count: selected.size })}
          </button>
        </div>

        {error && <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        {result && (
          <div className="mt-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm space-y-1">
            <p>{t('review.applied', {
              items: result.applied?.service_items ?? 0,
              tasks: result.applied?.catalog_tasks ?? 0,
              workflows: result.applied?.workflow_definitions ?? 0,
            })}</p>
            {result.groups.created.length > 0 && <p>{t('review.groupsCreated', { names: result.groups.created.join(', ') })}</p>}
            {result.groups.unassigned.length > 0 && <p>{t('review.groupsUnassigned', { names: result.groups.unassigned.join(', ') })}</p>}
          </div>
        )}
      </Card>
      {preview && <PreviewModal title={preview.title} config={preview.config} onClose={() => setPreview(null)} />}
    </>
  );
}

