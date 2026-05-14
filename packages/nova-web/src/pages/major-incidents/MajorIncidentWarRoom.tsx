/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { majorIncidents as majorIncidentsApi } from '../../api/client';
import { buildMajorIncidentFeedItems, MajorIncidentTimelineList } from './majorIncidentTimeline';
import { useAuth } from '../../context/AuthContext';
import { canManageMajorIncidents } from '../../utils/roles';

type Detail = Awaited<ReturnType<typeof majorIncidentsApi.get>>;

export default function MajorIncidentWarRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = canManageMajorIncidents(user?.roles);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateBody, setUpdateBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveSolution, setResolveSolution] = useState('');
  const [suggested, setSuggested] = useState<Record<string, unknown>[]>([]);
  const [suggLoading, setSuggLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const suggestedLoadedForMi = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await majorIncidentsApi.get(id);
      setData(d);
      setErr('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const sendUpdate = async () => {
    if (!id || !updateBody.trim()) return;
    setSaving(true);
    try {
      await majorIncidentsApi.addStakeholderUpdate(id, { body: updateBody.trim(), audience: 'external' });
      setUpdateBody('');
      setUpdateOpen(false);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to send update');
    } finally {
      setSaving(false);
    }
  };

  const requestResolve = async () => {
    if (!id) return;
    const solution = resolveSolution.trim();
    if (!solution) return;
    setSaving(true);
    try {
      await majorIncidentsApi.resolve(id, { solution });
      setResolveModalOpen(false);
      setResolveSolution('');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to resolve');
    } finally {
      setSaving(false);
    }
  };

  const acceptAsMajor = async () => {
    if (!id) return;
    setAcceptBusy(true);
    try {
      await majorIncidentsApi.acceptMajor(id);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to accept');
    } finally {
      setAcceptBusy(false);
    }
  };

  const confirmRejectPromotion = async () => {
    if (!id) return;
    const reason = rejectReason.trim().slice(0, 2000);
    setRejectBusy(true);
    try {
      await majorIncidentsApi.rejectPromotion(id, reason ? { reason } : undefined);
      setRejectModalOpen(false);
      setRejectReason('');
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to reject promotion');
    } finally {
      setRejectBusy(false);
    }
  };

  const loadSuggested = useCallback(async () => {
    if (!id) return;
    setSuggLoading(true);
    try {
      const r = await majorIncidentsApi.suggestedRelated(id);
      setSuggested((r.incidents ?? []) as Record<string, unknown>[]);
    } catch {
      setSuggested([]);
    } finally {
      setSuggLoading(false);
    }
  }, [id]);

  useEffect(() => {
    suggestedLoadedForMi.current = null;
  }, [id]);

  useEffect(() => {
    if (!id || loading || !data || !canManage) return;
    const st = String((data.major_incident as Record<string, unknown>).status ?? '');
    if (st === 'pending_acceptance') return;
    if (suggestedLoadedForMi.current === id) return;
    suggestedLoadedForMi.current = id;
    void loadSuggested();
  }, [id, loading, data, canManage, loadSuggested]);

  const linkIncident = async (incidentId: string) => {
    if (!id) return;
    setLinkBusy(incidentId);
    try {
      await majorIncidentsApi.linkRelated(id, { incident_id: incidentId, link_reason: 'Linked from war room' });
      await load();
      await loadSuggested();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to link incident');
    } finally {
      setLinkBusy(null);
    }
  };

  if (loading) return <Spinner />;
  if (!data?.major_incident) {
    return (
      <>
        <PageHeader title="Major incident" />
        <Card><p className="text-sm text-gray-600">{err || 'Not found'}</p></Card>
      </>
    );
  }

  const mi = data.major_incident as Record<string, string | number | string[] | null>;
  const miNumber = mi.number != null && String(mi.number).length > 0 ? String(mi.number) : '';
  const pageTitle = miNumber ? `${miNumber} — ${String(mi.title)}` : String(mi.title);
  const isPendingAcceptance = mi.status === 'pending_acceptance';
  const related = (data.related_incidents || []) as Record<string, unknown>[];
  const linkedIdSet = new Set(related.map((r) => String(r.incident_id)));
  const primaryIncidentId = mi.primary_incident_id != null && mi.primary_incident_id !== ''
    ? String(mi.primary_incident_id)
    : '';
  const suggestedToShow = suggested.filter((s) => !linkedIdSet.has(String(s.id)));
  const feedItems = buildMajorIncidentFeedItems(
    (data.events || []) as Record<string, unknown>[],
    (data.stakeholder_updates || []) as Record<string, unknown>[],
    String(mi.id ?? id ?? ''),
  );

  return (
    <>
      <PageHeader
        title={pageTitle}
        description={
          isPendingAcceptance
            ? `Status: ${mi.status} · Workflow: not started (pending acceptance)`
            : `Status: ${mi.status} · Workflow: ${data.workflow_status?.phase ?? 'n/a'}`
        }
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/major-incidents')}>All major incidents</Button>
            {!isPendingAcceptance && canManage && (
              <Link
                to={`/major-incidents/${id}/postmortem`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Postmortem
              </Link>
            )}
            {!isPendingAcceptance && canManage && (
              <Button type="button" onClick={() => setUpdateOpen(true)}>Send update</Button>
            )}
            {!isPendingAcceptance && canManage && mi.status !== 'resolved' && mi.status !== 'cancelled' && (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-500 text-white border-0"
                onClick={() => { setResolveSolution(''); setResolveModalOpen(true); }}
                disabled={saving}
              >
                Declare resolved
              </Button>
            )}
          </div>
        )}
      />

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {isPendingAcceptance && canManage && (
        <Card className="mb-4 border-amber-200 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/45">
          <p className="text-sm text-amber-950 dark:text-amber-50 mb-3 leading-relaxed">
            This record was promoted from an incident and is <strong className="dark:text-amber-100">pending acceptance</strong> as a major incident.
            Until it is accepted, no workflow runs and war-room actions stay disabled.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={acceptAsMajor} disabled={acceptBusy || rejectBusy}>
              {acceptBusy ? 'Accepting…' : 'Accept as major incident'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setRejectReason(''); setRejectModalOpen(true); }}
              disabled={acceptBusy || rejectBusy}
            >
              Reject promotion
            </Button>
          </div>
        </Card>
      )}
      {isPendingAcceptance && !canManage && (
        <Card className="mb-4 border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/40">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This major incident is <strong>pending acceptance</strong> by a user with the <strong>major incident manager</strong> role.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">Live feed</h3>
                <p className="text-xs text-gray-500 mt-0.5">Stakeholder updates and major-incident events, newest first.</p>
              </div>
            </div>
            <MajorIncidentTimelineList items={feedItems} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Roles</h3>
            <ul className="text-sm space-y-2">
              {(data.participants || []).map((p) => (
                <li key={String((p as Record<string, unknown>).id)} className="flex justify-between gap-2">
                  <span className="text-gray-500 capitalize">{String((p as Record<string, unknown>).role).replace(/_/g, ' ')}</span>
                  <span className="font-medium text-gray-900">{String((p as Record<string, unknown>).display_name)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-2">Runbooks</h3>
            <ul className="text-sm space-y-1 text-gray-800">
              {(data.suggested_runbooks || []).map((rb) => (
                <li key={String((rb as Record<string, unknown>).id)}>
                  {String((rb as Record<string, unknown>).article_number)} — {String((rb as Record<string, unknown>).article_title)}
                </li>
              ))}
            </ul>
            {(data.suggested_runbooks || []).length === 0 && (
              <p className="text-xs text-gray-500">No runbook links for affected services.</p>
            )}
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">Linked incidents</h3>
              {!isPendingAcceptance && canManage && (
                <Button type="button" variant="outline" className="text-xs h-8" onClick={() => void loadSuggested()} disabled={suggLoading}>
                  {suggLoading ? 'Refreshing…' : 'Refresh suggestions'}
                </Button>
              )}
            </div>
            {related.length === 0 ? (
              <p className="text-xs text-gray-500">No incidents linked yet.</p>
            ) : (
              <ul className="text-sm space-y-2">
                {related.map((r) => {
                  const iid = String(r.incident_id);
                  const isPrimary = primaryIncidentId !== '' && iid === primaryIncidentId;
                  return (
                    <li key={iid} className="flex flex-wrap items-center gap-2">
                      <Link to={`/incidents/${iid}`} className="text-indigo-700 hover:underline font-medium">
                        {String(r.incident_number)} — {String(r.incident_title)}
                      </Link>
                      {isPrimary && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!isPendingAcceptance && canManage && suggestedToShow.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-600 mb-2">Suggested (same window / services)</p>
                <ul className="text-sm space-y-2">
                  {suggestedToShow.map((s) => {
                    const sid = String(s.id);
                    return (
                      <li key={sid} className="flex items-center justify-between gap-2">
                        <Link to={`/incidents/${sid}`} className="text-indigo-700 hover:underline truncate">
                          {String(s.number)} — {String(s.title)}
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          className="text-xs h-8 shrink-0"
                          disabled={linkBusy !== null}
                          onClick={() => void linkIncident(sid)}
                        >
                          {linkBusy === sid ? 'Linking…' : 'Add'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>

      {updateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h4 className="font-semibold text-lg mb-2">Stakeholder update</h4>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[140px]"
              value={updateBody}
              onChange={(e) => setUpdateBody(e.target.value)}
              placeholder="Customer-safe status update..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" type="button" onClick={() => setUpdateOpen(false)}>Cancel</Button>
              <Button type="button" onClick={sendUpdate} disabled={saving || !updateBody.trim()}>
                {saving ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h4 className="font-semibold text-lg mb-2">Reject promotion</h4>
            <p className="text-sm text-gray-600 mb-3">
              The proposed major incident will be discarded and the source incident stays open. This cannot be undone.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional, shown in the timeline)</label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[100px]"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why this should not be a major incident…"
              maxLength={2000}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" type="button" onClick={() => setRejectModalOpen(false)} disabled={rejectBusy}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-rose-600 hover:bg-rose-500 text-white border-0"
                onClick={() => void confirmRejectPromotion()}
                disabled={rejectBusy}
              >
                {rejectBusy ? 'Rejecting…' : 'Reject promotion'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {resolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h4 className="font-semibold text-lg mb-2">Declare resolved</h4>
            <p className="text-sm text-gray-600 mb-3">
              Describe how the incident was mitigated or fixed. This is stored on the major incident and appears in the live feed.
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Resolution summary</label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[120px]"
              value={resolveSolution}
              onChange={(e) => setResolveSolution(e.target.value)}
              placeholder="Root cause, fix, verification…"
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                type="button"
                onClick={() => { setResolveModalOpen(false); setResolveSolution(''); }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-500 text-white border-0"
                onClick={() => void requestResolve()}
                disabled={saving || !resolveSolution.trim()}
              >
                {saving ? 'Submitting…' : 'Declare resolved'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
