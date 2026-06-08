/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { changes } from '../../api/client';
import type { Change, ChangeBlackout } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { formatDate, formatDateTime } from '../../utils/dateTime';

// ─── Helpers ─────────────────────────────────────────────────

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoToLocal(iso: string) {
  return new Date(iso);
}

// Normalise to midnight local time
function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const RISK_COLOR: Record<string, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  very_high: 'bg-red-500',
};

const RISK_TEXT: Record<string, string> = {
  low: 'text-emerald-700',
  medium: 'text-yellow-700',
  high: 'text-orange-700',
  very_high: 'text-red-700',
};

const RISK_BG: Record<string, string> = {
  low: 'bg-emerald-50 border-emerald-200',
  medium: 'bg-yellow-50 border-yellow-200',
  high: 'bg-orange-50 border-orange-200',
  very_high: 'bg-red-50 border-red-200',
};

function dateKeyToLocalDay(key: string) {
  return dayStart(new Date(`${key}T00:00:00`));
}

// ─── Build calendar grid ──────────────────────────────────────

function buildGrid(year: number, month: number): Date[] {
  // month is 0-indexed
  const first = new Date(year, month, 1);
  // JS getDay(): 0=Sun..6=Sat — convert to Mon-first
  const startDow = (first.getDay() + 6) % 7; // 0=Mon
  const start = addDays(first, -startDow);
  const grid: Date[] = [];
  for (let i = 0; i < 42; i++) grid.push(addDays(start, i));
  return grid;
}

// ─── Page ────────────────────────────────────────────────────

