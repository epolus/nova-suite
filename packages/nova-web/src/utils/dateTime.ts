/* SPDX-License-Identifier: AGPL-3.0-only */
export type TimeFormat = '12h' | '24h';
export type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

function getTimeFormat(): TimeFormat {
  if (typeof window === 'undefined') return '24h';
  const v = localStorage.getItem('nova_time_format');
  return v === '12h' ? '12h' : '24h';
}

function getDateFormat(): DateFormat {
  if (typeof window === 'undefined') return 'YYYY-MM-DD';
  const v = localStorage.getItem('nova_date_format');
  if (v === 'DD.MM.YYYY' || v === 'MM/DD/YYYY' || v === 'YYYY-MM-DD') return v;
  return 'YYYY-MM-DD';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = String(d.getFullYear());
  const fmt = getDateFormat();
  if (fmt === 'DD.MM.YYYY') return `${dd}.${mm}.${yyyy}`;
  if (fmt === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)} ${formatTime(d)}`;
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: getTimeFormat() === '12h',
  });
}

