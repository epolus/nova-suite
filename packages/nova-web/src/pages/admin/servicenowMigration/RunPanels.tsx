/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import Card from '../../../components/Card';
import Spinner from '../../../components/Spinner';
import { formatDateTime } from '../../../utils/dateTime';
import type { MigrationRunDetail, MigrationRunSummary } from '../../../api/client';
import { Pill } from './ui';

export function RunProgress({ run }: { run: MigrationRunDetail | null }) {
  const t = useTranslations('pages.admin.serviceNowMigration');
  if (!run) return <Card><Spinner /></Card>;
  const requests = typeof run.progress.requests === 'number' ? run.progress.requests : null;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Spinner />
        <div>
          <p className="font-medium text-gray-900">{t(`status.${run.status}`)}</p>
          <p className="text-sm text-gray-500">
            {run.progress.stage ? t('run.stage', { stage: String(run.progress.stage) }) : t('run.waiting')}
            {requests !== null ? ` · ${t('run.requests', { count: requests })}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function RunHistory({ runs, onOpen }: { runs: MigrationRunSummary[]; onOpen: (id: string) => void }) {
  const t = useTranslations('pages.admin.serviceNowMigration');
  return (
    <Card className="mt-6">
      <h2 className="font-semibold text-gray-900 mb-4">{t('runs.title')}</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-gray-500">{t('runs.empty')}</p>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{t('runs.created')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('runs.instance')}</th>
                <th className="text-left px-3 py-2 font-medium">{t('runs.status')}</th>
                <th className="text-right px-3 py-2 font-medium">{t('runs.items')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{formatDateTime(r.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.instance_url}</td>
                  <td className="px-3 py-2">
                    <Pill tone={r.status}>{t(`status.${r.status}`)}</Pill>
                    {r.error && <p className="text-xs text-red-700 mt-1">{r.error}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">{r.totals?.items ?? ''}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => onOpen(r.id)}>
                      {t('runs.open')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

