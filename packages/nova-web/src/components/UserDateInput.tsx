/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

type DateFormat = 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disallowPast?: boolean;
  showPickerButton?: boolean;
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

function toDisplay(iso: string, fmt: DateFormat): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, yyyy, mm, dd] = m;
  if (fmt === 'DD.MM.YYYY') return `${dd}.${mm}.${yyyy}`;
  if (fmt === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function isValidDate(yyyy: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const d = new Date(yyyy, mm - 1, dd);
  return d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd;
}

function toIso(input: string, fmt: DateFormat): string | null {
  const raw = input.trim();
  if (!raw) return '';

  let yyyy: number;
  let mm: number;
  let dd: number;

  if (fmt === 'DD.MM.YYYY') {
    const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    dd = Number(m[1]);
    mm = Number(m[2]);
    yyyy = Number(m[3]);
  } else if (fmt === 'MM/DD/YYYY') {
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    mm = Number(m[1]);
    dd = Number(m[2]);
    yyyy = Number(m[3]);
  } else {
    const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    yyyy = Number(m[1]);
    mm = Number(m[2]);
    dd = Number(m[3]);
  }

  if (!isValidDate(yyyy, mm, dd)) return null;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

function placeholderFor(fmt: DateFormat): string {
  if (fmt === 'DD.MM.YYYY') return 'dd.mm.yyyy';
  if (fmt === 'MM/DD/YYYY') return 'mm/dd/yyyy';
  return 'yyyy-mm-dd';
}

export default function UserDateInput({
  value,
  onChange,
  className,
  disallowPast = false,
  showPickerButton = true,
}: Props) {
  const tCommon = useTranslations('common');
  const fmt = useMemo(() => getDateFormat(), []);
  const [todayIso] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  });
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value ? toDisplay(value, fmt) : '');
  }, [value, fmt]);

  const commit = (disallowPast = false) => {
    const iso = toIso(text, fmt);
    if (iso === null) {
      setError('Invalid date format');
      return;
    }
    if (iso && disallowPast && iso < todayIso) {
      setError('Date cannot be in the past');
      return;
    }
    onChange(iso);
    setError('');
    setText(iso ? toDisplay(iso, fmt) : '');
  };

  const openPicker = () => {
    const input = pickerRef.current;
    if (!input) return;
    // `showPicker` is supported in Chromium-based browsers; fallback to focus/click.
    const anyInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyInput.showPicker === 'function') anyInput.showPicker();
    else {
      input.focus();
      input.click();
    }
  };

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(disallowPast)}
          placeholder={placeholderFor(fmt)}
          className={className}
        />
        {showPickerButton && (
          <button
            type="button"
            onClick={openPicker}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            title="Open date picker"
            aria-label="Open date picker"
          >
            📅
          </button>
        )}
        <input
          ref={pickerRef}
          type="date"
          value={value || ''}
          min={disallowPast ? todayIso : undefined}
          onChange={(e) => {
            const iso = e.target.value || '';
            onChange(iso);
            setText(iso ? toDisplay(iso, fmt) : '');
            setError('');
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {!error && disallowPast && <p className="text-xs text-gray-500 mt-1">{tCommon('date.futureOnly')}</p>}
    </div>
  );
}
