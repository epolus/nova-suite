/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { auth, incidents, rota } from '../../api/client';
import type { AssignmentGroupItem, UserListItem } from '../../api/client';
import type { RotaBusinessCalendar, RotaShift } from '../../api/domains/rota';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { toDatetimeLocalValue } from '../../utils/dateTime';
import { canManageOnCallRota } from '../../utils/roles';
import { useAuth } from '../../context/AuthContext';
import { outsideWorkingHoursWindow } from './outsideWorkingHours';
import {
  buildGrid,
  emptyShiftForm,
  groupShiftsByDay,
  toDateKey,
  type ShiftForm,
} from './rotaCalendarUtils';
import RotaDayPanel from './RotaDayPanel';
import RotaMonthGrid from './RotaMonthGrid';
import RotaShiftForm from './RotaShiftForm';

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

  const shiftsByDay = useMemo(() => groupShiftsByDay(shifts), [shifts]);
  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayKey = toDateKey(now);
  const selectedShifts = selectedKey ? (shiftsByDay.get(selectedKey) ?? []) : [];
  const defaultCalendarId = useMemo(
    () => calendars.find((c) => c.is_default)?.id || calendars[0]?.id || '',
    [calendars],
  );

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

  const openCreate = () => {
    const base = emptyShiftForm();
    base.business_calendar_id = defaultCalendarId;
    if (selectedKey) {
      base.starts_at = toDatetimeLocalValue(new Date(`${selectedKey}T09:00:00`));
      base.ends_at = toDatetimeLocalValue(new Date(`${selectedKey}T17:00:00`));
      const cal = calendars.find((c) => c.id === base.business_calendar_id);
      const ooh = cal ? outsideWorkingHoursWindow(selectedKey, cal) : null;
      if (ooh) {
        base.starts_at = ooh.starts_at;
        base.ends_at = ooh.ends_at;
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
    const dayKey = selectedKey || (form.starts_at ? form.starts_at.slice(0, 10) : toDateKey(now));
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

          <RotaMonthGrid
            grid={grid}
            viewMonth={viewMonth}
            todayKey={todayKey}
            selectedKey={selectedKey}
            shiftsByDay={shiftsByDay}
            onSelectDay={setSelectedKey}
          />
        </div>

        <div className="w-80 shrink-0 space-y-4">
          {selectedKey && (
            <RotaDayPanel
              selectedKey={selectedKey}
              shifts={selectedShifts}
              canManage={canManage}
              onAdd={openCreate}
              onEdit={openEdit}
              onDelete={removeShift}
            />
          )}
          {form && canManage && (
            <RotaShiftForm
              form={form}
              groups={groups}
              users={users}
              calendars={calendars}
              saving={saving}
              error={error}
              onChange={setForm}
              onApplyOutsideHours={applyOutsideHours}
              onSave={saveForm}
              onCancel={() => setForm(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}
