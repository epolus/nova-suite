/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { workLogs as workLogsApi, type WorkLogEntityType } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { isAgentRole } from '@/utils/roles';
import Card from './Card';
import { Button } from './ui/button';

type Props = {
  entityType: WorkLogEntityType;
  entityId: string;
  readonly?: boolean;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function WorkLogsCard({ entityType, entityId, readonly = false }: Props) {
  const t = useTranslations('components.workLogs');
  const tActions = useTranslations('common.actions');
  const { user } = useAuth();
  const canEdit = !readonly && isAgentRole(user?.roles);
  const queryClient = useQueryClient();
  const queryKey = ['work-logs', entityType, entityId] as const;

  const [minutes, setMinutes] = useState('30');
  const [workedOn, setWorkedOn] = useState(() => todayIso());
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const query = useQuery({
    queryKey,
    queryFn: () => workLogsApi.list(entityType, entityId),
  });

  const rows = query.data?.work_logs ?? [];
  const totalMinutes = query.data?.total_minutes ?? 0;
  const loadError = query.error instanceof Error ? query.error.message : query.error ? t('loadFailed') : '';
  const error = actionError || loadError;

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const submit = async () => {
    const mins = Number.parseInt(minutes, 10);
    if (!Number.isFinite(mins) || mins < 1) return;
    setSaving(true);
    setActionError('');
    try {
      await workLogsApi.create({
        entity_type: entityType,
        entity_id: entityId,
        minutes: mins,
        worked_on: workedOn || todayIso(),
        note: note.trim() || null,
        is_customer_visible: visible,
      });
      setNote('');
      await refresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setActionError('');
    try {
      await workLogsApi.remove(id);
      await refresh();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : t('deleteFailed'));
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold text-gray-900">{t('title')}</h3>
        {rows.length > 0 && (
          <span className="text-xs text-gray-500">{t('total', { duration: formatDuration(totalMinutes) })}</span>
        )}
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">{t('minutes')}</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">{t('workedOn')}</span>
            <input
              type="date"
              value={workedOn}
              onChange={(e) => setWorkedOn(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-gray-700">{t('note')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white resize-none"
              placeholder={t('notePlaceholder')}
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            <span>{t('customerVisible')}</span>
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={() => void submit()} disabled={saving || !Number.parseInt(minutes, 10)}>
              {saving ? tActions('saving') : t('add')}
            </Button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <p className="text-sm text-gray-500 text-center py-4">{t('loading')}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const canDelete = canEdit && (user?.id === row.user_id || (user?.roles || []).includes('admin'));
            return (
              <div key={row.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{formatDuration(row.minutes)}</span>
                    <span className="text-xs text-gray-500">{row.worked_on}</span>
                    <span className="text-xs text-gray-500">· {row.user_name || row.user_id}</span>
                    {!row.is_customer_visible && (
                      <span className="text-xs text-orange-500 font-medium">{t('internal')}</span>
                    )}
                  </div>
                  {row.note && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{row.note}</p>}
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(row.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                  >
                    {tActions('delete')}
                  </Button>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{t('empty')}</p>}
        </div>
      )}
    </Card>
  );
}
