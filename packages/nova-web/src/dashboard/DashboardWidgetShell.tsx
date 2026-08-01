/* SPDX-License-Identifier: AGPL-3.0-only */
import { Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useChangeStats, useTrendCatalog } from './hooks';
import { DashboardIcons } from './icons';
import { getWidgetDefinition } from './registry';
import { parseTrendWidgetConfig, TREND_DAY_OPTIONS } from './trendConfig';
import type { DashboardWidgetInstance } from './types';
import { LIST_LIMIT_OPTIONS } from './types';

interface Props {
  instance: DashboardWidgetInstance;
  editMode: boolean;
  onRemove: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  children: React.ReactNode;
}

export default function DashboardWidgetShell({
  instance,
  editMode,
  onRemove,
  onConfigChange,
  children,
}: Props) {
  const t = useTranslations('pages.dashboard.customize');
  const tDash = useTranslations('pages.dashboard');
  const tAnalytics = useTranslations('pages.dashboard.analytics');
  const def = getWidgetDefinition(instance.type);
  const isTrend = instance.type === 'trend.chart';
  const trendConfig = isTrend ? parseTrendWidgetConfig(instance) : null;
  const { data: trendCatalog } = useTrendCatalog(editMode && isTrend);
  const titleKey = def?.titleKey ?? instance.type;
  let title = t(titleKey as Parameters<typeof t>[0]);
  if (isTrend && trendConfig) {
    title = tAnalytics(`metrics.${trendConfig.dataset}.${trendConfig.metric}` as 'metrics.incidents.opened');
  }
  const isStat = instance.type.startsWith('stat.');
  const isList = instance.type.startsWith('list.');
  const currentLimit = typeof instance.config?.limit === 'number' ? instance.config.limit : 5;
  const currentDays = trendConfig?.days ?? 30;
  const { data: changeStats } = useChangeStats(instance.type === 'list.changes_pending');

  const accentClass = def?.statAccent ? `dashboard-widget-stat-accent-${def.statAccent}` : 'dashboard-widget-stat-accent-indigo';

  return (
    <div
      className={`h-full flex flex-col rounded-xl shadow-sm overflow-hidden transition-all duration-150 ${
        isStat ? `dashboard-widget-stat ${accentClass}` : 'dashboard-widget-panel'
      } ${editMode ? 'ring-2 ring-indigo-400/50 shadow-md' : ''}`}
    >
      {(editMode || !isStat) && (
        <div
          className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-700/80 ${
            editMode ? 'dashboard-widget-handle cursor-grab active:cursor-grabbing bg-gray-50/90 dark:bg-gray-800/90' : 'bg-transparent'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {editMode && DashboardIcons.grip('w-4 h-4 flex-shrink-0 text-gray-400')}
            {!isStat && (
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{title}</span>
            )}
            {editMode && isStat && (
              <span className="text-xs font-medium truncate text-gray-500 dark:text-gray-400">{title}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editMode && def?.viewAllLink && (
              <Link to={def.viewAllLink} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                {tDash('viewAll')}
                {instance.type === 'list.changes_pending' && changeStats && changeStats.pending_approval > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 rounded-full font-semibold">
                    {changeStats.pending_approval}
                  </span>
                )}
              </Link>
            )}
            {editMode && isList && (
              <select
                value={currentLimit}
                onChange={(e) => onConfigChange(instance.id, { limit: Number(e.target.value) })}
                className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-800"
                aria-label={t('listLimit')}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {LIST_LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}
            {editMode && isTrend && trendCatalog && (
              <>
                <select
                  value={`${trendConfig?.dataset}:${trendConfig?.metric}`}
                  onChange={(e) => {
                    const [dataset, metric] = e.target.value.split(':');
                    onConfigChange(instance.id, { dataset, metric });
                  }}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-800 max-w-[9rem]"
                  aria-label={tAnalytics('metric')}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {trendCatalog.metrics.map((metric) => (
                    <option key={`${metric.dataset}:${metric.metric}`} value={`${metric.dataset}:${metric.metric}`}>
                      {tAnalytics(`metrics.${metric.dataset}.${metric.metric}` as 'metrics.incidents.opened')}
                    </option>
                  ))}
                </select>
                <select
                  value={currentDays}
                  onChange={(e) => onConfigChange(instance.id, { days: Number(e.target.value) })}
                  className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-800"
                  aria-label={tAnalytics('range')}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {TREND_DAY_OPTIONS.map((days) => (
                    <option key={days} value={days}>{tAnalytics('lastDays', { count: days })}</option>
                  ))}
                </select>
              </>
            )}
            {editMode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => onRemove(instance.id)}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {t('removeWidget')}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className={`flex-1 min-h-0 ${isStat ? 'px-4 py-3' : 'px-1 py-1'} overflow-hidden`}>
        <Suspense fallback={<div className="h-full animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
