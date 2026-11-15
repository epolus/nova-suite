/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { RotaShift } from '../../api/domains/rota';
import { formatDate, formatDateTime } from '../../utils/dateTime';

type Props = {
  selectedKey: string;
  shifts: RotaShift[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (shift: RotaShift) => void;
  onDelete: (id: string) => void;
};

export default function RotaDayPanel({
  selectedKey,
  shifts,
  canManage,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  const t = useTranslations('pages.onCallRota');

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {formatDate(new Date(`${selectedKey}T12:00:00`))}
        </p>
        {canManage && (
          <button type="button" onClick={onAdd} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            {t('addShift')}
          </button>
        )}
      </div>
      {shifts.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-gray-400">{t('noShifts')}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {shifts.map((s) => (
            <div key={s.id} className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900">{s.user_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.assignment_group_name}</p>
              <p className="text-xs text-gray-400 mt-1">
                {formatDateTime(s.starts_at)} → {formatDateTime(s.ends_at)}
              </p>
              {s.notes && <p className="text-xs text-gray-500 mt-1">{s.notes}</p>}
              {canManage && (
                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => onEdit(s)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                    {t('edit')}
                  </button>
                  <button type="button" onClick={() => onDelete(s.id)} className="text-xs font-medium text-red-600 hover:text-red-800">
                    {t('delete')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
