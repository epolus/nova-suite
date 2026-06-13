/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';
import { usePriorityLabel } from '@/i18n/hooks';
import { useIncidentStats } from '../hooks';
import type { DashboardWidgetProps } from '../types';
import { PRIORITY_CONFIG } from './priorityConfig';

export default function IncidentPriorityWidget(_props: DashboardWidgetProps) {
  const priorityLabel = usePriorityLabel();
  const { data, isLoading, isError, refetch } = useIncidentStats();

  if (isLoading) {
    return <div className="h-8 animate-pulse rounded-lg bg-gray-100/80 dark:bg-gray-800/80" />;
  }
  if (isError || !data) {
    return (
      <button type="button" onClick={() => void refetch()} className="text-sm text-red-600 hover:underline">
        Failed to load
      </button>
    );
  }

  if (!data.by_priority.some((p) => p.count > 0)) {
    return <p className="text-sm text-gray-400 py-1">No open incidents by priority</p>;
  }

  return (
    <div className="px-1">
      <div className="flex flex-wrap gap-2">
        {data.by_priority.map((p) => {
          const cfg = PRIORITY_CONFIG[p.priority] ?? { color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' };
          return (
            <Link
              key={p.priority}
              to={`/incidents?cf.priority=${p.priority}`}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${cfg.bg} ${cfg.color} ${p.count === 0 ? 'opacity-40 pointer-events-none' : 'hover:scale-[1.02] hover:shadow-sm'}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              {priorityLabel(p.priority)}
              <span className="font-bold tabular-nums">{p.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
