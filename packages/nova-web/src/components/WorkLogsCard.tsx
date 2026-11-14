/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { workLogs as workLogsApi, type WorkLogEntityType } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { isAgentRole } from '@/utils/roles';
import { formatDate } from '@/utils/dateTime';
import Card from './Card';
import UserDateInput from './UserDateInput';
import { Button } from './ui/button';

type Props = {
  entityType: WorkLogEntityType;
  entityId: string;
  readonly?: boolean;
};

function todayIsoLocal(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const inputCls = 'mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white';

export default function WorkLogsCard({ entityType, entityId, readonly = false }: Props) {
  const t = useTranslations('components.workLogs');
  const tActions = useTranslations('common.actions');
  const { user } = useAuth();
  const canEdit = !readonly && isAgentRole(user?.roles);
  const queryClient = useQueryClient();
  const queryKey = ['work-logs', entityType, entityId] as const;

  const [modalOpen, setModalOpen] = useState(false);
  const [minutes, setMinutes] = useState('30');
  const [workedOn, setWorkedOn] = useState(() => todayIsoLocal());
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

  const openModal = () => {
    setMinutes('30');
    setWorkedOn(todayIsoLocal());
    setNote('');
    setVisible(false);
    setActionError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setActionError('');
  };

  const submit = async () => {
    const mins = Number.parseInt(minutes, 10);
    if (!Number.isFinite(mins) || mins < 1) return;
    if (!workedOn) return;
    setSaving(true);
    setActionError('');
    try {
      await workLogsApi.create({
        entity_type: entityType,
        entity_id: entityId,
        minutes: mins,
        worked_on: workedOn,
        note: note.trim() || null,
        is_customer_visible: visible,
      });
      setModalOpen(false);
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
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="font-semibold text-gray-900">{t('title')}</h3>
          {rows.length > 0 && (
            <span className="text-xs text-gray-500">{t('total', { duration: formatDuration(totalMinutes) })}</span>
          )}
        </div>
        {canEdit && (
          <Button type="button" size="sm" onClick={openModal}>
            {t('add')}
          </Button>
        )}
      </div>

      {error && !modalOpen && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
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
                    <span className="text-xs text-gray-500">{formatDate(row.worked_on)}</span>
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-log-dialog-title"
            className="w-full max-w-md rounded-lg bg-white border border-gray-200 shadow-xl p-6"
          >
            <h2 id="work-log-dialog-title" className="text-lg font-semibold text-gray-900">
              {t('addTitle')}
            </h2>
            {actionError && (
              <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="block text-sm">
                <span className="font-medium text-gray-700">{t('minutes')}</span>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className={inputCls}
                />
              </label>
              <div className="block text-sm">
                <span className="font-medium text-gray-700">{t('workedOn')}</span>
                <UserDateInput
                  value={workedOn}
                  onChange={setWorkedOn}
                  className={`${inputCls} pr-10`}
                  ariaLabel={t('workedOn')}
                />
              </div>
              <label className="block text-sm">
                <span className="font-medium text-gray-700">{t('note')}</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder={t('notePlaceholder')}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
                <span>{t('customerVisible')}</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                {tActions('cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={saving || !Number.parseInt(minutes, 10) || !workedOn}
              >
                {saving ? tActions('saving') : t('add')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
