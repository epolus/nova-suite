/* SPDX-License-Identifier: AGPL-3.0-only */
import { useRef } from 'react';
import { formatDateTime } from '../utils/dateTime';

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function UserDateTimeInput({ value, onChange, className }: Props) {
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const display = value ? formatDateTime(value) : '';

  return (
    <div className="grid grid-cols-[1fr_36px] gap-2">
      <input
        type="text"
        value={display}
        readOnly
        onClick={() => {
          const input = nativePickerRef.current;
          if (!input) return;
          const anyInput = input as HTMLInputElement & { showPicker?: () => void };
          if (typeof anyInput.showPicker === 'function') anyInput.showPicker();
          else {
            input.focus();
            input.click();
          }
        }}
        placeholder="Select date and time"
        className={className}
      />
      <button
        type="button"
        onClick={() => {
          const input = nativePickerRef.current;
          if (!input) return;
          const anyInput = input as HTMLInputElement & { showPicker?: () => void };
          if (typeof anyInput.showPicker === 'function') anyInput.showPicker();
          else {
            input.focus();
            input.click();
          }
        }}
        className="h-full rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500"
        title="Open datetime picker"
        aria-label="Open datetime picker"
      >
        📅
      </button>
      <input
        ref={nativePickerRef}
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
