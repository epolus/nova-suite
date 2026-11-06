/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { dataManagement } from '@/api/client';
import type { DataManagementFilter, DataManagementJob } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import { formatDateTime } from '@/utils/dateTime';

function filterText(
  filter: DataManagementFilter,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const field = t(`fields.${filter.field}`);
  const operator = t(`operators.${filter.operator}`);
  if (filter.value && typeof filter.value === 'object' && !Array.isArray(filter.value)) {
    return `${field} ${operator} ${filter.value.amount} ${t(`units.${filter.value.unit}`)}`;
  }
  if (Array.isArray(filter.value)) return `${field} ${operator} ${filter.value.join(', ')}`;
  if (typeof filter.value === 'boolean') return `${field} ${operator} ${filter.value ? t('yes') : t('no')}`;
  if (typeof filter.value === 'string' && !Number.isNaN(Date.parse(filter.value)) && filter.field.endsWith('_at')) {
    return `${field} ${operator} ${formatDateTime(filter.value)}`;
  }
  return `${field} ${operator} ${String(filter.value)}`;
}

export default function DataManagementDetailView({ id }: { id: string }) {
  const t = useTranslations('pages.admin.dataManagement');
  const [job, setJob] = useState<DataManagementJob | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => dataManagement.job(id)
      .then((res) => {
        if (!cancelled) {
          setJob(res.job);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      });
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const active = job?.status === 'pending' || job?.status === 'running';
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      dataManagement.job(id)
        .then((res) => setJob(res.job))
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [active, id]);

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={job ? `${t(`actions.${job.action}`)} · ${t(`targets.${job.target}`)}` : undefined}
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
      {job && (
        <Card>
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-gray-500">{t('columns.jobStatus')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{t(`jobStatus.${job.status}`)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('columns.actor')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.actor_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('columns.when')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{formatDateTime(job.created_at)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('started')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{formatDateTime(job.started_at)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('completedAt')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{formatDateTime(job.completed_at)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('includeOpen')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.include_open ? t('yes') : t('no')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('columns.matched')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.match_count ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('columns.affected')}</dt>
              <dd className="font-medium text-gray-900 mt-0.5">{job.affected_count}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-gray-500">{t('filters')}</dt>
              <dd className="mt-1 space-y-1">
                {job.filters.map((filter, index) => (
                  <div key={`${filter.field}-${index}`} className="text-gray-900">{filterText(filter, t)}</div>
                ))}
              </dd>
            </div>
            {job.error && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">{t('columns.error')}</dt>
                <dd className="mt-0.5 text-red-700">{job.error}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}
    </>
  );
}
