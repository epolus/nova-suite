/* SPDX-License-Identifier: AGPL-3.0-only */
import { useRef } from 'react';
import { useTranslations } from 'use-intl';
import { formatDateTime } from '../utils/dateTime';
import { useFieldControl } from './ui/fieldControl';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export default function UserDateTimeInput({ value, onChange, className, id, name, ariaLabel }: Props) {
  const t = useTranslations('components.userDateTimeInput');
  const field = useFieldControl(name, id);
  const pickerId = `${field.id}-picker`;
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const display = value ? formatDateTime(value) : '';

  const openPicker = () => {
    const input = nativePickerRef.current;
    if (!input) return;
    const anyInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof anyInput.showPicker === 'function') anyInput.showPicker();
    else {
      input.focus();
      input.click();
    }
  };

  return (
    <div className="grid grid-cols-[1fr_36px] gap-2">
      <input
        id={field.id}
        name={field.name}
        type="text"
        value={display}
        readOnly
        onClick={openPicker}
        placeholder={t('placeholder')}
        aria-label={ariaLabel ?? t('placeholder')}
        className={className}
      />
      <button
        type="button"
        onClick={openPicker}
        className="h-full rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
        title={t('openPicker')}
        aria-label={t('openPicker')}
      >
        📅
      </button>
      <input
        ref={nativePickerRef}
        id={pickerId}
        name={`${field.name}-picker`}
        type="datetime-local"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || '')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}
