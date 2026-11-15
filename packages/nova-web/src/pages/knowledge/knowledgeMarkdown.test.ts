/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './knowledgeMarkdown';

function parse(html: string) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

describe('renderMarkdown', () => {
  it('keeps query strings in links intact (escaped once, not twice)', () => {
    const link = parse(renderMarkdown('[docs](https://example.com/a?x=1&y=2)')).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/a?x=1&y=2');
  });

  it('cannot break out of the img src attribute', () => {
    const html = renderMarkdown('![x](https://example.com/a.png" onerror="alert(1))');
    const img = parse(html).querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
  });

  it('escapes substituted attachment URLs', () => {
    const html = renderMarkdown('![shot](attachment:a1)', { a1: 'blob:http://x/1" onerror="alert(1)' });
    const img = parse(html).querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
  });

  it('drops javascript: links', () => {
    const link = parse(renderMarkdown('[x](javascript:alert(1))')).querySelector('a');
    expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });
});
