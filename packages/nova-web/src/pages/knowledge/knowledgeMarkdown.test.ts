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

  it('strips raw HTML and script tags from markdown input', () => {
    const html = renderMarkdown('<script>alert(1)</script>**ok**');
    const doc = parse(html);
    expect(doc.querySelector('script')).toBeNull();
    expect(html).not.toMatch(/<script/i);
    expect(doc.querySelector('strong')?.textContent).toBe('ok');
  });

  it('drops data: image sources', () => {
    const html = renderMarkdown('![x](data:text/html,<script>alert(1)</script>)');
    const doc = parse(html);
    expect(doc.querySelector('img')).toBeNull();
    expect(html).not.toMatch(/data:text\/html/i);
  });

  it('keeps renderer styles that are on the allowlist', () => {
    const html = renderMarkdown('[safe](https://example.com)');
    const link = parse(html).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('style') ?? '').toMatch(/text-decoration/);
    expect(link?.getAttribute('style') ?? '').not.toMatch(/expression|url\(/i);
  });

  it('escapes raw HTML so event handlers never become attributes', () => {
    const html = renderMarkdown('Click <img src=x onerror=alert(1)> here');
    const doc = parse(html);
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('[onerror]')).toBeNull();
    // Escaped text may still contain the word onerror; it must not be live markup.
    expect(html).toMatch(/&lt;img/);
  });

  it('allows relative paths and mailto links', () => {
    const rel = parse(renderMarkdown('[home](/ess)')).querySelector('a');
    expect(rel?.getAttribute('href')).toBe('/ess');
    const mail = parse(renderMarkdown('[mail](mailto:help@acme.local)')).querySelector('a');
    expect(mail?.getAttribute('href')).toMatch(/^mailto:help@acme\.local/i);
  });

  it('blocks vbscript and file protocol links', () => {
    for (const bad of ['vbscript:msgbox(1)', 'file:///etc/passwd']) {
      const link = parse(renderMarkdown(`[x](${bad})`)).querySelector('a');
      expect(link?.getAttribute('href') ?? '').not.toMatch(/^(vbscript|file):/i);
    }
  });
});
