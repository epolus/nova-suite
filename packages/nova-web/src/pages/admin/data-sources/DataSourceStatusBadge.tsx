/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';

export default function DataSourceStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('pages.admin.dataSources');
  if (!status) return <span className="text-xs text-gray-400">{t('neverRun')}</span>;
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    running: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  };
  const labelKey = status as 'completed' | 'running' | 'failed';
  const label = ['completed', 'running', 'failed'].includes(status)
    ? t(`runStatus.${labelKey}`)
    : status;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}
