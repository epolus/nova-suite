/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { majorIncidents as majorIncidentsApi } from '../../api/client';
import { MajorIncidentTimelineList } from './majorIncidentTimeline';
import { useMajorIncidentTimeline } from './majorIncidentFeed';
import { useAuth } from '../../context/AuthContext';
import { canManageMajorIncidents } from '../../utils/roles';
import { RejectPromotionModal, ResolveModal, StakeholderUpdateModal } from './warRoomModals';

type Detail = Awaited<ReturnType<typeof majorIncidentsApi.get>>;

export default function MajorIncidentWarRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useTranslations('pages.majorIncidents.warRoom');
  const tPostmortem = useTranslations('pages.majorIncidents.postmortem');
  const { buildFeedItems } = useMajorIncidentTimeline();
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
      setErr(e instanceof Error ? e.message : t('loadFailed'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
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
      setErr(e instanceof Error ? e.message : t('sendUpdateFailed'));
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
      setErr(e instanceof Error ? e.message : t('resolveFailed'));
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
      setErr(e instanceof Error ? e.message : t('acceptFailed'));
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
      setErr(e instanceof Error ? e.message : t('rejectFailed'));
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
      await majorIncidentsApi.linkRelated(id, { incident_id: incidentId, link_reason: t('linkReason') });
      await load();
      await loadSuggested();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('linkFailed'));
    } finally {
      setLinkBusy(null);
    }
  };

  if (loading) return <Spinner />;
  if (!data?.major_incident) {
    return (
      <>
        <PageHeader title={t('notFoundTitle')} />
        <Card><p className="text-sm text-gray-600">{err || t('notFound')}</p></Card>
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
  const feedItems = buildFeedItems(
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
            ? t('statusPendingDescription', { status: String(mi.status) })
            : t('statusDescription', {
                status: String(mi.status),
                phase: data.workflow_status?.phase ?? t('workflowNotAvailable'),
              })
        }
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/major-incidents')}>{t('allMajorIncidents')}</Button>
            {!isPendingAcceptance && canManage && (
              <Link
                to={`/major-incidents/${id}/postmortem`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                {tPostmortem('title')}
              </Link>
            )}
            {!isPendingAcceptance && canManage && (
              <Button type="button" onClick={() => setUpdateOpen(true)}>{t('sendUpdate')}</Button>
            )}
            {!isPendingAcceptance && canManage && mi.status !== 'resolved' && mi.status !== 'cancelled' && (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-500 text-white border-0"
                onClick={() => { setResolveSolution(''); setResolveModalOpen(true); }}
                disabled={saving}
              >
                {t('declareResolved')}
              </Button>
            )}
          </div>
        )}
      />

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}

      {isPendingAcceptance && canManage && (
        <Card className="mb-4 border-amber-200 bg-amber-50/80 dark:border-amber-700 dark:bg-amber-950/45">
          <p className="text-sm text-amber-950 dark:text-amber-50 mb-3 leading-relaxed">
            {t('pendingAcceptanceManagerPrefix')}{' '}
            <strong className="dark:text-amber-100">{t('pendingAcceptance')}</strong>{' '}
            {t('pendingAcceptanceManagerSuffix')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={acceptAsMajor} disabled={acceptBusy || rejectBusy}>
              {acceptBusy ? t('accepting') : t('acceptAsMajor')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setRejectReason(''); setRejectModalOpen(true); }}
              disabled={acceptBusy || rejectBusy}
            >
              {t('rejectPromotion')}
            </Button>
          </div>
        </Card>
      )}
      {isPendingAcceptance && !canManage && (
        <Card className="mb-4 border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/40">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('pendingAcceptanceReadOnlyPrefix')}{' '}
            <strong>{t('pendingAcceptance')}</strong>{' '}
            {t('pendingAcceptanceReadOnlyMiddle')}{' '}
            <strong>{t('majorIncidentManagerRole')}</strong>{' '}
            {t('roleSuffix')}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{t('liveFeed')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{t('liveFeedDescription')}</p>
              </div>
            </div>
            <MajorIncidentTimelineList items={feedItems} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">{t('roles')}</h3>
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
            <h3 className="font-semibold text-gray-900 mb-2">{t('runbooks')}</h3>
            <ul className="text-sm space-y-1 text-gray-800">
              {(data.suggested_runbooks || []).map((rb) => (
                <li key={String((rb as Record<string, unknown>).id)}>
                  {String((rb as Record<string, unknown>).article_number)} — {String((rb as Record<string, unknown>).article_title)}
                </li>
              ))}
            </ul>
            {(data.suggested_runbooks || []).length === 0 && (
              <p className="text-xs text-gray-500">{t('noRunbooks')}</p>
            )}
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">{t('linkedIncidents')}</h3>
              {!isPendingAcceptance && canManage && (
                <Button type="button" variant="outline" className="text-xs h-8" onClick={() => void loadSuggested()} disabled={suggLoading}>
                  {suggLoading ? t('refreshing') : t('refreshSuggestions')}
                </Button>
              )}
            </div>
            {related.length === 0 ? (
              <p className="text-xs text-gray-500">{t('noLinkedIncidents')}</p>
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
                          {t('primary')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!isPendingAcceptance && canManage && suggestedToShow.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-600 mb-2">{t('suggestedSameWindow')}</p>
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
                          {linkBusy === sid ? t('linking') : t('add')}
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
        <StakeholderUpdateModal
          body={updateBody}
          onChange={setUpdateBody}
          onClose={() => setUpdateOpen(false)}
          onSend={sendUpdate}
          saving={saving}
        />
      )}

      {rejectModalOpen && (
        <RejectPromotionModal
          reason={rejectReason}
          onChange={setRejectReason}
          onClose={() => setRejectModalOpen(false)}
          onConfirm={() => void confirmRejectPromotion()}
          rejecting={rejectBusy}
        />
      )}

      {resolveModalOpen && (
        <ResolveModal
          solution={resolveSolution}
          onChange={setResolveSolution}
          onClose={() => { setResolveModalOpen(false); setResolveSolution(''); }}
          onConfirm={() => void requestResolve()}
          saving={saving}
        />
      )}
    </>
  );
}
