/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { temporal as temporalApi } from '../../api/client';
import type { WorkflowDetail, HistoryEvent } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { formatDateTime, formatTime } from '../../utils/dateTime';

const STATUS_COLORS: Record<string, string> = {
  Running: 'bg-blue-100 text-blue-800',
  Completed: 'bg-green-100 text-green-800',
  Failed: 'bg-red-100 text-red-800',
  Cancelled: 'bg-gray-100 text-gray-600',
  Terminated: 'bg-orange-100 text-orange-800',
  TimedOut: 'bg-yellow-100 text-yellow-800',
  ContinuedAsNew: 'bg-purple-100 text-purple-800',
};

const EVENT_COLORS: Record<string, string> = {
  WorkflowExecutionStarted: 'bg-blue-500',
  WorkflowExecutionCompleted: 'bg-green-500',
  WorkflowExecutionFailed: 'bg-red-500',
  WorkflowExecutionTimedOut: 'bg-yellow-500',
  WorkflowExecutionCancelled: 'bg-gray-400',
  WorkflowExecutionTerminated: 'bg-orange-500',
  WorkflowExecutionCancelRequested: 'bg-orange-400',
  WorkflowExecutionSignaled: 'bg-purple-500',
  WorkflowExecutionContinuedAsNew: 'bg-purple-400',
  ActivityTaskScheduled: 'bg-indigo-300',
  ActivityTaskStarted: 'bg-indigo-400',
  ActivityTaskCompleted: 'bg-indigo-500',
  ActivityTaskFailed: 'bg-red-400',
  ActivityTaskTimedOut: 'bg-yellow-400',
  ActivityTaskCancelled: 'bg-gray-300',
  TimerStarted: 'bg-cyan-300',
  TimerFired: 'bg-cyan-500',
  TimerCancelled: 'bg-cyan-200',
  WorkflowTaskScheduled: 'bg-gray-200',
  WorkflowTaskStarted: 'bg-gray-300',
  WorkflowTaskCompleted: 'bg-gray-400',
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = e - s;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ${Math.floor((diff % 60_000) / 1000)}s`;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

export default function WorkflowDetailPage() {
  const { workflowId, runId } = useParams<{ workflowId: string; runId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // Confirmation dialogs
  const [confirmAction, setConfirmAction] = useState<'terminate' | 'cancel' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!workflowId || !runId) return;
    setLoading(true);
    Promise.all([
      temporalApi.workflow(workflowId, runId),
      temporalApi.history(workflowId, runId, { limit: '50' }),
    ]).then(([wf, hist]) => {
      setDetail(wf);
      setEvents(hist.events);
      setNextPageToken(hist.nextPageToken);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workflowId, runId]);

  const loadMoreHistory = useCallback(async () => {
    if (!workflowId || !runId || !nextPageToken) return;
    setHistoryLoading(true);
    try {
      const res = await temporalApi.history(workflowId, runId, { limit: '50', pageToken: nextPageToken });
      setEvents((prev) => [...prev, ...res.events]);
      setNextPageToken(res.nextPageToken);
    } finally {
      setHistoryLoading(false);
    }
  }, [workflowId, runId, nextPageToken]);

  const toggleEvent = (eventId: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const handleAction = async () => {
    if (!workflowId || !runId || !confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction === 'terminate') {
        await temporalApi.terminate(workflowId, runId, actionReason || undefined);
      } else {
        await temporalApi.cancel(workflowId, runId);
      }
      // Refresh detail
      const wf = await temporalApi.workflow(workflowId, runId);
      setDetail(wf);
      setConfirmAction(null);
      setActionReason('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (!detail) return <p className="text-center text-gray-400 py-12">Workflow not found</p>;

  const isRunning = detail.status === 'Running';

  return (
    <>
      <PageHeader
        title={detail.workflowId}
        description={`${detail.type} workflow`}
        action={
          <div className="flex items-center gap-2">
            {isRunning && (
              <>
                <button
                  onClick={() => setConfirmAction('cancel')}
                  className="px-4 py-2 border border-yellow-300 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setConfirmAction('terminate')}
                  className="px-4 py-2 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  Terminate
                </button>
              </>
            )}
            <button
              onClick={() => navigate('/admin/workflows')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to list
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Info card */}
        <div className="lg:col-span-2">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Execution Details</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="mt-0.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[detail.status] || 'bg-gray-100 text-gray-600'}`}>
                    {detail.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Type</dt>
                <dd className="mt-0.5 font-mono text-gray-900">{detail.type}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Task Queue</dt>
                <dd className="mt-0.5 font-mono text-gray-900">{detail.taskQueue || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Duration</dt>
                <dd className="mt-0.5 text-gray-900">{formatDuration(detail.startTime, detail.closeTime)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Start Time</dt>
                <dd className="mt-0.5 text-gray-900">{formatDateTime(detail.startTime)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Close Time</dt>
                <dd className="mt-0.5 text-gray-900">{formatDateTime(detail.closeTime)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">History Events</dt>
                <dd className="mt-0.5 text-gray-900">{detail.historyLength}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Run ID</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-600 break-all">{detail.runId}</dd>
              </div>
              {detail.parentExecution && (
                <div className="col-span-2">
                  <dt className="text-gray-500">Parent Workflow</dt>
                  <dd className="mt-0.5">
                    <button
                      onClick={() => navigate(`/admin/workflows/${encodeURIComponent(detail.parentExecution!.workflowId)}/${encodeURIComponent(detail.parentExecution!.runId)}`)}
                      className="text-indigo-600 hover:text-indigo-800 font-mono text-xs"
                    >
                      {detail.parentExecution.workflowId}
                    </button>
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>

        {/* Memo / Search Attributes */}
        <div>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Search Attributes</h3>
            {Object.keys(detail.searchAttributes).length > 0 ? (
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-60">
                {JSON.stringify(detail.searchAttributes, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-400">No search attributes</p>
            )}
            {detail.memo && Object.keys(detail.memo).length > 0 && (
              <>
                <h3 className="font-semibold text-gray-900 mt-4 mb-2">Memo</h3>
                <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-40">
                  {JSON.stringify(detail.memo, null, 2)}
                </pre>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* History timeline */}
      <Card>
        <h3 className="font-semibold text-gray-900 mb-4">
          History <span className="text-gray-400 font-normal text-sm">({events.length} events loaded)</span>
        </h3>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-1">
            {events.map((evt) => {
              const isExpanded = expandedEvents.has(evt.eventId);
              const dotColor = EVENT_COLORS[evt.eventType] || 'bg-gray-300';
              const isImportant = !evt.eventType.startsWith('WorkflowTask');

              return (
                <div key={evt.eventId} className={`relative pl-10 ${isImportant ? 'py-2' : 'py-0.5'}`}>
                  {/* Dot */}
                  <div className={`absolute left-2.5 top-3 w-3 h-3 rounded-full ${dotColor} ring-2 ring-white`} />

                  <button
                    onClick={() => toggleEvent(evt.eventId)}
                    className="flex items-center gap-2 w-full text-left group"
                  >
                    <span className="text-xs text-gray-400 w-6 text-right flex-shrink-0">
                      {evt.eventId}
                    </span>
                    <span className={`text-xs font-medium ${isImportant ? 'text-gray-900' : 'text-gray-400'}`}>
                      {evt.eventType}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                      {formatTime(evt.timestamp)}
                    </span>
                    {evt.attributes && (
                      <span className="text-gray-300 group-hover:text-gray-500 text-xs">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    )}
                  </button>

                  {isExpanded && evt.attributes && (
                    <div className="mt-1 ml-8">
                      <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-60">
                        {JSON.stringify(evt.attributes, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {nextPageToken && (
            <div className="pl-10 pt-3">
              <button
                onClick={loadMoreHistory}
                disabled={historyLoading}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {historyLoading ? 'Loading...' : 'Load more events'}
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-2">
                {confirmAction === 'terminate' ? 'Terminate Workflow' : 'Cancel Workflow'}
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                {confirmAction === 'terminate'
                  ? 'This will immediately terminate the workflow. This action cannot be undone.'
                  : 'This will request graceful cancellation of the workflow.'}
              </p>
              {confirmAction === 'terminate' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Reason (optional)</label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. No longer needed"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setConfirmAction(null); setActionReason(''); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Go back
                </button>
                <button
                  onClick={handleAction}
                  disabled={actionLoading}
                  className={`px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
                    confirmAction === 'terminate' ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'
                  }`}
                >
                  {actionLoading ? 'Processing...' : confirmAction === 'terminate' ? 'Terminate' : 'Cancel Workflow'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
