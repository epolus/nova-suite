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
  return text
    // Flow Designer data pills render as nested spans; keep the pill and drop its display label.
    .replace(/<span\b[^>]*\bclass="data_pill\b[^"]*"[^>]*>[^<]*<\/span>/gi, '')
    .replace(/<span\b[^>]*\bdata-pillvalue="([^"]*)"[^>]*>\s*<\/span>/gi, '$1')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function slugify(raw: string, max = 40): string {
  const s = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/g, '');
  return s || 'step';
}

/** Normalizes ServiceNow definition names ("Ask For Approval", "ask_for_approval") for matching. */
export function normalizeKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function snExternalKey(sysId: string): string {
  return `sn/${sysId.toLowerCase()}`;
}
