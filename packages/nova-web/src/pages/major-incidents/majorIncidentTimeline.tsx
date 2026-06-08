/* SPDX-License-Identifier: AGPL-3.0-only */
import { formatDateTime } from '../../utils/dateTime';
import { useTranslations } from 'use-intl';
import type { MajorIncidentFeedItem, TimelineAccent } from './majorIncidentFeed';

const ACCENT_RING: Record<TimelineAccent, string> = {
  indigo:
    'border-l-indigo-500 bg-indigo-50/50 dark:border-l-indigo-400 dark:bg-indigo-950/35',
  emerald:
    'border-l-emerald-500 bg-emerald-50/40 dark:border-l-emerald-400 dark:bg-emerald-950/30',
  amber:
    'border-l-amber-500 bg-amber-50/35 dark:border-l-amber-400 dark:bg-amber-950/40',
  slate:
    'border-l-slate-400 bg-slate-50/60 dark:border-l-slate-500 dark:bg-slate-900/45',
  rose: 'border-l-rose-500 bg-rose-50/40 dark:border-l-rose-400 dark:bg-rose-950/35',
};

export function MajorIncidentTimelineList({ items }: { items: MajorIncidentFeedItem[] }) {
  const t = useTranslations('pages.majorIncidents.timeline');

  if (items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-200 dark:border-gray-600 rounded-lg">{t('empty')}</p>;
  }

  return (
    <ul className="space-y-2.5 max-h-[36rem] overflow-y-auto pr-1">
      {items.map((row) => (
        <li
          key={row.id}
          className={`rounded-lg border border-gray-100/80 dark:border-gray-700/80 border-l-[3px] pl-4 pr-3 py-3 shadow-sm dark:shadow-none ${ACCENT_RING[row.accent]}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="font-semibold text-gray-900 dark:text-gray-100">{row.title}</span>
            <time className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0" dateTime={row.at}>
              {formatDateTime(row.at)}
            </time>
          </div>
          {row.meta && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-snug">{row.meta}</p>}
          {row.body != null && <div className="mt-1.5">{row.body}</div>}
        </li>
      ))}
    </ul>
  );
}
