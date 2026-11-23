/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { isEditableTarget, shortcutFromKey } from './workbenchShortcuts';

const textarea = { tagName: 'TEXTAREA' };

describe('workbench shortcuts', () => {
  it('ignores queue and composer keys while an editable control is focused', () => {
    expect(isEditableTarget(textarea)).toBe(true);
    expect(shortcutFromKey({ key: 'j', target: textarea })).toBeNull();
    expect(shortcutFromKey({ key: 'k', target: textarea })).toBeNull();
    expect(shortcutFromKey({ key: 'r', target: textarea })).toBeNull();
    expect(shortcutFromKey({ key: 'e', target: textarea })).toBeNull();
    expect(shortcutFromKey({ key: 'k', ctrlKey: true, target: textarea })).toBeNull();
  });

  it('maps J/K/R/E/Enter and lets Ctrl+K close an open palette from an input', () => {
    expect(shortcutFromKey({ key: 'j' })).toBe('queue-next');
    expect(shortcutFromKey({ key: 'K' })).toBe('queue-prev');
    expect(shortcutFromKey({ key: 'r' })).toBe('composer');
    expect(shortcutFromKey({ key: 'E' })).toBe('status');
    expect(shortcutFromKey({ key: 'Enter' })).toBe('open');
    expect(shortcutFromKey({ key: 'k', metaKey: true })).toBe('palette');
    expect(shortcutFromKey(
      { key: 'k', ctrlKey: true, target: { tagName: 'INPUT' } },
      { paletteOpen: true },
    )).toBe('palette');
  });

  it('does not treat contenteditable surfaces as queue navigation', () => {
    expect(shortcutFromKey({ key: 'j', target: { isContentEditable: true } })).toBeNull();
  });
});
