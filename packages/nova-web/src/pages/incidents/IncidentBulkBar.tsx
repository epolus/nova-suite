/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { incidents as incidentsApi } from '@/api/client';
import { Button } from '@/components/ui/button';
import { useIncidentAssignmentGroups, useInvalidateIncidents } from '@/hooks/queries';

export default function IncidentBulkBar({ selectedIds, onClear }: { selectedIds: string[]; onClear: () => void }) {
  const tIncidents = useTranslations('pages.incidents');
  const tList = useTranslations('common.list');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const { data: groups = [] } = useIncidentAssignmentGroups();
  const invalidateIncidents = useInvalidateIncidents();
  const [groupId, setGroupId] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [loading, setLoading] = useState(false);

  if (selectedIds.length === 0) return null;

  const clear = () => {
    onClear();
    setGroupId('');
    setConfirmClose(false);
  };

  const run = async (action: 'assign_group' | 'close') => {
    setLoading(true);
    try {
      await incidentsApi.bulkUpdate(selectedIds, action, action === 'assign_group' ? groupId : undefined);
      clear();
      invalidateIncidents();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl mb-4 flex-wrap">
      <span className="text-sm font-semibold text-indigo-900">{tList('selected', { count: selectedIds.length })}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
        >
          <option value="">{tMaster('assignToGroup')}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <Button size="sm" variant="default" disabled={!groupId || loading} onClick={() => run('assign_group')}>
          {tIncidents('bulk.assignGroup')}
        </Button>
        {confirmClose ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-gray-600">{tIncidents('bulk.confirmClose', { count: selectedIds.length })}</span>
            <Button size="sm" variant="warning" disabled={loading} onClick={() => run('close')}>{tMaster('confirm')}</Button>
            <button onClick={() => setConfirmClose(false)} className="text-xs text-gray-500 hover:text-gray-700">{tActions('cancel')}</button>
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmClose(true)}>
            {tIncidents('bulk.closeIncidents')}
          </Button>
        )}
      </div>
      <button onClick={clear} className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-medium">
        {tMaster('clearSelection')}
      </button>
    </div>
  );
}
