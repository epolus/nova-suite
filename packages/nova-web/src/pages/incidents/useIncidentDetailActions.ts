/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { incidents as incidentsApi, knowledge as knowledgeApi } from '../../api/client';
import type { Incident, JournalEntry } from '../../api/client';
import { buildIncidentUpdates, type EMPTY_FIELDS } from './incidentDetailFields';

type ActionParams = {
  id: string | undefined;
  inc: Incident | null;
  fields: typeof EMPTY_FIELDS;
  readonly: boolean;
  linkedProblemIds: string[];
  journalContent: string;
  journalType: string;
  journalVisible: boolean;
  setFormError: Dispatch<SetStateAction<string | null>>;
  setJournal: Dispatch<SetStateAction<JournalEntry[]>>;
  setJournalContent: Dispatch<SetStateAction<string>>;
  setKbResolveOpen: Dispatch<SetStateAction<boolean>>;
  refresh: () => Promise<void>;
  withSave: (fn: () => Promise<void>) => Promise<void>;
};

export function useIncidentDetailActions({
  id,
  inc,
  fields,
  readonly,
  linkedProblemIds,
  journalContent,
  journalType,
  journalVisible,
  setFormError,
  setJournal,
  setJournalContent,
  setKbResolveOpen,
  refresh,
  withSave,
}: ActionParams) {
  const handleUpdate = useCallback(async () => {
    if (!id || !inc) return;
    setFormError(null);
    if (!readonly) {
      const missing: string[] = [];
      if (!fields.assignmentGroupId) missing.push('Assignment Group');
      if (!fields.impact) missing.push('Impact');
      if (!fields.urgency) missing.push('Urgency');
      if (!fields.callerId) missing.push('Caller');
      if (!fields.serviceId && !fields.configurationItemId) missing.push('Service or Configuration Item');
      if (fields.status === 'pending' && !fields.pendingReason) missing.push('Pending Reason');
      if (fields.status === 'resolved' && !fields.resolutionNotes.trim()) missing.push('Resolution Notes');
      if (missing.length > 0) {
        setFormError(`Please fill required fields: ${missing.join(', ')}`);
        return;
      }
    }
    await withSave(async () => {
      const updates = buildIncidentUpdates(fields, inc);

      if (Object.keys(updates).length > 0) {
        await incidentsApi.update(id, updates as Partial<Incident>);
      }

      const currentPrimaryProblemId = linkedProblemIds[0] || '';
      const nextPrimaryProblemId = fields.relatedProblemId || '';
      if (currentPrimaryProblemId && currentPrimaryProblemId !== nextPrimaryProblemId) {
        await incidentsApi.unrelateProblem(id, currentPrimaryProblemId);
      }
      if (nextPrimaryProblemId && nextPrimaryProblemId !== currentPrimaryProblemId) {
        await incidentsApi.relateProblem(id, nextPrimaryProblemId, 'related_to');
      }

      if (Object.keys(updates).length > 0 || currentPrimaryProblemId !== nextPrimaryProblemId) {
        await refresh();
      }
    });
  }, [fields, id, inc, linkedProblemIds, readonly, refresh, setFormError, withSave]);

  const handleReopen = useCallback(
    () =>
      withSave(async () => {
        await incidentsApi.update(id!, { status: 'in_progress' } as Partial<Incident>);
        await refresh();
      }),
    [id, refresh, withSave],
  );

  const handleCancel = useCallback(
    () =>
      withSave(async () => {
        await incidentsApi.update(id!, { status: 'cancelled' } as Partial<Incident>);
        await refresh();
      }),
    [id, refresh, withSave],
  );

  const handleResolveWithKb = useCallback(
    async (kbId: string, resolutionNotes: string) => {
      if (!id || !inc) return;
      await withSave(async () => {
        await knowledgeApi.linkIncidentResolution(id, kbId);
        await incidentsApi.update(id, {
          status: 'resolved',
          resolution_notes: resolutionNotes || null,
        } as Partial<Incident>);
        await refresh();
      });
      setKbResolveOpen(false);
    },
    [id, inc, refresh, setKbResolveOpen, withSave],
  );

  const handleAddJournal = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!id || !journalContent.trim()) return;
      const entry = await incidentsApi.addJournal(id, {
        entry_type: journalType,
        content: journalContent,
        is_customer_visible: journalVisible,
      });
      setJournal((prev) => [entry, ...prev]);
      setJournalContent('');
    },
    [id, journalContent, journalType, journalVisible, setJournal, setJournalContent],
  );

  return {
    handleUpdate,
    handleReopen,
    handleCancel,
    handleResolveWithKb,
    handleAddJournal,
  };
}
