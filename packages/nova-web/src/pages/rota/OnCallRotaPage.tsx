/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { auth, incidents, rota } from '../../api/client';
import type { AssignmentGroupItem, UserListItem } from '../../api/client';
import type { RotaBusinessCalendar, RotaShift } from '../../api/domains/rota';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import UserDateTimeInput from '../../components/UserDateTimeInput';
import { formatDate, formatDateTime, toDatetimeLocalValue } from '../../utils/dateTime';
import { canManageOnCallRota } from '../../utils/roles';
import { useAuth } from '../../context/AuthContext';
import { outsideWorkingHoursWindow } from './outsideWorkingHours';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const start = addDays(first, -startDow);
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) grid.push(addDays(start, i));
  return grid;
}

type ShiftForm = {
  id?: string;
  assignment_group_id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  notes: string;
  business_calendar_id: string;
};

const emptyForm = (): ShiftForm => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = addDays(start, 1);
  return {
    assignment_group_id: '',
    user_id: '',
    starts_at: toDatetimeLocalValue(start),
    ends_at: toDatetimeLocalValue(end),
    notes: '',
    business_calendar_id: '',
  };
};

export default function OnCallRotaPage() {
  const t = useTranslations('pages.onCallRota');
  const tChanges = useTranslations('pages.changes');
  const { user } = useAuth();
  const canManage = canManageOnCallRota(user?.roles);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<RotaShift[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [calendars, setCalendars] = useState<RotaBusinessCalendar[]>([]);
  const [groupFilter, setGroupFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(toDateKey(now));
  const [form, setForm] = useState<ShiftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewKey = `${viewYear}|${viewMonth}|${groupFilter}`;
  const [prevViewKey, setPrevViewKey] = useState(viewKey);
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      incidents.assignmentGroups().catch(() => ({ assignment_groups: [] as AssignmentGroupItem[] })),
      auth.users().catch(() => ({ users: [] as UserListItem[] })),
      rota.businessCalendars().catch(() => ({ business_calendars: [] as RotaBusinessCalendar[] })),
    ]).then(([g, u, c]) => {
      if (cancelled) return;
      setGroups(g.assignment_groups);
      setUsers(u.users);
      setCalendars(c.business_calendars);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const from = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const to = new Date(viewYear, viewMonth + 2, 0, 23, 59, 59).toISOString();
    rota.listShifts({
      from,
      to,
      assignment_group_id: groupFilter || undefined,
    }).then((res) => {
      if (cancelled) return;
      setShifts(res.shifts);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [viewYear, viewMonth, groupFilter]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, RotaShift[]>();
    for (const s of shifts) {
      const start = dayStart(new Date(s.starts_at));
      const end = dayStart(new Date(s.ends_at));
      // ends_at exclusive for covering; still show on the end calendar day if any overlap
      const last = new Date(s.ends_at).getTime() === dayStart(new Date(s.ends_at)).getTime()
        ? addDays(end, -1)
        : end;
      let cursor = start;
      while (cursor <= last) {
        const key = toDateKey(cursor);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [shifts]);

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayKey = toDateKey(now);
  const selectedShifts = selectedKey ? (shiftsByDay.get(selectedKey) ?? []) : [];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };
  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedKey(todayKey);
  };

  const defaultCalendarId = useMemo(
    () => calendars.find((c) => c.is_default)?.id || calendars[0]?.id || '',
    [calendars],
  );

  const openCreate = () => {
    const base = emptyForm();
    base.business_calendar_id = defaultCalendarId;
    if (selectedKey) {
      const day = new Date(`${selectedKey}T09:00:00`);
      const end = new Date(`${selectedKey}T17:00:00`);
      base.starts_at = toDatetimeLocalValue(day);
      base.ends_at = toDatetimeLocalValue(end);
      const cal = calendars.find((c) => c.id === base.business_calendar_id);
      if (cal) {
        const ooh = outsideWorkingHoursWindow(selectedKey, cal);
        if (ooh) {
          base.starts_at = ooh.starts_at;
          base.ends_at = ooh.ends_at;
        }
      }
    }
    if (groupFilter) base.assignment_group_id = groupFilter;
    setForm(base);
    setError(null);
  };

  const openEdit = (shift: RotaShift) => {
    setForm({
      id: shift.id,
      assignment_group_id: shift.assignment_group_id,
      user_id: shift.user_id,
      starts_at: toDatetimeLocalValue(shift.starts_at),
      ends_at: toDatetimeLocalValue(shift.ends_at),
      notes: shift.notes || '',
      business_calendar_id: defaultCalendarId,
    });
    setError(null);
  };

  const applyOutsideHours = () => {
    if (!form) return;
    const cal = calendars.find((c) => c.id === form.business_calendar_id);
    if (!cal) {
      setError(t('selectCalendar'));
      return;
    }
    const dayKey = selectedKey
      || (form.starts_at ? form.starts_at.slice(0, 10) : toDateKey(now));
    const ooh = outsideWorkingHoursWindow(dayKey, cal);
    if (!ooh) {
      setError(t('oohUnavailable'));
      return;
    }
    setForm({ ...form, starts_at: ooh.starts_at, ends_at: ooh.ends_at });
    setError(null);
  };

  const reload = async () => {
    const from = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const to = new Date(viewYear, viewMonth + 2, 0, 23, 59, 59).toISOString();
    const res = await rota.listShifts({
      from,
      to,
      assignment_group_id: groupFilter || undefined,
    });
    setShifts(res.shifts);
  };

  const saveForm = async () => {
    if (!form) return;
    if (!form.assignment_group_id || !form.user_id || !form.starts_at || !form.ends_at) {
      setError(t('formRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        assignment_group_id: form.assignment_group_id,
        user_id: form.user_id,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        notes: form.notes.trim() || null,
      };
      if (form.id) await rota.updateShift(form.id, payload);
      else await rota.createShift(payload);
      setForm(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const removeShift = async (id: string) => {
    if (!window.confirm(t('confirmDelete'))) return;
    try {
      await rota.deleteShift(id);
      if (form?.id === id) setForm(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    }
  };

  if (loading && shifts.length === 0) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {t('addShift')}
          </button>
        ) : undefined}
      />

      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-base font-semibold text-gray-900 w-44 text-center">
                {tChanges(`months.${viewMonth}` as 'months.0')} {viewYear}
              </h2>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
              >
                <option value="">{t('allGroups')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={goToday}
                className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
              >
                {tChanges('today')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAY_KEYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {tChanges(`days.${d}` as 'days.mon')}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((day, i) => {
                const key = toDateKey(day);
                const isCurrentMonth = day.getMonth() === viewMonth;
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                const dayShifts = shiftsByDay.get(key) ?? [];
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={[
                      'min-h-[90px] p-1.5 border-b border-r border-gray-100 cursor-pointer transition-colors',
                      i % 7 === 6 ? 'border-r-0' : '',
                      i >= 35 ? 'border-b-0' : '',
                      isSelected ? 'bg-indigo-50/70' : isWeekend ? 'bg-gray-50/50' : 'bg-white',
                      !isSelected && 'hover:bg-gray-50',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={[
                          'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium',
                          isToday ? 'text-white font-bold' : isCurrentMonth ? 'text-gray-800' : 'text-gray-300',
                        ].join(' ')}
                        style={isToday ? { backgroundColor: 'var(--color-primary)' } : {}}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {dayShifts.slice(0, 3).map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium truncate border bg-sky-50 border-sky-200 text-sky-800"
                          title={`${s.user_name} — ${s.assignment_group_name}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-sky-500" />
                          <span className="truncate">{s.user_name}</span>
                        </div>
                      ))}
                      {dayShifts.length > 3 && (
                        <p className="text-[10px] text-gray-400 pl-1">{t('moreShifts', { count: dayShifts.length - 3 })}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="w-80 shrink-0 space-y-4">
          {selectedKey && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {formatDate(new Date(`${selectedKey}T12:00:00`))}
                </p>
                {canManage && (
                  <button type="button" onClick={openCreate} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                    {t('addShift')}
                  </button>
                )}
              </div>
              {selectedShifts.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-400">{t('noShifts')}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {selectedShifts.map((s) => (
                    <div key={s.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{s.user_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.assignment_group_name}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateTime(s.starts_at)} → {formatDateTime(s.ends_at)}
                      </p>
                      {s.notes && <p className="text-xs text-gray-500 mt-1">{s.notes}</p>}
                      {canManage && (
                        <div className="flex gap-3 mt-2">
                          <button type="button" onClick={() => openEdit(s)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            {t('edit')}
                          </button>
                          <button type="button" onClick={() => removeShift(s.id)} className="text-xs font-medium text-red-600 hover:text-red-800">
                            {t('delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {form && canManage && (
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
                    onChange={(e) => setForm({ ...form, assignment_group_id: e.target.value })}
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
                    onSelect={(id) => setForm({ ...form, user_id: id })}
                    onClear={() => setForm({ ...form, user_id: '' })}
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
                    onChange={(e) => setForm({ ...form, business_calendar_id: e.target.value })}
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
                    onClick={applyOutsideHours}
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
                    onChange={(v) => setForm({ ...form, starts_at: v })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                    ariaLabel={t('startsAt')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('endsAt')}</label>
                  <UserDateTimeInput
                    value={form.ends_at}
                    onChange={(v) => setForm({ ...form, ends_at: v })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                    ariaLabel={t('endsAt')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('notes')}</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  />
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveForm}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                  >
                    {saving ? t('saving') : t('save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
