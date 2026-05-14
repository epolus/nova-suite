/* SPDX-License-Identifier: AGPL-3.0-only */
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { attachments as attachmentsApi, knowledge as knowledgeApi, majorIncidents as majorIncidentsApi, incidents as incidentsApi } from '../../api/client';
import type { JournalEntry, KnowledgeSuggestion, KnowledgeArticleDetail } from '../../api/client';
import { AttachmentCard } from '../../components/AttachmentCard';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { formatDateTime } from '../../utils/dateTime';
import { Button } from '../../components/ui/button';
import { Card as UiCard, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useIncidentDetail } from './useIncidentDetail';
import { SimilarIncidentsSection, KbSuggestionsSection } from '../../components/IncidentSidebarSections';
import type { UserListItem, ServiceListItem, CI, Problem } from '../../api/client';
import { canCreateMajorIncidentRecord } from '../../utils/roles';

export default function IncidentDetail() {
  const [previewArticle, setPreviewArticle] = useState<KnowledgeArticleDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewAttachmentUrls, setPreviewAttachmentUrls] = useState<Record<string, string>>({});
  const [declareMajorBusy, setDeclareMajorBusy] = useState(false);
  const [declareMajorErr, setDeclareMajorErr] = useState('');

  const {
    user, navigate, prevId, nextId, goTo,
    inc, journal, loading, loadError,
    assignmentGroups, services, ciOptions, users, problemOptions, groupMembers,
    fields, setField,
    callerInfo, selectedProblem, requiredFieldMissing,
    isFulfiller, isClosed, isResolved, isCaller, readonly,
    saving, formError, intelligenceOpen, setIntelligenceOpen,
    fileAttachments, uploading, dragOver, setDragOver, fileInputRef,
    previewUrl, previewName, closePreview,
    journalContent, setJournalContent, journalType, setJournalType, journalVisible, setJournalVisible,
    similarIncidents, kbSuggestions, loadingSidebar, sidebarError,
    kbResolveOpen, setKbResolveOpen,
    handleUpdate, handleReopen, handleCancel, handleAddJournal, handleResolveWithKb,
    handleFileUpload, handleDrop, handleDeleteAttachment, handlePreview, formatSize,
    refresh,
  } = useIncidentDetail();

  const [linkMajorSelect, setLinkMajorSelect] = useState('');
  const [linkableMajors, setLinkableMajors] = useState<Array<{ id: string; number: string; title: string; status: string }>>([]);
  const [linkMajorBusy, setLinkMajorBusy] = useState(false);
  const [linkMajorErr, setLinkMajorErr] = useState('');

  useEffect(() => {
    if (!inc || !isFulfiller || readonly || isClosed || isResolved) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await majorIncidentsApi.list({ status_not_in: 'resolved,cancelled,pending_acceptance' }, 1, 50);
        const rows = (res.major_incidents as Array<{ id: string; number: string; title: string; status: string }>) ?? [];
        if (!cancelled) setLinkableMajors(rows);
      } catch {
        if (!cancelled) setLinkableMajors([]);
      }
    })();
    return () => { cancelled = true; };
  }, [inc?.id, isFulfiller, readonly, isClosed, isResolved]);

  const openKnowledgePreview = async (articleId: string) => {
    setPreviewError('');
    setPreviewLoading(true);
    try {
      const article = await knowledgeApi.article(articleId);
      setPreviewArticle(article);
    } catch (err: unknown) {
      setPreviewArticle(null);
      setPreviewError(err instanceof Error ? err.message : 'Failed to load article preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeclareMajor = async () => {
    if (!inc) return;
    setDeclareMajorErr('');
    setDeclareMajorBusy(true);
    try {
      const res = await majorIncidentsApi.create({
        title: inc.title,
        description: inc.description ?? undefined,
        priority: inc.priority <= 2 ? inc.priority : 2,
        impact: inc.impact as 'low' | 'medium' | 'high',
        urgency: inc.urgency as 'low' | 'medium' | 'high',
        primary_incident_id: inc.id,
        affected_service_ids: inc.service_id ? [inc.service_id] : [],
      });
      const mid = (res.major_incident as { id: string }).id;
      navigate(`/major-incidents/${mid}`);
    } catch (err: unknown) {
      setDeclareMajorErr(err instanceof Error ? err.message : 'Failed to promote to major incident');
    } finally {
      setDeclareMajorBusy(false);
    }
  };

  const handleLinkMajor = async () => {
    if (!inc || !linkMajorSelect) return;
    setLinkMajorErr('');
    setLinkMajorBusy(true);
    try {
      await incidentsApi.linkMajorIncident(inc.id, { major_incident_id: linkMajorSelect });
      setLinkMajorSelect('');
      await refresh();
    } catch (err: unknown) {
      setLinkMajorErr(err instanceof Error ? err.message : 'Failed to link major incident');
    } finally {
      setLinkMajorBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!previewArticle?.content) { setPreviewAttachmentUrls({}); return; }
    const imageMatches = Array.from(previewArticle.content.matchAll(/!\[[^\]]*]\(attachment:([^)]+)\)/g));
    const linkMatches = Array.from(previewArticle.content.matchAll(/\[[^\]]+]\(attachment:([^)]+)\)/g));
    const ids = Array.from(new Set(
      [...imageMatches, ...linkMatches]
        .map((m) => m[1])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ));
    if (ids.length === 0) { setPreviewAttachmentUrls({}); return; }
    Promise.all(ids.map(async (id) => ({ id, url: await attachmentsApi.previewUrl(id) })))
      .then((pairs) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of pairs) map[p.id] = p.url;
        setPreviewAttachmentUrls(map);
      })
      .catch(() => { if (!cancelled) setPreviewAttachmentUrls({}); });
    return () => { cancelled = true; };
  }, [previewArticle?.content]);

  if (loading) return <Spinner />;
  if (!inc) {
    return (
      <>
        <PageHeader title="Incident" description="This record could not be opened." />
        <Card>
          <p className="text-sm text-gray-700 mb-4">
            {loadError || 'This incident was not found, or you do not have permission to view it.'}
          </p>
          <Button type="button" variant="outline" onClick={() => navigate('/incidents')}>
            Back to incidents
          </Button>
        </Card>
      </>
    );
  }

  const inputCls = `w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none${readonly ? ' bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`;
  const selectCls = inputCls;
  const linkMajorSelectCls =
    'min-w-0 flex-1 text-sm py-1.5 px-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none sm:max-w-xs md:max-w-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';

  const linkedMajor = inc.linked_major_incidents ?? [];
  const linkedMajorIds = new Set(linkedMajor.map((m) => m.id));
  const linkChoices = linkableMajors.filter((m) => !linkedMajorIds.has(m.id));
  const promEligible = inc.priority <= 2 || (inc.impact === 'high' && inc.urgency === 'high');
  const showPromoteButton = canCreateMajorIncidentRecord(user?.roles)
    && !isClosed
    && !isResolved
    && linkedMajor.length === 0
    && promEligible;

  return (
    <>
      <PageHeader
        title={`${inc.number} — ${inc.title}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {showPromoteButton && (
              <Button
                type="button"
                className="bg-orange-600 hover:bg-orange-500 text-white border-0"
                onClick={handleDeclareMajor}
                disabled={declareMajorBusy}
              >
                {declareMajorBusy ? 'Promoting…' : 'Promote to major incident'}
              </Button>
            )}
            {isResolved && (isFulfiller || isCaller) && (
              <Button onClick={handleReopen} disabled={saving} variant="warning">
                Reopen Incident
              </Button>
            )}
            {!isClosed && isCaller && !isResolved && (
              <Button onClick={handleCancel} disabled={saving} variant="outline">
                Cancel Incident
              </Button>
            )}
            {!readonly && (
              <Button onClick={handleUpdate} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {!readonly && !isClosed && !isResolved && (
              <Button
                variant="outline"
                onClick={() => setField('status', fields.status === 'pending' ? inc.status : 'pending')}
              >
                {fields.status === 'pending' ? 'Undo Pending' : 'Set Pending'}
              </Button>
            )}
            {!readonly && !isClosed && !isResolved && (
              <Button variant="outline" onClick={() => setField('status', 'resolved')}>
                Resolve
              </Button>
            )}
            {!readonly && !isClosed && !isResolved && (
              <Button variant="outline" onClick={() => setKbResolveOpen(true)}>
                Resolve with KB
              </Button>
            )}
            <Button onClick={() => prevId && goTo(prevId)} disabled={!prevId} title="Previous incident (Left Arrow)" variant="outline" size="icon">&#8592;</Button>
            <Button onClick={() => nextId && goTo(nextId)} disabled={!nextId} title="Next incident (Right Arrow)" variant="outline" size="icon">&#8594;</Button>
            <Button variant="outline" onClick={() => setIntelligenceOpen((prev) => !prev)} title={intelligenceOpen ? 'Hide intelligent sidebar' : 'Show intelligent sidebar'}>
              {intelligenceOpen ? 'Hide Insights' : 'Show Insights'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/incidents')}>Back to list</Button>
          </div>
        }
      />

      {declareMajorErr && (
        <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 font-medium">
          {declareMajorErr}
        </div>
      )}

      {(linkedMajor.length > 0 || (isFulfiller && !readonly && !isClosed && !isResolved)) && (
        <Card
          padding={false}
          className="mb-3 border-l-[3px] border-l-indigo-500 border-y border-r border-gray-200 rounded-lg bg-indigo-50/25 px-3 py-2 dark:border-gray-600 dark:border-l-indigo-400 dark:bg-indigo-950/55"
        >
          {linkedMajor.length === 0 &&
          isFulfiller &&
          !readonly &&
          !isClosed &&
          !isResolved &&
          linkChoices.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/90 dark:text-indigo-100 shrink-0">
                Major incident
              </span>
              <label htmlFor="link-major-select" className="sr-only">
                Link to major incident
              </label>
              <select
                id="link-major-select"
                className={linkMajorSelectCls}
                value={linkMajorSelect}
                onChange={(e) => setLinkMajorSelect(e.target.value)}
              >
                <option value="">Select major incident…</option>
                {linkChoices.map((m) => (
                  <option key={m.id} value={m.id}>{m.number} — {m.title} ({m.status})</option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleLinkMajor()} disabled={!linkMajorSelect || linkMajorBusy}>
                {linkMajorBusy ? 'Linking…' : 'Link'}
              </Button>
              {linkMajorErr && <p className="text-xs text-red-600 dark:text-red-400 basis-full">{linkMajorErr}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 min-h-[1.25rem]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-900/90 dark:text-indigo-100 shrink-0">
                  Major incident
                </span>
                {linkedMajor.length === 0 ? (
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate">None linked.</span>
                ) : null}
              </div>
              {linkedMajor.length > 0 ? (
                <ul className="text-sm space-y-0.5">
                  {linkedMajor.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-snug">
                      <Link to={`/major-incidents/${m.id}`} className="text-indigo-700 dark:text-indigo-300 font-medium hover:underline truncate min-w-0">
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400 mr-1.5 tabular-nums">{m.number ?? '—'}</span>
                        {m.title}
                      </Link>
                      <Badge value={m.status} />
                      {m.link_kind === 'primary' && (
                        <span className="text-[10px] font-semibold uppercase text-amber-900 bg-amber-100/90 dark:text-amber-100 dark:bg-amber-900/55 px-1 py-0.5 rounded">Primary</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {isFulfiller && !readonly && !isClosed && !isResolved && linkChoices.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-indigo-100/60 dark:border-indigo-700/50">
                  <label htmlFor="link-major-select-linked" className="sr-only">
                    Link to major incident
                  </label>
                  <select
                    id="link-major-select-linked"
                    className={linkMajorSelectCls}
                    value={linkMajorSelect}
                    onChange={(e) => setLinkMajorSelect(e.target.value)}
                  >
                    <option value="">Select major incident…</option>
                    {linkChoices.map((m) => (
                      <option key={m.id} value={m.id}>{m.number ?? '—'} — {m.title} ({m.status})</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" size="sm" onClick={() => void handleLinkMajor()} disabled={!linkMajorSelect || linkMajorBusy}>
                    {linkMajorBusy ? 'Linking…' : 'Link'}
                  </Button>
                </div>
              )}
              {linkMajorErr && <p className="text-xs text-red-600 dark:text-red-400">{linkMajorErr}</p>}
            </div>
          )}
        </Card>
      )}

      {formError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {formError}
        </div>
      )}

      <div className={intelligenceOpen ? 'xl:flex xl:items-start xl:gap-6' : ''}>
        <div className="min-w-0 flex-1">

          {/* ── Summary ── */}
          <Card className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.assignment_group ? 'text-red-600' : 'text-gray-500'}`}>
                  Assignment Group <span className="text-red-500">*</span>
                </label>
                {readonly ? (
                  <p className="text-sm text-gray-900 mt-0.5">{inc.assignment_group_name || '—'}</p>
                ) : (
                  <select
                    value={fields.assignmentGroupId}
                    onChange={(e) => { setField('assignmentGroupId', e.target.value); setField('assignedTo', ''); }}
                    className={selectCls}
                  >
                    <option value="">— None —</option>
                    {assignmentGroups.filter((ag) => ag.is_active).map((ag) => (
                      <option key={ag.id} value={ag.id}>{ag.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
                {readonly ? (
                  <p className="text-sm text-gray-900 mt-0.5">{inc.assigned_to_name || 'Unassigned'}</p>
                ) : (
                  <select value={fields.assignedTo} onChange={(e) => setField('assignedTo', e.target.value)} className={selectCls}>
                    <option value="">— Unassigned —</option>
                    {groupMembers.map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.impact ? 'text-red-600' : 'text-gray-500'}`}>
                  Impact <span className="text-red-500">*</span>
                </label>
                {readonly ? (
                  <Badge value={inc.impact} />
                ) : (
                  <select value={fields.impact} onChange={(e) => setField('impact', e.target.value)} className={selectCls}>
                    {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.urgency ? 'text-red-600' : 'text-gray-500'}`}>
                  Urgency <span className="text-red-500">*</span>
                </label>
                {readonly ? (
                  <Badge value={inc.urgency} />
                ) : (
                  <select value={fields.urgency} onChange={(e) => setField('urgency', e.target.value)} className={selectCls}>
                    {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Open Time</label>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-gray-900 mt-0.5">{formatDateTime(inc.created_at)}</p>
                  <Badge value={inc.status} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">SLA Due Date</label>
                <p className="text-sm text-gray-900 mt-0.5">{inc.sla_due_at ? formatDateTime(inc.sla_due_at) : '—'}</p>
              </div>
              {(fields.status === 'pending' || inc.status === 'pending') && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Pending Reason <span className="text-red-500">*</span>
                  </label>
                  {readonly ? (
                    <p className="text-sm text-gray-900 mt-0.5">{inc.resolution_code || '—'}</p>
                  ) : (
                    <select value={fields.pendingReason} onChange={(e) => setField('pendingReason', e.target.value)} className={selectCls}>
                      <option value="">Select reason...</option>
                      <option value="waiting_for_caller">Waiting for caller response</option>
                      <option value="waiting_for_vendor">Waiting for vendor</option>
                      <option value="waiting_for_change_window">Waiting for change window</option>
                      <option value="waiting_for_approval">Waiting for approval</option>
                      <option value="waiting_for_dependency">Waiting for dependency</option>
                    </select>
                  )}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">

            {/* ── Left pane ── */}
            <div className="space-y-6 lg:col-start-1">

              {/* Caller Profile */}
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">Caller Profile</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.caller ? 'text-red-600' : 'text-gray-500'}`}>
                      Caller <span className="text-red-500">*</span>
                    </label>
                    {readonly ? (
                      <p className="text-sm font-medium text-gray-900">{inc.caller_name || '—'}</p>
                    ) : (
                      <SearchableDropdown<UserListItem>
                        items={users}
                        selectedId={fields.callerId}
                        onSelect={(id) => setField('callerId', id)}
                        onClear={() => setField('callerId', '')}
                        getItemId={(u) => u.id}
                        getDisplayText={(u) => u.display_name}
                        filterFn={(u, q) => {
                          const s = q.toLowerCase();
                          return u.display_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
                        }}
                        fallbackDisplayText={inc.caller_name || ''}
                        placeholder="Search user..."
                        renderItem={(u) => (
                          <>
                            <span className="font-medium">{u.display_name}</span>
                            <span className="text-gray-400 ml-2">{u.email}</span>
                          </>
                        )}
                      />
                    )}
                  </div>
                  {callerInfo?.email && (
                    <div>
                      <dt className="text-xs text-gray-500">Email</dt>
                      <dd className="text-sm text-gray-900 mt-0.5">
                        <a href={`mailto:${callerInfo.email}`} className="text-indigo-600 hover:text-indigo-800">{callerInfo.email}</a>
                      </dd>
                    </div>
                  )}
                  {(callerInfo?.phone || callerInfo?.mobile) && (
                    <div>
                      <dt className="text-xs text-gray-500">Phone</dt>
                      <dd className="text-sm text-gray-900 mt-0.5">{callerInfo.phone || callerInfo.mobile}</dd>
                    </div>
                  )}
                  {callerInfo?.department && (
                    <div>
                      <dt className="text-xs text-gray-500">Department</dt>
                      <dd className="text-sm text-gray-900 mt-0.5">{callerInfo.department}</dd>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Info</label>
                    {readonly ? (
                      <p className="text-sm text-gray-900">{inc.contact_info || '—'}</p>
                    ) : (
                      <input type="text" value={fields.contactInfo} onChange={(e) => setField('contactInfo', e.target.value)} placeholder="Additional contact info..." className={inputCls} />
                    )}
                  </div>
                </div>
              </Card>

              {/* Service / CI Context */}
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">Service / CI Context</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className={`mb-1 ${requiredFieldMissing.service_or_ci ? 'text-red-600' : 'text-gray-500'}`}>
                      Service <span className="text-red-500">*</span>
                    </dt>
                    <dd className="text-gray-900 mt-0.5">
                      {readonly ? (
                        inc.service_name || '—'
                      ) : (
                        <SearchableDropdown<ServiceListItem>
                          items={services}
                          selectedId={fields.serviceId}
                          onSelect={(id) => setField('serviceId', id)}
                          onClear={() => setField('serviceId', '')}
                          getItemId={(s) => s.id}
                          getDisplayText={(s) => s.name}
                          fallbackDisplayText={inc.service_name || ''}
                          placeholder="Search service..."
                          renderItem={(s) => s.name}
                        />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className={`mb-1 ${requiredFieldMissing.service_or_ci ? 'text-red-600' : 'text-gray-500'}`}>
                      Configuration Item <span className="text-red-500">*</span>
                    </dt>
                    <dd className="mt-0.5">
                      {readonly ? (
                        (inc.ci_display_name || inc.ci_name) ? (
                          <a href={`/cmdb/${inc.configuration_item_id}`} className="text-indigo-600 font-medium hover:text-indigo-800">
                            {inc.ci_display_name || inc.ci_name}
                          </a>
                        ) : '—'
                      ) : (
                        <SearchableDropdown<CI>
                          items={ciOptions}
                          selectedId={fields.configurationItemId}
                          onSelect={(id) => setField('configurationItemId', id)}
                          onClear={() => setField('configurationItemId', '')}
                          getItemId={(ci) => ci.id}
                          getDisplayText={(ci) => ci.display_name || ci.name}
                          fallbackDisplayText={inc.ci_display_name || inc.ci_name || ''}
                          placeholder="Search CI..."
                          renderItem={(ci) => ci.display_name || ci.name}
                        />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Category</dt>
                    <dd className="text-gray-900 mt-0.5">
                      {readonly ? (
                        inc.category || '—'
                      ) : (
                        <input type="text" value={fields.category} onChange={(e) => setField('category', e.target.value)} placeholder="Category" className={inputCls} />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Subcategory</dt>
                    <dd className="text-gray-900 mt-0.5">
                      {readonly ? (
                        inc.subcategory || '—'
                      ) : (
                        <input type="text" value={fields.subcategory} onChange={(e) => setField('subcategory', e.target.value)} placeholder="Subcategory" className={inputCls} />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Related Problem</dt>
                    <dd className="mt-0.5">
                      {readonly ? (
                        selectedProblem ? (
                          <a href={`/problems/${selectedProblem.id}`} className="text-indigo-600 font-medium hover:text-indigo-800">
                            {selectedProblem.number} - {selectedProblem.title}
                          </a>
                        ) : '—'
                      ) : (
                        <SearchableDropdown<Problem>
                          items={problemOptions}
                          selectedId={fields.relatedProblemId}
                          onSelect={(id) => setField('relatedProblemId', id)}
                          onClear={() => setField('relatedProblemId', '')}
                          getItemId={(p) => p.id}
                          getDisplayText={(p) => `${p.number} - ${p.title}`}
                          placeholder="Search problem..."
                          renderItem={(p) => `${p.number} - ${p.title}`}
                        />
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>
            </div>

            {/* ── Center pane ── */}
            <div className="space-y-6 min-w-0 lg:col-start-2">

              {/* Incident Details */}
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">Incident Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    {readonly ? (
                      <p className="text-sm font-medium text-gray-900">{inc.title}</p>
                    ) : (
                      <input type="text" value={fields.title} onChange={(e) => setField('title', e.target.value)} className={inputCls} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    {readonly ? (
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{inc.description || '—'}</p>
                    ) : (
                      <textarea value={fields.description} onChange={(e) => setField('description', e.target.value)} rows={4} className={`${inputCls} resize-none`} placeholder="Describe the incident..." />
                    )}
                  </div>
                  {(fields.status === 'resolved' || inc.status === 'resolved' || inc.resolution_notes) && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Resolution Notes</label>
                      {readonly ? (
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{inc.resolution_notes || '—'}</p>
                      ) : (
                        <textarea value={fields.resolutionNotes} onChange={(e) => setField('resolutionNotes', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="How was the incident resolved?" />
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Attachments */}
              <AttachmentCard
                attachments={fileAttachments}
                uploading={uploading}
                dragOver={dragOver}
                fileInputRef={fileInputRef}
                previewUrl={previewUrl}
                previewName={previewName}
                onDragOver={() => setDragOver(true)}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClickZone={() => fileInputRef.current?.click()}
                onFileChange={(files) => handleFileUpload(files)}
                onPreview={handlePreview}
                onDownload={(a) => attachmentsApi.download(a.id, a.file_name)}
                onDelete={handleDeleteAttachment}
                onClosePreview={closePreview}
                formatSize={formatSize}
              />

              {/* Activity Journal */}
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">Activity Journal</h3>
                {(isFulfiller || inc.caller_id === user?.id) && !isClosed && (
                  <JournalForm
                    content={journalContent}
                    type={journalType}
                    visible={journalVisible}
                    isFulfiller={isFulfiller}
                    onSubmit={handleAddJournal}
                    onContentChange={setJournalContent}
                    onTypeChange={setJournalType}
                    onVisibleChange={setJournalVisible}
                  />
                )}
                <div className="space-y-3 divide-y divide-gray-50">
                  {(isFulfiller ? journal : journal.filter((e) => e.is_customer_visible)).map((entry) => (
                    <JournalEntryRow key={entry.id} entry={entry} isFulfiller={isFulfiller} />
                  ))}
                  {journal.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Resolve with KB Modal ── */}
        {kbResolveOpen && (
          <KbResolveModal
            kbSuggestions={kbSuggestions}
            saving={saving}
            onResolve={handleResolveWithKb}
            onClose={() => setKbResolveOpen(false)}
          />
        )}

        {/* ── Intelligence Sidebar ── */}
        {intelligenceOpen && (
          <div className="mt-6 xl:mt-0 xl:w-[320px] xl:shrink-0">
            <UiCard>
              <CardHeader>
                <CardTitle>Intelligent Sidebar</CardTitle>
                <p className="text-xs text-gray-500">Similar incidents and suggested knowledge articles.</p>
              </CardHeader>
              <CardContent className="space-y-5">
                {loadingSidebar && <div className="text-sm text-gray-500">Loading recommendations...</div>}
                {sidebarError && <div className="text-sm text-red-600">{sidebarError}</div>}
                <SimilarIncidentsSection incidents={similarIncidents} loading={loadingSidebar} onGoTo={goTo} />
                <KbSuggestionsSection articles={kbSuggestions} loading={loadingSidebar} onPreview={openKnowledgePreview} />
                {(previewLoading || previewError || previewArticle) && (
                  <section className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Knowledge Preview</h5>
                      <button
                        type="button"
                        onClick={() => { setPreviewArticle(null); setPreviewError(''); }}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        Close
                      </button>
                    </div>
                    {previewLoading && <p className="text-sm text-gray-500">Loading article...</p>}
                    {previewError && <p className="text-sm text-red-600">{previewError}</p>}
                    {previewArticle && !previewLoading && (
                      <div className="space-y-2">
                        <p className="text-xs font-mono text-indigo-600">{previewArticle.number}</p>
                        <p className="text-sm font-semibold text-gray-900">{previewArticle.title}</p>
                        <div className="text-xs text-gray-700 whitespace-pre-wrap max-h-44 overflow-y-auto space-y-2">
                          {previewArticle.content
                            ? previewArticle.content.split('\n').map((line, idx) => {
                              const img = line.match(/^!\[([^\]]*)\]\(attachment:([^)]+)\)\s*$/);
                              if (img) {
                                const alt = img[1] || 'attachment image';
                                const url = previewAttachmentUrls[img[2] || ''];
                                return url
                                  ? <img key={`img-${idx}`} src={url} alt={alt} className="max-w-full rounded border border-indigo-100" />
                                  : <p key={`img-missing-${idx}`} className="text-gray-400">[image not available: {alt}]</p>;
                              }
                              const link = line.match(/^\[([^\]]+)\]\(attachment:([^)]+)\)\s*$/);
                              if (link) {
                                const label = link[1] || 'attachment';
                                const url = previewAttachmentUrls[link[2] || ''];
                                return url
                                  ? (
                                    <a key={`link-${idx}`} href={url} target="_blank" rel="noreferrer" className="text-indigo-700 underline">
                                      {label}
                                    </a>
                                  )
                                  : <p key={`link-missing-${idx}`} className="text-gray-400">[attachment not available: {label}]</p>;
                              }
                              return <p key={`line-${idx}`}>{line}</p>;
                            })
                            : <p>No content</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/knowledge?articleId=${previewArticle.id}`)}
                          className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                        >
                          Open full article
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </CardContent>
            </UiCard>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function JournalForm({
  content, type, visible, isFulfiller, onSubmit, onContentChange, onTypeChange, onVisibleChange,
}: {
  content: string;
  type: string;
  visible: boolean;
  isFulfiller: boolean;
  onSubmit: (e: FormEvent) => void;
  onContentChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onVisibleChange: (v: boolean) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mb-4">
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder={isFulfiller ? 'Add a comment or work note...' : 'Add a comment...'}
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
      />
      <div className="flex items-center gap-3 mt-2">
        {isFulfiller ? (
          <>
            <select value={type} onChange={(e) => onTypeChange(e.target.value)} className="px-2 py-1 border border-gray-200 rounded text-xs">
              <option value="comment">Comment</option>
              <option value="work_note">Work Note</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={visible} onChange={(e) => onVisibleChange(e.target.checked)} className="rounded" />
              Customer visible
            </label>
          </>
        ) : (
          <span className="text-xs text-gray-400">Comment</span>
        )}
        <button type="submit" disabled={!content.trim()} className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-40">Post</button>
      </div>
    </form>
  );
}

function KbResolveModal({
  kbSuggestions,
  saving,
  onResolve,
  onClose,
}: {
  kbSuggestions: KnowledgeSuggestion[];
  saving: boolean;
  onResolve: (kbId: string, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<KnowledgeSuggestion[]>(kbSuggestions);
  const [searching, setSearching] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeSuggestion | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim()) {
      setResults(kbSuggestions);
      return;
    }
    setSearching(true);
    try {
      const res = await knowledgeApi.suggestionsByText({ title: q, limit: 8 });
      setResults(res.articles);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Resolve with KB Article</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search knowledge base..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          autoFocus
        />

        <div className="max-h-52 overflow-y-auto space-y-1 border border-gray-100 rounded-lg">
          {searching && <p className="text-sm text-gray-400 p-3">Searching...</p>}
          {!searching && results.length === 0 && <p className="text-sm text-gray-400 p-3">No articles found.</p>}
          {!searching && results.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedArticle(a)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                selectedArticle?.id === a.id
                  ? 'bg-indigo-50 border-l-2 border-indigo-500'
                  : 'hover:bg-gray-50 border-l-2 border-transparent'
              }`}
            >
              <span className="text-xs text-gray-400 mr-2">{a.number}</span>
              <span className="font-medium text-gray-900">{a.title}</span>
              {a.category_name && <span className="text-xs text-gray-400 ml-2">• {a.category_name}</span>}
            </button>
          ))}
        </div>

        {selectedArticle && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            Selected: <span className="font-medium">{selectedArticle.title}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Resolution Notes</label>
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={3}
            placeholder="Describe how this article resolved the incident..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => selectedArticle && onResolve(selectedArticle.id, resolutionNotes)}
            disabled={!selectedArticle || saving}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Resolving...' : 'Resolve Incident'}
          </button>
        </div>
      </div>
    </div>
  );
}

function JournalEntryRow({ entry, isFulfiller }: { entry: JournalEntry; isFulfiller: boolean }) {
  return (
    <div className="pt-3 first:pt-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900">{entry.author_name}</span>
        <Badge value={entry.entry_type} />
        {isFulfiller && !entry.is_customer_visible && (
          <span className="text-xs text-orange-500 font-medium">Internal</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{formatDateTime(entry.created_at)}</span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
    </div>
  );
}

