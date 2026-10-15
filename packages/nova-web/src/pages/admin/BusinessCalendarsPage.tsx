/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin as adminApi } from '../../api/client';
import type { BusinessCalendar, BusinessHourRow, HolidayRow } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPTY_HOURS: BusinessHourRow[] = [1, 2, 3, 4, 5].map((d) => ({
  day_of_week: d,
  start_time: '09:00',
  end_time: '17:00',
}));

type FormState = {
  name: string;
  timezone: string;
  is_default: boolean;
  hours: BusinessHourRow[];
  holidays: HolidayRow[];
};

const EMPTY_FORM: FormState = {
  name: '',
  timezone: 'UTC',
  is_default: false,
  hours: EMPTY_HOURS,
  holidays: [],
};

export default function BusinessCalendarsPage() {
  const t = useTranslations('pages.admin.businessCalendars');
  const tActions = useTranslations('common.actions');

  const [calendars, setCalendars] = useState<BusinessCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    adminApi.businessCalendars().then((res) => {
      setCalendars(res.business_calendars);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, hours: [...EMPTY_HOURS] });
    setCreating(true);
  };

  const startEdit = async (cal: BusinessCalendar) => {
    setCreating(false);
    setEditing(cal.id);
    const detail = await adminApi.businessCalendar(cal.id);
    setForm({
      name: detail.name,
      timezone: detail.timezone || 'UTC',
      is_default: detail.is_default,
      hours: (detail.hours || []).map((h) => ({
        day_of_week: h.day_of_week,
        start_time: String(h.start_time).slice(0, 5),
        end_time: String(h.end_time).slice(0, 5),
      })),
      holidays: (detail.holidays || []).map((h) => ({
        holiday_date: String(h.holiday_date).slice(0, 10),
        name: h.name,
      })),
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        timezone: form.timezone,
        is_default: form.is_default,
        hours: form.hours,
        holidays: form.holidays,
      };
      if (creating) {
        await adminApi.createBusinessCalendar(payload);
      } else if (editing) {
        await adminApi.updateBusinessCalendar(editing, payload);
      }
      setEditing(null);
      setCreating(false);
      setLoading(true);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cal: BusinessCalendar) => {
    if (!confirm(t('confirmDelete', { name: cal.name }))) return;
    await adminApi.deleteBusinessCalendar(cal.id);
    setLoading(true);
    load();
  };

  const updateHour = (idx: number, patch: Partial<BusinessHourRow>) => {
    setForm((f) => ({
      ...f,
      hours: f.hours.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    }));
  };

  const addHour = () => {
    setForm((f) => ({
      ...f,
      hours: [...f.hours, { day_of_week: 1, start_time: '09:00', end_time: '17:00' }],
    }));
  };

  const removeHour = (idx: number) => {
    setForm((f) => ({ ...f, hours: f.hours.filter((_, i) => i !== idx) }));
  };

  const addHoliday = () => {
    setForm((f) => ({
      ...f,
      holidays: [...f.holidays, { holiday_date: '', name: '' }],
    }));
  };

  const updateHoliday = (idx: number, patch: Partial<HolidayRow>) => {
    setForm((f) => ({
      ...f,
      holidays: f.holidays.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    }));
  };

  const removeHoliday = (idx: number) => {
    setForm((f) => ({ ...f, holidays: f.holidays.filter((_, i) => i !== idx) }));
  };

  if (loading) return <Spinner />;

  const isFormOpen = creating || editing !== null;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          !isFormOpen ? (
            <button
              onClick={startCreate}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              {t('newCalendar')}
            </button>
          ) : undefined
        }
      />

      {isFormOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {creating ? t('newTitle') : t('editTitle')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block text-sm">
              <span className="text-gray-600">{t('name')}</span>
              <input
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600">{t('timezone')}</span>
              <input
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                placeholder="UTC"
              />
            </label>
            <label className="flex items-center gap-2 mt-6 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              />
              {t('isDefault')}
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-800">{t('businessHours')}</h3>
              <button type="button" onClick={addHour} className="text-xs text-indigo-600 hover:underline">
                {t('addHour')}
              </button>
            </div>
            <div className="space-y-2">
              {form.hours.map((h, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    value={h.day_of_week}
                    onChange={(e) => updateHour(idx, { day_of_week: Number(e.target.value) })}
                  >
                    {DAY_LABELS.map((label, d) => (
                      <option key={d} value={d}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="time"
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    value={h.start_time}
                    onChange={(e) => updateHour(idx, { start_time: e.target.value })}
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    value={h.end_time}
                    onChange={(e) => updateHour(idx, { end_time: e.target.value })}
                  />
                  <button type="button" onClick={() => removeHour(idx)} className="text-xs text-red-600">
                    {tActions('remove')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-800">{t('holidays')}</h3>
              <button type="button" onClick={addHoliday} className="text-xs text-indigo-600 hover:underline">
                {t('addHoliday')}
              </button>
            </div>
            <div className="space-y-2">
              {form.holidays.map((h, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    value={h.holiday_date}
                    onChange={(e) => updateHoliday(idx, { holiday_date: e.target.value })}
                  />
                  <input
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[8rem]"
                    placeholder={t('holidayName')}
                    value={h.name}
                    onChange={(e) => updateHoliday(idx, { name: e.target.value })}
                  />
                  <button type="button" onClick={() => removeHoliday(idx)} className="text-xs text-red-600">
                    {tActions('remove')}
                  </button>
                </div>
              ))}
              {form.holidays.length === 0 && (
                <p className="text-xs text-gray-400">{t('noHolidays')}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? tActions('saving') : tActions('save')}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              {tActions('cancel')}
            </button>
          </div>
        </div>
      )}

      {!isFormOpen && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {calendars.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">{t('empty')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {calendars.map((cal) => (
                <li key={cal.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-gray-900">
                      {cal.name}
                      {cal.is_default && (
                        <span className="ml-2 text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                          {t('defaultBadge')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{cal.timezone}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(cal)}
                      className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                    >
                      {tActions('edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(cal)}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                    >
                      {tActions('delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
