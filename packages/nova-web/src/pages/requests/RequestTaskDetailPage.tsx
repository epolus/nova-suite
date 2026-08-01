/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { requests as requestsApi } from '../../api/client';
import type { RequestTaskListItem } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';

const TYPE_BADGE: Record<string, string> = {
  approval: 'bg-amber-100 text-amber-700 border border-amber-200',
  manual: 'bg-blue-100 text-blue-700 border border-blue-200',
  automated: 'bg-purple-100 text-purple-700 border border-purple-200',
};

export default function RequestTaskDetailPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { taskId = '' } = useParams();
  const tRequests = useTranslations('pages.requests');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tTable = useTranslations('common.table');
  const [task, setTask] = useState<RequestTaskListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    requestsApi.task(taskId)
      .then((res) => {
        setTask(res);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || tRequests('loadTaskFailed'));
        setLoading(false);
      });
  }, [taskId, tRequests]);

  const refresh = async () => {
    if (!taskId) return;
    const res = await requestsApi.task(taskId);
    setTask(res);
  };

  const handleAssign = async () => {
    if (!task) return;
    setActionLoading(true);
    try {
      await requestsApi.assignTask(task.request_id, task.id);
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (outcome: 'approved' | 'rejected' | 'completed') => {
    if (!task) return;
    setActionLoading(true);
    try {
      await requestsApi.completeTask(task.request_id, task.id, { outcome });
      await refresh();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (!task) {
    return (
      <>
        <PageHeader title={tRequests('taskDetailTitle')} description={tRequests('taskDetailDescription')} />
        <Card>
          <p className="text-sm text-red-600">{error || tRequests('taskNotFound')}</p>
        </Card>
      </>
    );
  }

  const isActive = task.status === 'in_progress';
  const canTakeAction = task.status === 'pending' || isActive;
  const approvalSubjectId = task.requested_for ?? task.requester_id;
  const isSelfApprovalBlocked = task.task_type === 'approval' && approvalSubjectId === user?.id;
  const canAssignToMe = canTakeAction && task.task_type !== 'approval' && !task.assigned_to;
  const canApproveReject = isActive && task.task_type === 'approval' && !isSelfApprovalBlocked;
  const canComplete = isActive && task.task_type !== 'approval';
  const hasActions = canAssignToMe || canApproveReject || canComplete;

  return (
    <>
      <PageHeader
        title={task.name}
        description={tRequests('taskNumber', { number: task.number })}
        action={
          <div className="flex items-center gap-2">
            <Link
              to="/request-tasks"
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              {tRequests('backToRequestTasks')}
            </Link>
            <button
              onClick={() => navigate(`/requests/${task.request_id}`)}
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              {tRequests('openRequest')}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={task.status} />
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[task.task_type] || 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                {task.task_type}
              </span>
              <span className="text-xs text-gray-400">#{task.number}</span>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tRequests('requestContext')}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  to={`/requests/${task.request_id}`}
                  className="font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  {task.request_number}
                </Link>
                <span className="text-gray-400">•</span>
                <span className="text-gray-700">{task.service_item_name}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{tRequests('requesterLabel', { name: task.requester_name })}</p>
            </div>

            {task.description && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tFields('description')}</h3>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tRequests('instructions')}</h3>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{task.instructions || tTable('emDash')}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{tRequests('taskNotes')}</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.notes || tTable('emDash')}</p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{tRequests('taskDetails')}</h3>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-500">{tRequests('request')}</span>
              <div className="font-medium">
                <Link to={`/requests/${task.request_id}`} className="text-indigo-600 hover:text-indigo-800">
                  {task.request_number}
                </Link>
              </div>
            </div>
            <div><span className="text-gray-500">{tRequests('requestStatus')}</span><div className="font-medium">{task.request_status}</div></div>
            <div><span className="text-gray-500">{tRequests('assignedGroup')}</span><div className="font-medium">{task.assigned_group_name || tTable('emDash')}</div></div>
            <div><span className="text-gray-500">{tFields('assignedTo')}</span><div className="font-medium">{task.assigned_to_name || tRequests('unassigned')}</div></div>
            <div><span className="text-gray-500">{tFields('created')}</span><div className="font-medium">{formatDateTime(task.created_at)}</div></div>
            <div><span className="text-gray-500">{tRequests('complete')}</span><div className="font-medium">{formatDateTime(task.completed_at)}</div></div>
          </div>

          {canTakeAction && hasActions && (
            <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
              {canAssignToMe && (
                <button
                  onClick={handleAssign}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 disabled:opacity-50"
                >
                  {tRequests('assignToMe')}
                </button>
              )}
              {canApproveReject && (
                <>
                  <button
                    onClick={() => handleComplete('rejected')}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                  >
                    {tActions('reject')}
                  </button>
                  <button
                    onClick={() => handleComplete('approved')}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {tActions('approve')}
                  </button>
                </>
              )}
              {canComplete && (
                <button
                  onClick={() => handleComplete('completed')}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {tRequests('complete')}
                </button>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </Card>
      </div>
    </>
  );
}
