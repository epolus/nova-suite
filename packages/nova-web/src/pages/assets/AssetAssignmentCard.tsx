/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { assets, auth } from '@/api/client';
import type { Asset } from '@/api/client';
import Card from '@/components/Card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/utils/dateTime';

type Props = {
  assetId: string;
  ownerUserId: string | null;
  ownerName?: string | null;
  onOwnerChange: (asset: Asset) => void;
};

export default function AssetAssignmentCard({
  assetId,
  ownerUserId,
  ownerName,
  onOwnerChange,
}: Props) {
  const t = useTranslations('pages.assets.assignments');
  const tActions = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const assignmentsKey = ['asset-assignments', assetId] as const;

  const [userId, setUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const assignmentsQuery = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => assets.assignments(assetId).then((r) => r.assignments),
  });
  const usersQuery = useQuery({
    queryKey: ['auth-users'],
    queryFn: () => auth.users().then((r) => r.users),
  });

  const assignments = useMemo(
    () => assignmentsQuery.data ?? [],
    [assignmentsQuery.data],
  );
  const users = usersQuery.data ?? [];
  const loading = assignmentsQuery.isLoading;
  const loadError = assignmentsQuery.error instanceof Error
    ? assignmentsQuery.error.message
    : assignmentsQuery.error
      ? t('loadFailed')
      : '';

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: assignmentsKey });
  };

  const handleAssign = async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await assets.assign(assetId, {
        user_id: userId,
        notes: notes.trim() || null,
      });
      onOwnerChange(res.asset);
      setUserId('');
      setNotes('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('assignFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleReturn = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await assets.returnAssignment(assetId, {
        notes: notes.trim() || null,
      });
      onOwnerChange(res.asset);
      setNotes('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('returnFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-1 font-semibold text-gray-900">{t('title')}</h3>
      <p className="mb-4 text-sm text-gray-600">
        {t('currentOwner')}:{' '}
        <span className="font-medium text-gray-900">{ownerName || t('unassigned')}</span>
      </p>

      {(error || loadError) && (
        <p className="mb-3 text-sm text-red-600">{error || loadError}</p>
      )}

      <div className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <label className="block text-xs font-medium text-gray-600">
          {t('assignee')}
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">{t('selectUser')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-600">
          {t('notes')}
          <textarea
            className="mt-1 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={!userId || busy} onClick={() => void handleAssign()}>
            {busy ? tActions('saving') : ownerUserId ? t('reassign') : t('assign')}
          </Button>
          {ownerUserId && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void handleReturn()}>
              {t('return')}
            </Button>
          )}
        </div>
      </div>

      <h4 className="mb-2 text-sm font-medium text-gray-800">{t('history')}</h4>
      <div className="space-y-3 divide-y divide-gray-50">
        {loading ? (
          <p className="py-3 text-center text-sm text-gray-500">{t('loading')}</p>
        ) : assignments.length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-400">{t('empty')}</p>
        ) : (
          assignments.map((row) => (
            <div key={row.id} className="pt-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">{row.user_name}</span>
                {row.returned_at ? (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{t('returned')}</span>
                ) : (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">{t('open')}</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {t('assignedBy', {
                  name: row.assigned_by_name || t('unknownUser'),
                  when: formatDateTime(row.assigned_at),
                })}
                {row.returned_at
                  ? ` · ${t('returnedAt', { when: formatDateTime(row.returned_at) })}`
                  : ''}
              </p>
              {row.notes && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{row.notes}</p>}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
