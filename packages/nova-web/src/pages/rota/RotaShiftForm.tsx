/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { AssignmentGroupItem, UserListItem } from '../../api/client';
import type { RotaBusinessCalendar } from '../../api/domains/rota';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import UserDateTimeInput from '../../components/UserDateTimeInput';
import type { ShiftForm } from './rotaCalendarUtils';

type Props = {
  form: ShiftForm;
  groups: AssignmentGroupItem[];
  users: UserListItem[];
  calendars: RotaBusinessCalendar[];
  saving: boolean;
  error: string | null;
  onChange: (next: ShiftForm) => void;
  onApplyOutsideHours: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export default function RotaShiftForm({
  form,
  groups,
  users,
  calendars,
  saving,
  error,
  onChange,
  onApplyOutsideHours,
  onSave,
  onCancel,
}: Props) {
  const t = useTranslations('pages.onCallRota');

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {form.id ? t('editShift') : t('addShift')}
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('group')}</label>
          <select
            value={form.assignment_group_id}
            onChange={(e) => onChange({ ...form, assignment_group_id: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value="">{t('selectGroup')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('user')}</label>
          <SearchableDropdown<UserListItem>
            items={users}
            selectedId={form.user_id}
            onSelect={(id) => onChange({ ...form, user_id: id })}
            onClear={() => onChange({ ...form, user_id: '' })}
            getItemId={(u) => u.id}
            getDisplayText={(u) => u.display_name}
            filterFn={(u, q) => {
              const s = q.toLowerCase();
              return u.display_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
            }}
            placeholder={t('searchUser')}
            renderItem={(u) => (
              <>
                <span className="font-medium">{u.display_name}</span>
                <span className="text-gray-400 ml-2">{u.email}</span>
              </>
            )}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('businessCalendar')}</label>
          <select
            value={form.business_calendar_id}
            onChange={(e) => onChange({ ...form, business_calendar_id: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
          >
            <option value="">{t('selectCalendar')}</option>
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.is_default ? ` (${t('defaultCalendar')})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onApplyOutsideHours}
            className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            {t('fillOutsideHours')}
          </button>
          <p className="mt-1 text-[11px] text-gray-400">{t('fillOutsideHoursHint')}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('startsAt')}</label>
          <UserDateTimeInput
            value={form.starts_at}
            onChange={(v) => onChange({ ...form, starts_at: v })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            ariaLabel={t('startsAt')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('endsAt')}</label>
          <UserDateTimeInput
            value={form.ends_at}
            onChange={(v) => onChange({ ...form, ends_at: v })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
            ariaLabel={t('endsAt')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('notes')}</label>
          <textarea
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? t('saving') : t('save')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
