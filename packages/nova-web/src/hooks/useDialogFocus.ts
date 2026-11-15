/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useRef } from 'react';
import { useLatestRef } from './useLatestRef';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

/**
 * Modal dialog focus handling: moves focus into the dialog when it opens, keeps Tab
 * cycling inside it, closes on Escape and returns focus to the opener afterwards.
 * Attach the returned ref to the element with role="dialog".
 */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, onEscape?: () => void) {
  const ref = useRef<T>(null);
  const onEscapeRef = useLatestRef(onEscape);

  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!dialog.contains(document.activeElement)) {
      const first = focusables(dialog)[0];
      if (first) {
        first.focus();
      } else {
        if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
        dialog.focus();
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables(dialog);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open, onEscapeRef]);

  return ref;
}
