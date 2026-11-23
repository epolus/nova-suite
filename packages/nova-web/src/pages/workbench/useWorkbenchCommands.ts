/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  checklists as checklistsApi,
  incidents as incidentsApi,
  rota,
  type Incident,
} from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/hooks/queries/keys';

export type StatusUpdate = {
  status: 'in_progress' | 'pending' | 'resolved';
  pendingReason?: string;
  resolutionCodeId?: string;
  resolutionNotes?: string;
};

export function useWorkbenchCommands(incident: Incident | undefined) {
  const t = useTranslations('pages.workbench');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const recordId = incident?.id ?? null;
  const [errorRecordId, setErrorRecordId] = useState(recordId);
  if (recordId !== errorRecordId) {
    setErrorRecordId(recordId);
    setError('');
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.workbench.all });
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (!incident || busy) return false;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    error,
    setError,
    busy,
    assignToMe: () => run(async () => {
      if (!user) return;
      await incidentsApi.update(incident!.id, { assigned_to: user.id });
    }),
    reopen: () => run(async () => {
      await incidentsApi.update(incident!.id, { status: 'in_progress' });
    }),
    escalate: () => run(async () => {
      const groupId = incident!.assignment_group_id;
      if (!groupId) throw new Error(t('noGroup'));
      const { on_call: onCall } = await rota.onCall(groupId);
      if (!onCall) throw new Error(t('noOnCall'));
      await incidentsApi.update(incident!.id, { assigned_to: onCall.user_id });
      await incidentsApi.addJournal(incident!.id, {
        entry_type: 'work_note',
        content: t('escalatedNote', { name: onCall.user_name }),
        is_customer_visible: false,
      });
    }),
    linkProblem: (problemId: string) => run(async () => {
      await incidentsApi.relateProblem(incident!.id, problemId);
    }),
    applyStatus: (input: StatusUpdate) => run(async () => {
      if (input.status === 'pending' && !input.pendingReason?.trim()) {
        throw new Error(t('pendingReasonRequired'));
      }
      if (input.status === 'resolved') {
        if (!input.resolutionNotes?.trim()) {
          throw new Error(t('resolutionNotesRequired'));
        }
        const { checklist_instances: instances } = await checklistsApi.listInstances('incident', incident!.id);
        const openRequired = instances.reduce((sum, instance) => sum + instance.open_required_count, 0);
        if (openRequired > 0) {
          throw new Error(t('checklistBlock', { count: openRequired }));
        }
      }
      await incidentsApi.update(incident!.id, {
        status: input.status,
        pending_reason: input.status === 'pending' ? input.pendingReason?.trim() : undefined,
        resolution_code_id: input.status === 'resolved' ? (input.resolutionCodeId || null) : undefined,
        resolution_notes: input.status === 'resolved' ? input.resolutionNotes?.trim() : undefined,
      });
    }),
    postJournal: (content: string, entryType: 'comment' | 'work_note') => run(async () => {
      const text = content.trim();
      if (!text) return;
      await incidentsApi.addJournal(incident!.id, {
        entry_type: entryType,
        content: text,
        is_customer_visible: entryType === 'comment',
      });
    }),
  };
}