export default function ChangeCalendarPage() {
  const navigate = useNavigate();
  const tChanges = useTranslations('pages.changes');
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Change[]>([]);
  const [blackouts, setBlackouts] = useState<ChangeBlackout[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(toDateKey(now));

  // Fetch wider range so navigating months doesn't require extra fetch
  useEffect(() => {
    setLoading(true);
    // Fetch ±2 months around current view
    const from = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const to = new Date(viewYear, viewMonth + 2, 0).toISOString();
    changes.calendar({ from, to }).then((res) => {
      setItems(res.changes);
      setBlackouts(res.blackouts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [viewYear, viewMonth]);

  // Map day key → changes (change appears on every day it spans)
  const changesByDay = useMemo(() => {
    const map = new Map<string, Change[]>();
    for (const c of items) {
      if (!c.scheduled_start) continue;
      const start = dayStart(isoToLocal(c.scheduled_start));
      const end = c.scheduled_end ? dayStart(isoToLocal(c.scheduled_end)) : start;
      let cursor = start;
      while (cursor <= end) {
        const key = toDateKey(cursor);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
        cursor = addDays(cursor, 1);
      }
    }
    return map;
  }, [items]);

  // Map day key → is blackout
  const blackoutDays = useMemo(() => {
    const set = new Set<string>();
    for (const b of blackouts) {
      const start = dayStart(isoToLocal(b.start_date));
      const end = dayStart(isoToLocal(b.end_date));
      let cursor = start;
      while (cursor <= end) {
        set.add(toDateKey(cursor));
        cursor = addDays(cursor, 1);
      }
    }
    return set;
  }, [blackouts]);

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const todayKey = toDateKey(now);
  const selectedChanges = selectedKey ? (changesByDay.get(selectedKey) ?? []) : [];
  const selectedBlackouts = selectedKey
    ? blackouts.filter((b) => {
        const s = dayStart(isoToLocal(b.start_date));
        const e = dayStart(isoToLocal(b.end_date));
        const d = dateKeyToLocalDay(selectedKey);
        return d >= s && d <= e;
      })
    : [];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };
  const goToday = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setSelectedKey(todayKey); };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={tChanges('calendar')}
        description={tChanges('calendarDescription')}
        action={
          <Link to="/changes" className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            {tChanges('backToChanges')}
          </Link>
        }
      />

      <div className="flex gap-5 items-start">

        {/* ── Calendar ── */}
        <div className="flex-1 min-w-0">

          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
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
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              {tChanges('today')}
            </button>
          </div>

          {/* Grid */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {DAY_KEYS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {tChanges(`days.${d}` as 'days.mon')}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="grid grid-cols-7">
              {grid.map((day, i) => {
                const key = toDateKey(day);
                const isCurrentMonth = day.getMonth() === viewMonth;
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                const isBlackout = blackoutDays.has(key);
                const dayChanges = changesByDay.get(key) ?? [];
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className={[
                      'min-h-[90px] p-1.5 border-b border-r border-gray-100 cursor-pointer transition-colors',
                      i % 7 === 6 ? 'border-r-0' : '',
                      i >= 35 ? 'border-b-0' : '',
                      isSelected ? 'bg-indigo-50/70' : isBlackout ? 'bg-red-50' : isWeekend ? 'bg-gray-50/50' : 'bg-white',
                      !isSelected && 'hover:bg-gray-50',
                    ].filter(Boolean).join(' ')}
                  >
                    {/* Date number */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={[
                          'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium',
                          isToday
                            ? 'text-white font-bold'
                            : isCurrentMonth
                              ? 'text-gray-800'
                              : 'text-gray-300',
                        ].join(' ')}
                        style={isToday ? { backgroundColor: 'var(--color-primary)' } : {}}
                      >
                        {day.getDate()}
                      </span>
                      {isBlackout && (
                        <span className="text-[9px] font-semibold text-red-500 uppercase tracking-wider leading-none">{tChanges('blackout')}</span>
                      )}
                    </div>

                    {/* Change chips */}
                    <div className="space-y-0.5">
                      {dayChanges.slice(0, 3).map((c) => (
                        <div
                          key={c.id}
                          onClick={(e) => { e.stopPropagation(); navigate(`/changes/${c.id}`); }}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium truncate border cursor-pointer hover:opacity-80 ${RISK_BG[c.risk_level] || 'bg-gray-50 border-gray-200'}`}
                          title={`${c.number} — ${c.title}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${RISK_COLOR[c.risk_level] || 'bg-gray-400'}`} />
                          <span className={`truncate ${RISK_TEXT[c.risk_level] || 'text-gray-700'}`}>{c.number}</span>
                        </div>
                      ))}
                      {dayChanges.length > 3 && (
                        <p className="text-[10px] text-gray-400 pl-1">{tChanges('moreChanges', { count: dayChanges.length - 3 })}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 px-1">
            {Object.entries(RISK_COLOR).map(([level, cls]) => (
              <div key={level} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${cls}`} />
                <span className="text-xs text-gray-500 capitalize">{tChanges(`riskLevels.${level === 'very_high' ? 'veryHigh' : level}` as 'riskLevels.low')}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-200" />
              <span className="text-xs text-gray-500">{tChanges('blackout')}</span>
            </div>
          </div>
        </div>

        {/* ── Side panel ── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          {/* Selected day details */}
          {selectedKey && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {formatDate(new Date(selectedKey + 'T12:00:00'))}
                </p>
              </div>

              {selectedBlackouts.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100 bg-red-50">
                  {selectedBlackouts.map((b) => (
                    <div key={b.id}>
                      <p className="text-xs font-semibold text-red-700">{b.name}</p>
                      {b.reason && <p className="text-xs text-red-500 mt-0.5">{b.reason}</p>}
                    </div>
                  ))}
                </div>
              )}

              {selectedChanges.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-400">{tChanges('noChangesScheduled')}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                  {selectedChanges.map((c) => (
                    <Link
                      key={c.id}
                      to={`/changes/${c.id}`}
                      className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RISK_COLOR[c.risk_level] || 'bg-gray-400'}`} />
                        <span className="text-xs font-mono text-gray-500">{c.number}</span>
                        <Badge value={c.status} className="ml-auto" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 leading-snug">{c.title}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {c.scheduled_start ? formatDateTime(c.scheduled_start) : tChanges('noStartTime')}
                        {c.scheduled_end ? ` → ${formatDateTime(c.scheduled_end)}` : ''}
                      </p>
                      {(c.conflict_count ?? 0) > 0 && (
                        <p className="text-xs text-red-600 mt-1 font-medium">{tChanges('conflictCount', { count: c.conflict_count ?? 0 })}</p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Blackout windows */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{tChanges('blackoutWindows')}</p>
            </div>
            {blackouts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-400">{tChanges('noBlackoutWindows')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {blackouts.map((b) => (
                  <div key={b.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-red-700">{b.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(b.start_date)} — {formatDate(b.end_date)}
                    </p>
                    {b.reason && <p className="text-xs text-gray-400 mt-0.5">{b.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
