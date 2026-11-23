/* SPDX-License-Identifier: AGPL-3.0-only */

export type ShortcutTarget = {
  tagName?: string;
  isContentEditable?: boolean;
} | null;

export type WorkbenchShortcut = 'palette' | 'queue-next' | 'queue-prev' | 'composer' | 'status' | 'open';

export function isEditableTarget(target: EventTarget | ShortcutTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const tagName = 'tagName' in target && typeof target.tagName === 'string'
    ? target.tagName.toUpperCase()
    : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return 'isContentEditable' in target && Boolean(target.isContentEditable);
}

export function shortcutFromKey(
  event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target?: EventTarget | ShortcutTarget | null;
  },
  opts?: { paletteOpen?: boolean },
): WorkbenchShortcut | null {
  const chord = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
  if (chord) {
    if (!opts?.paletteOpen && isEditableTarget(event.target ?? null)) return null;
    return 'palette';
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableTarget(event.target ?? null)) return null;
  if (event.key === 'j' || event.key === 'J') return 'queue-next';
  if (event.key === 'k' || event.key === 'K') return 'queue-prev';
  if (event.key === 'r' || event.key === 'R') return 'composer';
  if (event.key === 'e' || event.key === 'E') return 'status';
  if (event.key === 'Enter') return 'open';
  return null;
}
