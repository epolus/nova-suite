/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { getWidgetCatalogEntries } from './registry';
import { trendConfigKey, parseTrendWidgetConfig } from './trendConfig';
import type { DashboardWidgetCatalogEntry, DashboardWidgetInstance } from './types';

interface Props {
  open: boolean;
  roles: string[] | undefined;
  widgets: DashboardWidgetInstance[];
  onClose: () => void;
  onAdd: (type: DashboardWidgetCatalogEntry['type'], defaultConfig?: Record<string, unknown>) => void;
}

const CATEGORY_ORDER = ['stats', 'trends', 'lists', 'alerts', 'breakdown'] as const;

function isCatalogEntryAdded(
  entry: DashboardWidgetCatalogEntry,
  widgets: DashboardWidgetInstance[],
): boolean {
  if (entry.type !== 'trend.chart' || !entry.defaultConfig) {
    return widgets.some((widget) => widget.type === entry.type);
  }
  const presetKey = trendConfigKey({
    dataset: entry.defaultConfig.dataset as 'incidents' | 'changes' | 'requests',
    metric: String(entry.defaultConfig.metric ?? 'opened'),
    days: Number(entry.defaultConfig.days ?? 30) as 7 | 30 | 90,
  });
  return widgets.some((widget) => {
    if (widget.type !== 'trend.chart') return false;
    return trendConfigKey(parseTrendWidgetConfig(widget)) === presetKey;
  });
}

export default function AddWidgetPanel({ open, roles, widgets, onClose, onAdd }: Props) {
  const t = useTranslations('pages.dashboard.customize');
  const entries = getWidgetCatalogEntries(roles);
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    entries: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length > 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label={t('closePanel')}
        onClick={onClose}
      />
      <aside className="relative z-10 w-full max-w-md h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('addWidget')}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('closePanel')}
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-6">
          {byCategory.map(({ category, entries: categoryEntries }) => (
            <section key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                {t(`categories.${category}` as Parameters<typeof t>[0])}
              </h3>
              <ul className="space-y-2">
                {categoryEntries.map((entry) => (
                  <WidgetCatalogItem
                    key={entry.catalogKey}
                    entry={entry}
                    alreadyAdded={isCatalogEntryAdded(entry, widgets)}
                    onAdd={() => {
                      onAdd(entry.type, entry.defaultConfig);
                      onClose();
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}

function WidgetCatalogItem({
  entry,
  alreadyAdded,
  onAdd,
}: {
  entry: DashboardWidgetCatalogEntry;
  alreadyAdded: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations('pages.dashboard.customize');
  const title = t(entry.titleKey as Parameters<typeof t>[0]);

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500">
          {entry.defaultSize.w}×{entry.defaultSize.h} grid
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={alreadyAdded} onClick={onAdd}>
        {alreadyAdded ? t('alreadyAdded') : t('add')}
      </Button>
    </li>
  );
}
