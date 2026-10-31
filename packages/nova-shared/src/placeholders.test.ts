/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { firstPlaceholder, replacePlaceholders, singlePlaceholder } from './placeholders';

describe('placeholders', () => {
  it('replaces padded keys and leaves non-placeholders alone', () => {
    const out = replacePlaceholders('{{  foo  }} {{}} {{bar}x}} {{{baz}}}', (inner) => inner.trim());
    expect(out).toBe('foo {{}} {{bar}x}} {baz}');
  });

  it('reads a single placeholder and ignores surrounding text', () => {
    expect(singlePlaceholder('  {{ request.number }}  ')).toBe(' request.number ');
    expect(singlePlaceholder('{{a}} {{b}}')).toBeNull();
    expect(singlePlaceholder('{{}}')).toBeNull();
    expect(firstPlaceholder('see {{ user.email }} please')).toBe('{{ user.email }}');
  });

  it('scans a long unclosed run in linear time', () => {
    const attack = '{{' + '{{|'.repeat(200_000);
    const started = Date.now();
    expect(replacePlaceholders(attack, () => 'x')).toBe(attack);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
