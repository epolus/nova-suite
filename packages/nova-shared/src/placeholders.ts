/* SPDX-License-Identifier: AGPL-3.0-only */

const OPEN = 123; // '{'
const CLOSE = 125; // '}'

type Hit = { start: number; end: number; inner: string };

/** Next `{{...}}` at or after `from`. A `}` inside the braces ends the candidate. */
function nextPlaceholder(template: string, from: number): Hit | null {
  const n = template.length;
  let i = from;
  while (i < n) {
    if (template.charCodeAt(i) !== OPEN || template.charCodeAt(i + 1) !== OPEN) {
      i++;
      continue;
    }
    const start = i;
    let j = i + 2;
    while (j < n && template.charCodeAt(j) !== CLOSE) j++;
    if (j >= n) return null;
    if (template.charCodeAt(j + 1) === CLOSE && j > start + 2) {
      return { start, end: j + 2, inner: template.slice(start + 2, j) };
    }
    i = j + 1;
  }
  return null;
}

/** Replaces each `{{...}}` placeholder. The key cannot contain `}`. */
export function replacePlaceholders(
  template: string,
  replacer: (inner: string, whole: string) => string,
): string {
  let out = '';
  let copyFrom = 0;
  let from = 0;
  for (;;) {
    const hit = nextPlaceholder(template, from);
    if (!hit) break;
    out += template.slice(copyFrom, hit.start);
    out += replacer(hit.inner, template.slice(hit.start, hit.end));
    copyFrom = hit.end;
    from = hit.end;
  }
  return out + template.slice(copyFrom);
}

/** Inner text when `value` is exactly one placeholder, ignoring surrounding whitespace. */
export function singlePlaceholder(value: string): string | null {
  const t = value.trim();
  const hit = nextPlaceholder(t, 0);
  if (!hit || hit.start !== 0 || hit.end !== t.length) return null;
  return hit.inner;
}

/** The first `{{...}}` in `template`, including the braces. */
export function firstPlaceholder(template: string): string | null {
  const hit = nextPlaceholder(template, 0);
  return hit ? template.slice(hit.start, hit.end) : null;
}
