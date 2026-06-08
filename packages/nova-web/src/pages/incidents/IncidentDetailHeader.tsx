/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { majorIncidents as majorIncidentsApi } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { canCreateMajorIncidentRecord } from '../../utils/roles';
import { useTranslations } from 'use-intl';
import type { IncidentDetailState } from './incidentDetailShared';

export function IncidentDetailHeader({ d }: { d: IncidentDetailState }) {
  const {
    inc, user, navigate,
    isResolved, isFulfiller, isCaller, isClosed, readonly, saving,
    fields, setField, handleUpdate, handleReopen, handleCancel, setKbResolveOpen,
    prevId, nextId, goTo, intelligenceOpen, setIntelligenceOpen,
  } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');

  const [declareMajorBusy, setDeclareMajorBusy] = useState(false);
  const [declareMajorErr, setDeclareMajorErr] = useState('');

  if (!inc) return null;

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
      setDeclareMajorErr(err instanceof Error ? err.message : tIncidents('promoteFailed'));
    } finally {
      setDeclareMajorBusy(false);
    }
  };

  const linkedMajor = inc.linked_major_incidents ?? [];
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
                {declareMajorBusy ? tIncidents('promoting') : tIncidents('promoteToMajor')}
              </Button>
            )}
            {isResolved && (isFulfiller || isCaller) && (
              <Button onClick={handleReopen} disabled={saving} variant="warning">
                {tIncidents('reopenIncident')}
              </Button>
            )}
            {!isClosed && isCaller && !isResolved && (
              <Button onClick={handleCancel} disabled={saving} variant="outline">
                {tIncidents('cancelIncident')}
              </Button>
            )}
            {!readonly && (
              <Button onClick={handleUpdate} disabled={saving}>
                {saving ? tActions('saving') : tMaster('saveChanges')}
              </Button>
            )}
            {!readonly && !isClosed && !isResolved && (
              <Button
                variant="outline"
                onClick={() => setField('status', fields.status === 'pending' ? inc.status : 'pending')}
              >
                {fields.status === 'pending' ? tIncidents('undoPending') : tIncidents('setPending')}
              </Button>
            )}
            {!readonly && !isClosed && !isResolved && (
              <Button variant="outline" onClick={() => setField('status', 'resolved')}>
                {tActions('resolve')}
              </Button>
            )}
            {!readonly && !isClosed && !isResolved && (
              <Button variant="outline" onClick={() => setKbResolveOpen(true)}>
                {tIncidents('resolveWithKb')}
              </Button>
            )}
            <Button onClick={() => prevId && goTo(prevId)} disabled={!prevId} title={tIncidents('previousIncident')} variant="outline" size="icon">&#8592;</Button>
            <Button onClick={() => nextId && goTo(nextId)} disabled={!nextId} title={tIncidents('nextIncident')} variant="outline" size="icon">&#8594;</Button>
            <Button variant="outline" onClick={() => setIntelligenceOpen((prev) => !prev)} title={intelligenceOpen ? tIncidents('hideIntelligentSidebar') : tIncidents('showIntelligentSidebar')}>
              {intelligenceOpen ? tIncidents('hideInsights') : tIncidents('showInsights')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/incidents')}>{tIncidents('backToList')}</Button>
          </div>
        }
      />

      {declareMajorErr && (
        <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800 font-medium">
          {declareMajorErr}
        </div>
      )}
    </>
  );
}
