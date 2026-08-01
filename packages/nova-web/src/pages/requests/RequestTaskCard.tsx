/* SPDX-License-Identifier: AGPL-3.0-only */
import type { RequestTask } from '../../api/client';
import { formatDateTime } from '../../utils/dateTime';
import { useTranslations } from 'use-intl';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-100 text-gray-400',
  rejected: 'bg-red-100 text-red-700',
  failed: 'bg-orange-100 text-orange-800',
};

const TYPE_COLORS: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700',
  manual: 'bg-blue-100 text-blue-700',
  automated: 'bg-purple-100 text-purple-700',
};

export function TaskCard({
  task, currentUserId, approvalSubjectId, actionLoading, taskNote, onNoteChange, onComplete, onAssign,
}: {
  task: RequestTask;
  requestId: string;
  currentUserId?: string;
  /** User the approval is about (COALESCE(requested_for, requester_id)); cannot self-approve as employee. */
  approvalSubjectId?: string | null;
  actionLoading: boolean;
  taskNote: string;
  onNoteChange: (val: string) => void;
  onComplete: (taskId: string, outcome: string) => void;
  onAssign: (taskId: string) => void;
}) {
  const tRequests = useTranslations('pages.requests');
  const tActions = useTranslations('common.actions');
  const isActive = task.status === 'in_progress';
  const isDone = ['completed', 'skipped', 'rejected', 'failed'].includes(task.status);
  const isSelfApprovalBlocked =
    task.task_type === 'approval' && approvalSubjectId !== undefined && approvalSubjectId === currentUserId;
  const canAssign = task.task_type !== 'approval' && !task.assigned_to && Boolean(currentUserId);
  const canApprove = task.task_type === 'approval' && !isSelfApprovalBlocked;
  const canComplete = task.task_type !== 'approval';
  const hasActions = isActive && (canAssign || canApprove || canComplete);

  return (
    <div className={`p-4 ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-gray-900">{task.name}</p>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[task.task_type]}`}>
              {task.task_type}
            </span>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[task.status]}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
          {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
        </div>
      </div>

      <div className="text-xs text-gray-400 space-y-0.5 mb-2">
        {task.assigned_group_name && <p>{tRequests('group', { name: task.assigned_group_name })}</p>}
        {task.assigned_to_name && <p>{tRequests('assignedToLabel', { name: task.assigned_to_name })}</p>}
        {task.completed_by_name && <p>{tRequests('completedByAt', { name: task.completed_by_name, time: formatDateTime(task.completed_at) })}</p>}
        {task.outcome && <p>{tRequests('outcome')} <span className={task.outcome === 'approved' ? 'text-green-600' : 'text-red-600'}>{task.outcome}</span></p>}
        {task.notes && <p className="text-gray-600 italic">"{task.notes}"</p>}
      </div>

      {/* Action buttons for active tasks */}
      {hasActions && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          {canAssign && (
            <button
              onClick={() => onAssign(task.id)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium mb-2 block"
            >
              {tRequests('assignToMe')}
            </button>
          )}
          <textarea
            value={taskNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={tRequests('notesOptionalShort')}
            rows={1}
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none mb-2"
          />
          {canApprove ? (
            <div className="flex gap-2">
              <button
                onClick={() => onComplete(task.id, 'rejected')}
                disabled={actionLoading}
                className="flex-1 px-3 py-1.5 border border-red-300 text-red-700 rounded text-xs font-medium hover:bg-red-50 disabled:opacity-50"
              >
                {tActions('reject')}
              </button>
              <button
                onClick={() => onComplete(task.id, 'approved')}
                disabled={actionLoading}
                className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {tActions('approve')}
              </button>
            </div>
          ) : canComplete ? (
            <button
              onClick={() => onComplete(task.id, 'completed')}
              disabled={actionLoading}
              className="w-full px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {tRequests('markComplete')}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
