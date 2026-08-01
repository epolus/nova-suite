/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ServiceRequest, RequestTask } from '../../api/client';
import Card from '../../components/Card';
import { formatDateTime } from '../../utils/dateTime';
import { useTranslations } from 'use-intl';

export function RequestDetailSidebar({
  req,
  tasks,
  canApprove,
  notes,
  onNotesChange,
  actionLoading,
  onApproval,
}: {
  req: ServiceRequest;
  tasks: RequestTask[];
  canApprove: boolean;
  notes: string;
  onNotesChange: (val: string) => void;
  actionLoading: boolean;
  onApproval: (action: 'approve' | 'reject') => void;
}) {
  const tRequests = useTranslations('pages.requests');
  const tActions = useTranslations('common.actions');

  return (
    <div className="space-y-6">
      {/* Legacy approval (only for items without workflow tasks) */}
      {canApprove && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tRequests('approval')}</h3>
          <textarea
            placeholder={tRequests('notesOptional')}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onApproval('reject')}
              disabled={actionLoading}
              className="flex-1 px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {tActions('reject')}
            </button>
            <button
              onClick={() => onApproval('approve')}
              disabled={actionLoading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {tActions('approve')}
            </button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-gray-900 mb-3">{tRequests('timeline')}</h3>
        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 flex-shrink-0" />
            <div>
              <p className="text-gray-900">{tRequests('requestSubmitted')}</p>
              <p className="text-gray-400 text-xs">{formatDateTime(req.created_at)}</p>
            </div>
          </div>
          {req.approved_at && (
            <div className="flex gap-3">
              <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${req.status === 'rejected' ? 'bg-red-500' : 'bg-green-500'}`} />
              <div>
                <p className="text-gray-900">
                  {req.status === 'rejected'
                    ? tRequests('rejectedBy', { name: req.approved_by_name ?? '' })
                    : tRequests('approvedByName', { name: req.approved_by_name ?? '' })}
                </p>
                <p className="text-gray-400 text-xs">{formatDateTime(req.approved_at)}</p>
              </div>
            </div>
          )}
          {/* Task completions */}
          {tasks.filter((t) => t.completed_at).map((t) => (
            <div key={t.id} className="flex gap-3">
              <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${t.outcome === 'rejected' ? 'bg-red-500' : 'bg-green-500'}`} />
              <div>
                <p className="text-gray-900">
                  {t.outcome === 'rejected'
                    ? tRequests('taskRejectedBy', { name: t.name, user: t.completed_by_name ?? '' })
                    : tRequests('taskCompletedBy', { name: t.name, user: t.completed_by_name ?? '' })}
                </p>
                <p className="text-gray-400 text-xs">{formatDateTime(t.completed_at)}</p>
              </div>
            </div>
          ))}
          {req.status === 'fulfilled' && (
            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-green-600 flex-shrink-0" />
              <div>
                <p className="text-gray-900 font-medium">{tRequests('requestFulfilled')}</p>
                <p className="text-gray-400 text-xs">{formatDateTime(req.updated_at)}</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
