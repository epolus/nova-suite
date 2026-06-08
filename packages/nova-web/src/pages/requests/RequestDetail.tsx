/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { requests as requestsApi } from '../../api/client';
import type { ServiceRequest, RequestTask, FormField } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';
import { isFulfillerRole } from '../../utils/roles';
import { useFieldLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { TaskCard } from './RequestTaskCard';
import { ResolvedCmdbRef, ResolvedUserRef } from './ResolvedRefs';
import { RequestDetailSidebar } from './RequestDetailSidebar';

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const tRequests = useTranslations('pages.requests');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tStates = useTranslations('common.states');
  const fieldLabel = useFieldLabel();
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
        setLoadError(err instanceof Error ? err.message : tRequests('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tRequests]);

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
        <PageHeader title={tRequests('notFoundTitle')} description={tRequests('notFoundDescription')} />
        <Card>
          <p className="text-sm text-gray-700 mb-4">
            {loadError || tRequests('notFoundMessage')}
          </p>
          <Link to="/requests" className="text-indigo-600 text-sm font-medium hover:text-indigo-800">
            &larr; {tRequests('backToMyRequests')}
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
        title={`${tRequests('request')} ${req.number}`}
        description={(prevId || nextId) ? tMaster('navigateRecords') : undefined}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevId}
              onClick={() => prevId && navigate(`/requests/${prevId}`, { state: location.state })}
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              title={tRequests('previousRequest')}
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
              title={tRequests('nextRequest')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              &larr; {tActions('back')}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tRequests('requestDetails')}</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">{tRequests('serviceItem')}</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{req.service_item_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{tRequests('requester')}</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{req.requester_name}</dd>
              </div>
              <div>
                <dt className="text-gray-500">{fieldLabel('priority')}</dt>
                <dd className="mt-0.5"><Badge value={req.priority} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">{fieldLabel('status')}</dt>
                <dd className="mt-0.5"><Badge value={req.status} /></dd>
              </div>
              <div>
                <dt className="text-gray-500">{fieldLabel('created')}</dt>
                <dd className="font-medium text-gray-900 mt-0.5">{formatDateTime(req.created_at)}</dd>
              </div>
              {req.approved_by_name && (
                <div>
                  <dt className="text-gray-500">{tRequests('approvedBy')}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{req.approved_by_name} &middot; {formatDateTime(req.approved_at)}</dd>
                </div>
              )}
              {req.requested_for_name && req.requested_for !== req.requester_id && (
                <div>
                  <dt className="text-gray-500">{tRequests('requestedFor')}</dt>
                  <dd className="font-medium text-gray-900 mt-0.5">{req.requested_for_name}</dd>
                </div>
              )}
              {req.batch_id && (
                <div>
                  <dt className="text-gray-500">{tRequests('order')}</dt>
                  <dd className="font-medium text-indigo-600 mt-0.5">
                    {tRequests('partOfOrder', { count: req.batch_count || '?' })}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Form data */}
          {req.form_data && Object.keys(req.form_data).length > 0 && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tRequests('submittedData')}</h3>
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
                        value === 'true' ? tStates('yes') : tStates('no')
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
              <h3 className="font-semibold text-gray-900 mb-4">{tRequests('deliveryInformation')}</h3>
              <dl className="space-y-3 text-sm">
                {req.delivery_info.location && (
                  <div>
                    <dt className="text-gray-500">{fieldLabel('location')}</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">{req.delivery_info.location}</dd>
                  </div>
                )}
                {req.delivery_info.date_needed && (
                  <div>
                    <dt className="text-gray-500">{tRequests('dateNeeded')}</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">{req.delivery_info.date_needed}</dd>
                  </div>
                )}
                {req.delivery_info.instructions && (
                  <div>
                    <dt className="text-gray-500">{tRequests('specialInstructions')}</dt>
                    <dd className="font-medium text-gray-900 mt-0.5">{req.delivery_info.instructions}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {req.notes && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-2">{fieldLabel('notes')}</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{req.notes}</p>
            </Card>
          )}

          {/* Workflow Tasks */}
          {hasTasks && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">{tRequests('fulfillmentTasks')}</h3>
                <span className="text-xs text-gray-500">{tRequests('completedCount', { completed: completedCount, total: totalActive })}</span>
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
                          {tRequests('step', { order })}{isParallel ? ` ${tRequests('parallelTasks', { count: group.length })}` : ''}
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
        <RequestDetailSidebar
          req={req}
          tasks={tasks}
          canApprove={canApprove}
          notes={notes}
          onNotesChange={setNotes}
          actionLoading={actionLoading}
          onApproval={handleApproval}
        />
      </div>
    </>
  );
}
