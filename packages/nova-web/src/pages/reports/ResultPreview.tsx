/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { ReportComponentResult } from '../../api/client';

export function ResultPreview({ result }: { result: ReportComponentResult }) {
  const t = useTranslations('pages.reports');
  const tTable = useTranslations('common.table');
  if (result.type === 'kpi') {
    return <p className="text-2xl font-bold text-indigo-600">{result.value ?? tTable('emDash')}</p>;
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
        {result.points.length === 0 && <p className="text-xs text-gray-500">{t('noChartData')}</p>}
      </div>
    );
  }
  if (result.type !== 'table') return null;
  return (
    <div className="text-xs text-gray-600">
      <p>{t('rowCount', { count: result.row_count })}</p>
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
