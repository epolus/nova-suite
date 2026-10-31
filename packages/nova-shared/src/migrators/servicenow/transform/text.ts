/* SPDX-License-Identifier: AGPL-3.0-only */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function stripEdgeUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 95) start++;
  while (end > start && value.charCodeAt(end - 1) === 95) end--;
  return value.slice(start, end);
}

/** Drops `<...>` regions, including a `<` that never closes. One pass, no overlapping replace. */
function stripTags(value: string): string {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf('<', i);
    if (start < 0) return out + value.slice(i);
    out += value.slice(i, start);
    const end = value.indexOf('>', start + 1);
    if (end < 0) return out;
    i = end + 1;
  }
  return out;
}

function decodeEntities(html: string): string {
  return html
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

/** Catalog descriptions are HTML in ServiceNow; Nova stores plain text. */
export function htmlToText(html: string): string {
  if (!html) return '';
  // Decode first so double-encoded markup (&lt;p&gt;) becomes tags we can strip.
  let text = html;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeEntities(text);
    if (next === text) break;
    text = next;
  }
  text = text
    // Flow Designer data pills render as nested spans; keep the pill and drop its display label.
    .replace(/<span\b[^>]*\bclass="data_pill\b[^"]*"[^>]*>[^<]*<\/span>/gi, '')
    .replace(/<span\b[^>]*\bdata-pillvalue="([^"]*)"[^>]*>\s*<\/span>/gi, '$1')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ');
  return stripTags(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function slugify(raw: string, max = 40): string {
  const s = stripEdgeUnderscores(raw.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_'));
  return stripEdgeUnderscores(s.slice(0, max)) || 'step';
}

/** Normalizes ServiceNow definition names ("Ask For Approval", "ask_for_approval") for matching. */
export function normalizeKey(raw: string): string {
  return stripEdgeUnderscores(raw.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function snExternalKey(sysId: string): string {
  return `sn/${sysId.toLowerCase()}`;
}
