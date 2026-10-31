/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { htmlToText, normalizeKey, slugify, stripEdgeUnderscores } from './text';

describe('htmlToText', () => {
  it('keeps a data pill and drops its label', () => {
    expect(htmlToText('<p>Item <span data-pillvalue="{{request.number}}"><span class="data_pill">Number</span></span></p>'))
      .toBe('Item {{request.number}}');
  });

  it('does not leave a script tag after a nested or unclosed tag', () => {
    expect(htmlToText('Hi <scr<script>ipt>alert(1)</script>')).not.toContain('<script');
    expect(htmlToText('before <script alert(1)')).toBe('before');
    expect(htmlToText('<p>Hello <b>there</b></p>')).toBe('Hello there');
  });
});

describe('underscore trimming', () => {
  it('strips edge underscores without a backtracking regex', () => {
    expect(slugify('___Hello World___')).toBe('hello_world');
    expect(normalizeKey('Ask For Approval')).toBe('ask_for_approval');
    const started = Date.now();
    expect(stripEdgeUnderscores('_'.repeat(200_000))).toBe('');
    expect(Date.now() - started).toBeLessThan(500);
  });
});
