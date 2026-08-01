/* SPDX-License-Identifier: AGPL-3.0-only */
import { Link } from 'react-router-dom';

const ACCENT_ICON_BG: Record<string, string> = {
  indigo: 'bg-indigo-500/10 text-indigo-600',
  red: 'bg-red-500/10 text-red-600',
  violet: 'bg-violet-500/10 text-violet-600',
  blue: 'bg-blue-500/10 text-blue-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
};

const ACCENT_VALUE: Record<string, string> = {
  indigo: 'text-indigo-600 dark:text-indigo-400',
  red: 'text-red-600 dark:text-red-400',
  violet: 'text-violet-600 dark:text-violet-400',
  blue: 'text-blue-600 dark:text-blue-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
};

export function StatContent({
  label,
  value,
  accent = 'indigo',
  icon,
  link,
  hint,
  emphasize,
}: {
  label: string;
  value: number;
  accent?: string;
  icon: React.ReactNode;
  link: string;
  hint?: string;
  emphasize?: boolean;
}) {
  const valueClass = emphasize && value > 0
    ? ACCENT_VALUE.red
    : (ACCENT_VALUE[accent] ?? ACCENT_VALUE.indigo);

  return (
    <Link to={link} className="group flex h-full flex-col justify-between rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${valueClass}`}>{value.toLocaleString()}</p>
          {hint && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{hint}</p>}
        </div>
        <div className={`flex-shrink-0 rounded-xl p-2.5 ${ACCENT_ICON_BG[accent] ?? ACCENT_ICON_BG.indigo}`}>
          {icon}
        </div>
      </div>
    </Link>
  );
}
