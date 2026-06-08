/* SPDX-License-Identifier: AGPL-3.0-only */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'strong', 'em', 'code', 'pre',
  'ul', 'ol', 'li', 'a', 'img', 'hr', 'br', 'span',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['style']),
  a: new Set(['href', 'target', 'rel', 'style']),
  img: new Set(['src', 'alt', 'style']),
};

const ALLOWED_STYLE_PROPS = new Set([
  'background',
  'border',
  'border-radius',
  'padding',
  'padding-left',
  'overflow-x',
  'font-size',
  'font-weight',
  'margin',
  'max-width',
  'text-decoration',
  'color',
  'list-style',
]);

function isSafeStyleValue(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 200) return false;
  const lower = v.toLowerCase();
  if (lower.includes('url(') || lower.includes('expression(') || lower.includes('@import')) return false;
  if (/[<>"]/g.test(v)) return false;
  return /^[#(),.%\w\s:+\-/]*$/.test(v);
}

function sanitizeInlineStyle(style: string): string {
  const declarations = style.split(';');
  const safe: string[] = [];
  for (const decl of declarations) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (!isSafeStyleValue(value)) continue;
    safe.push(`${prop}:${value}`);
  }
  return safe.join(';');
}

function sanitizeUrl(url: string, kind: 'href' | 'src'): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;

  if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('#')) {
    return raw;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();
    if (kind === 'href') {
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:') {
        return parsed.toString();
      }
    } else {
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'blob:') {
        return parsed.toString();
      }
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeKnowledgeHtml(html: string): string {
  if (!html) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      const text = document.createTextNode(el.textContent || '');
      el.replaceWith(text);
      return;
    }

    const globalAllowed = ALLOWED_ATTRS['*'] || new Set<string>();
    const perTagAllowed = ALLOWED_ATTRS[tag] || new Set<string>();
    const allowed = new Set([...globalAllowed, ...perTagAllowed]);

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (!allowed.has(name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'href' || name === 'src') {
        const safeUrl = sanitizeUrl(value, name);
        if (!safeUrl) {
          el.removeAttribute(attr.name);
        } else {
          el.setAttribute(attr.name, safeUrl);
        }
        continue;
      }
      if (name === 'style') {
        const safeStyle = sanitizeInlineStyle(value);
        if (!safeStyle) el.removeAttribute('style');
        else el.setAttribute('style', safeStyle);
      }
    }

    if (tag === 'a') {
      if (el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer nofollow');
      } else {
        el.removeAttribute('target');
        el.removeAttribute('rel');
      }
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }
  };

  for (const child of Array.from(tpl.content.childNodes)) {
    walk(child);
  }
  return tpl.innerHTML;
}

export function renderMarkdown(md: string, attachmentUrls: Record<string, string> = {}): string {
  let out = escapeHtml(md);
  out = out.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre style="background:#f4f4f5;border-radius:6px;padding:10px 14px;overflow-x:auto;font-size:0.8em;"><code>${code}</code></pre>`);
  out = out.replace(/`([^`]+)`/g, '<code style="background:#f4f4f5;border-radius:3px;padding:2px 5px;font-size:0.85em;">$1</code>');
  out = out.replace(/^### (.*)$/gm, '<h3 style="font-size:1em;font-weight:600;margin:12px 0 4px;">$1</h3>');
  out = out.replace(/^## (.*)$/gm, '<h2 style="font-size:1.1em;font-weight:700;margin:14px 0 4px;">$1</h2>');
  out = out.replace(/^# (.*)$/gm, '<h1 style="font-size:1.25em;font-weight:700;margin:16px 0 6px;">$1</h1>');
  out = out.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map((l) => l.replace(/^\d+\. /, '')).map((l) => `<li>${l}</li>`).join('');
    return `<ol style="list-style:decimal;padding-left:20px;margin:6px 0;">${items}</ol>`;
  });
  out = out.replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map((l) => l.replace(/^[-*] /, '')).map((l) => `<li>${l}</li>`).join('');
    return `<ul style="list-style:disc;padding-left:20px;margin:6px 0;">${items}</ul>`;
  });
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.*?)\*/g, '<em>$1</em>');
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const rawSrc = String(src || '');
    const finalSrc = rawSrc.startsWith('attachment:')
      ? (attachmentUrls[rawSrc.slice('attachment:'.length)] || '')
      : rawSrc;
    if (!finalSrc) return `<span style="color:#9ca3af;">[image not available: ${escapeHtml(String(alt || 'image'))}]</span>`;
    return `<img alt="${escapeHtml(String(alt || ''))}" src="${finalSrc}" style="max-width:100%;border-radius:8px;margin:8px 0;" />`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const rawHref = String(href || '');
    const finalHref = rawHref.startsWith('attachment:')
      ? (attachmentUrls[rawHref.slice('attachment:'.length)] || '')
      : rawHref;
    if (!finalHref) return `<span style="color:#9ca3af;">[link not available: ${escapeHtml(String(label || 'link'))}]</span>`;
    return `<a href="${escapeHtml(finalHref)}" target="_blank" rel="noreferrer" style="color:#4f46e5;text-decoration:underline;">${label}</a>`;
  });
  out = out.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;" />');
  out = out.replace(/\n/g, '<br />');
  return sanitizeKnowledgeHtml(out);
}
