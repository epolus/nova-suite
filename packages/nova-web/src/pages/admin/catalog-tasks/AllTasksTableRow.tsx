/* SPDX-License-Identifier: AGPL-3.0-only */
import { Fragment } from 'react';
import { useTranslations } from 'use-intl';
import { Link } from 'react-router-dom';
import { TYPE_COLORS, type ServiceItemTaskRow } from './types';

export default function AllTasksTableRow({
  row,
  expanded,
  onToggle,
  onOpenEditor,
}: {
  row: ServiceItemTaskRow;
  expanded: boolean;
  onToggle: (serviceItemId: string) => void;
  onOpenEditor: (serviceItemId: string) => void;
}) {
  const t = useTranslations('pages.admin.catalogTasks');
  const tTable = useTranslations('common.table');

  return (
    <Fragment>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={() => onToggle(row.service_item_id)}
            className="flex items-center gap-2 text-left"
          >
            <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{row.service_item_name}</p>
              {row.unassignedCount > 0 && (
                <p className="text-xs text-amber-700 mt-0.5">
                  {t('unassignedTasks', { count: row.unassignedCount })}
                </p>
              )}
            </div>
          </button>
        </td>
        <td className="px-4 py-3 text-gray-600">{row.category_name || tTable('emDash')}</td>
        <td className="px-4 py-3 text-gray-700">
          {row.stepCount}
          {row.parallelStepCount > 0 && (
            <span className="text-xs text-indigo-600 ml-1">{t('parallel', { count: row.parallelStepCount })}</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-700">{row.taskCount}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {row.counts.approval > 0 && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS.approval}`}>
                {t('typeCount.approval', { count: row.counts.approval })}
              </span>
            )}
            {row.counts.manual > 0 && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS.manual}`}>
                {t('typeCount.manual', { count: row.counts.manual })}
              </span>
            )}
            {row.counts.automated > 0 && (
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS.automated}`}>
                {t('typeCount.automated', { count: row.counts.automated })}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          {row.service_item_is_active ? (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              {t('active')}
            </span>
          ) : (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              {t('inactive')}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={() => onOpenEditor(row.service_item_id)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {t('openEditor')}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-gray-50/60">
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="divide-y divide-gray-100">
                {row.tasks.map((task) => (
                  <div key={task.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-14 shrink-0">
                      <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 text-white text-[11px] font-semibold w-8 h-8">
                        {task.task_order}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{task.name}</p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[task.task_type]}`}>
                          {task.task_type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {task.assigned_group_name || t('filters.unassigned')}
                        {task.sla_hours ? ` · ${t('slaHours', { hours: task.sla_hours })}` : ''}
                        {task.description ? ` · ${task.description}` : ''}
                      </p>
                    </div>
                    <Link
                      to={`/admin/catalog-tasks/${task.service_item_id}/${task.id}`}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {t('details')}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
