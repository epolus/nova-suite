/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { requests as requestsApi, cmdb, auth } from '../../api/client';
import type { ServiceRequest, RequestTask, FormField } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';
import { isFulfillerRole } from '../../utils/roles';

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

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [req, setReq] = useState<ServiceRequest | null>(null);
  const [tasks, setTasks] = useState<RequestTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({});
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([
      requestsApi.get(id),
      requestsApi.tasks(id).catch(() => ({ tasks: [] as RequestTask[] })),
    ])
      .then(([reqRes, tasksRes]) => {
        if (cancelled) return;
        setReq(reqRes);
        setTasks(tasksRes.tasks);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReq(null);
        setTasks([]);
        setLoadError(err instanceof Error ? err.message : 'Failed to load request');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const listParams =
      (location.state as { listParams?: Record<string, string> } | null)?.listParams || {};
    requestsApi
      .nav(id, listParams)
      .then((nav) => {
        setPrevId(nav.prev_id);
        setNextId(nav.next_id);
      })
      .catch(() => {
        setPrevId(null);
        setNextId(null);
      });
  }, [id, location.state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prevId) {
        navigate(`/requests/${prevId}`, { state: location.state });
      } else if (e.key === 'ArrowRight' && nextId) {
        navigate(`/requests/${nextId}`, { state: location.state });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevId, nextId, navigate, location.state]);

  const handleApproval = async (action: 'approve' | 'reject') => {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await requestsApi.approve(id, action, notes || undefined);
      setReq(updated);
      setNotes('');
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTaskComplete = async (taskId: string, outcome: string) => {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await requestsApi.completeTask(id, taskId, {
        outcome,
        notes: taskNotes[taskId] || undefined,
      });
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
      setTaskNotes((prev) => ({ ...prev, [taskId]: '' }));
      // Refresh the request to get updated status
      const reqRes = await requestsApi.get(id);
      setReq(reqRes);
      // Reload tasks after a moment (workflow may have advanced to next group)
      setTimeout(async () => {
        const tasksRes = await requestsApi.tasks(id);
        setTasks(tasksRes.tasks);
      }, 1500);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (taskId: string) => {
    if (!id) return;
    try {
      const updated = await requestsApi.assignTask(id, taskId);
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <Spinner />;
  if (!req) {
    return (
      <>
        <PageHeader title="Request" description="This record could not be opened." />
        <Card>
          <p className="text-sm text-gray-700 mb-4">
            {loadError || 'This request was not found, or you do not have permission to view it.'}
          </p>
          <Link to="/requests" className="text-indigo-600 text-sm font-medium hover:text-indigo-800">
            &larr; Back to My Requests
          </Link>
        </Card>
      </>
    );
  }

  const hasTasks = tasks.length > 0;
  const canApprove =
    !hasTasks &&
    req.status === 'pending_approval' &&
    isFulfillerRole(user?.roles);

  // Group tasks by order
  const orderGroups = new Map<number, RequestTask[]>();
  for (const task of tasks) {
    const group = orderGroups.get(task.task_order) || [];
    group.push(task);
    orderGroups.set(task.task_order, group);
  }
  const sortedOrders = Array.from(orderGroups.keys()).sort((a, b) => a - b);

  // Compute overall progress
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const totalActive = tasks.filter((t) => t.status !== 'skipped').length;

  return (
    <>
      <PageHeader
        title={`Request ${req.number}`}
        description={(prevId || nextId) ? 'Use \u2190 / \u2192 to navigate records' : undefined}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevId}
              onClick={() => prevId && navigate(`/requests/${prevId}`, { state: location.state })}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous request (Left Arrow)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              disabled={!nextId}
              onClick={() => nextId && navigate(`/requests/${nextId}`, { state: location.state })}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next request (Right Arrow)"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              &larr; Back
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Request Details</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Service Item</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{req.service_item_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Requester</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{req.requester_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Priority</dt>
                <dd className="mt-0.5"><Badge value={req.priority} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-0.5"><Badge value={req.status} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{formatDateTime(req.created_at)}</dd>
              </div>
              {req.approved_by_name && (
                <div>
                  <dt className="text-gray-500">Approved by</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{req.approved_by_name} &middot; {formatDateTime(req.approved_at)}</dd>
                </div>
              )}
              {req.requested_for_name && req.requested_for !== req.requester_id && (
                <div>
                  <dt className="text-gray-500">Requested for</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{req.requested_for_name}</dd>
                </div>
              )}
              {req.batch_id && (
                <div>
                  <dt className="text-gray-500">Order</dt>
                  <dd className="font-medium text-indigo-600 mt-0.5">
                    Part of order ({req.batch_count || '?'} items)
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Form data */}
          {req.form_data && Object.keys(req.form_data).length > 0 && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Submitted Data</h3>
            <dl className="space-y-3 text-sm">
              {Object.entries(req.form_data).map(([key, value]) => {
                const fieldDef = req.form_schema?.fields?.find((f: FormField) => f.name === key);
                const label = fieldDef?.label || key.replace(/_/g, ' ');
                return (
                  <div key={key}>
                    <dt className="text-gray-500 capitalize">{label}</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">
                      {fieldDef?.type === 'cmdb_ref' && value ? (
                        <ResolvedCmdbRef ciId={String(value)} />
                      ) : fieldDef?.type === 'user_ref' && value ? (
                        <ResolvedUserRef userId={String(value)} />
                      ) : fieldDef?.type === 'checkbox' ? (
                        value === 'true' ? 'Yes' : 'No'
                      ) : (
                        String(value)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>
          )}

          {req.delivery_info && (req.delivery_info.location || req.delivery_info.date_needed || req.delivery_info.instructions) && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Delivery Information</h3>
              <dl className="space-y-3 text-sm">
                {req.delivery_info.location && (
                  <div>
                    <dt className="text-gray-500">Location</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">{req.delivery_info.location}</dd>
                  </div>
                )}
                {req.delivery_info.date_needed && (
                  <div>
                    <dt className="text-gray-500">Date Needed</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">{req.delivery_info.date_needed}</dd>
                  </div>
                )}
                {req.delivery_info.instructions && (
                  <div>
                    <dt className="text-gray-500">Special Instructions</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">{req.delivery_info.instructions}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {req.notes && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.notes}</p>
            </Card>
          )}

          {/* Workflow Tasks */}
          {hasTasks && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Fulfillment Tasks</h3>
                <span className="text-xs text-gray-500">{completedCount} / {totalActive} completed</span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-100 rounded-full mb-6 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                  style={{ width: `${totalActive > 0 ? (completedCount / totalActive) * 100 : 0}%` }}
                />
              </div>

              {/* Task groups */}
              <div className="space-y-4">
                {sortedOrders.map((order) => {
                  const group = orderGroups.get(order)!;
                  const isParallel = group.length > 1;
                  const groupDone = group.every((t) => ['completed', 'skipped', 'rejected'].includes(t.status));

                  return (
                    <div key={order} className={`rounded-xl border overflow-hidden ${groupDone ? 'border-green-200' : 'border-gray-200'}`}>
                      <div className={`px-4 py-2 flex items-center gap-2 ${groupDone ? 'bg-green-50' : 'bg-gray-50'} border-b border-gray-200`}>
                        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                          groupDone ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'
                        }`}>{order}</span>
                        <span className="text-xs font-medium text-gray-500">
                          Step {order}{isParallel ? ` (${group.length} parallel tasks)` : ''}
                        </span>
                      </div>
                      <div className={isParallel ? 'grid grid-cols-1 md:grid-cols-2 divide-x divide-gray-100' : ''}>
                        {group.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            requestId={id!}
                            currentUserId={user?.id}
                            approvalSubjectId={req.requested_for ?? req.requester_id}
                            actionLoading={actionLoading}
                            taskNote={taskNotes[task.id] || ''}
                            onNoteChange={(val) => setTaskNotes((prev) => ({ ...prev, [task.id]: val }))}
                            onComplete={handleTaskComplete}
                            onAssign={handleAssign}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Legacy approval (only for items without workflow tasks) */}
          {canApprove && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Approval</h3>
              <textarea
                placeholder="Add notes (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleApproval('reject')}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleApproval('approve')}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Timeline</h3>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-gray-900">Request submitted</p>
                  <p className="text-gray-400 text-xs">{formatDateTime(req.created_at)}</p>
                </div>
              </div>
              {req.approved_at && (
                <div className="flex gap-3">
                  <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${req.status === 'rejected' ? 'bg-red-500' : 'bg-green-500'}`} />
                  <div>
                    <p className="text-gray-900">{req.status === 'rejected' ? 'Rejected' : 'Approved'} by {req.approved_by_name}</p>
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
                      {t.name} — {t.outcome === 'rejected' ? 'Rejected' : 'Completed'}
                      {t.completed_by_name && ` by ${t.completed_by_name}`}
                    </p>
                    <p className="text-gray-400 text-xs">{formatDateTime(t.completed_at)}</p>
                  </div>
                </div>
              ))}
              {req.status === 'fulfilled' && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-gray-900 font-medium">Request fulfilled</p>
                    <p className="text-gray-400 text-xs">{formatDateTime(req.updated_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function TaskCard({
  task, requestId, currentUserId, approvalSubjectId, actionLoading, taskNote, onNoteChange, onComplete, onAssign,
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
        {task.assigned_group_name && <p>Group: {task.assigned_group_name}</p>}
        {task.assigned_to_name && <p>Assigned to: {task.assigned_to_name}</p>}
        {task.completed_by_name && <p>Completed by: {task.completed_by_name} at {formatDateTime(task.completed_at)}</p>}
        {task.outcome && <p>Outcome: <span className={task.outcome === 'approved' ? 'text-green-600' : 'text-red-600'}>{task.outcome}</span></p>}
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
              Assign to me
            </button>
          )}
          <textarea
            value={taskNote}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Notes (optional)..."
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
                Reject
              </button>
              <button
                onClick={() => onComplete(task.id, 'approved')}
                disabled={actionLoading}
                className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          ) : canComplete ? (
            <button
              onClick={() => onComplete(task.id, 'completed')}
              disabled={actionLoading}
              className="w-full px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Mark Complete
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResolvedCmdbRef({ ciId }: { ciId: string }) {
  const [label, setLabel] = useState<string>(ciId);
  useEffect(() => {
    cmdb.item(ciId).then((ci) => {
      setLabel(ci.name || ciId);
    }).catch(() => {});
  }, [ciId]);
  return (
    <Link to={`/cmdb/${ciId}`} className="text-indigo-600 hover:text-indigo-800 hover:underline">
      {label}
    </Link>
  );
}

function ResolvedUserRef({ userId }: { userId: string }) {
  const [label, setLabel] = useState<string>(userId);
  useEffect(() => {
    auth.users().then((res) => {
      const u = res.users.find((u: any) => u.id === userId);
      if (u) setLabel(u.display_name || u.email);
    }).catch(() => {});
  }, [userId]);
  return <span>{label}</span>;
}
