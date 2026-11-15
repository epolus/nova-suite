/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { RotaShift } from '../../api/domains/rota';
import { DAY_KEYS, toDateKey } from './rotaCalendarUtils';

type Props = {
  grid: Date[];
  viewMonth: number;
  todayKey: string;
  selectedKey: string | null;
  shiftsByDay: Map<string, RotaShift[]>;
  onSelectDay: (key: string) => void;
};

export default function RotaMonthGrid({
  grid,
  viewMonth,
  todayKey,
  selectedKey,
  shiftsByDay,
  onSelectDay,
}: Props) {
  const t = useTranslations('pages.onCallRota');
  const tChanges = useTranslations('pages.changes');

  return (
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
              onClick={() => onSelectDay(key)}
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
  );
}
