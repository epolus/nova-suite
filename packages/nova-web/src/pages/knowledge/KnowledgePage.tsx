/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  attachments,
  knowledge,
  type AssignmentGroupItem,
  type KbArticleRatingSummary,
  type KnowledgeArticle,
  type KnowledgeArticleDetail,
  type KnowledgeCategory,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../utils/dateTime';
import { useAuth } from '../../context/AuthContext';
import { hasKnowledgeRole } from '../../utils/roles';

type StatusFilter = 'all' | 'draft' | 'review' | 'published' | 'retired';

const EMPTY_FORM = {
  title: '',
  content: '',
  category_id: '',
  assignment_group_id: '',
  status: 'draft' as KnowledgeArticle['status'],
};

const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'review', 'published', 'retired'];

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
  return /^[#(),.%\w\s:+\-\/]*$/.test(v);
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

function renderMarkdown(md: string, attachmentUrls: Record<string, string> = {}): string {
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

// ─── Ratings Widget ──────────────────────────────────────────
function RatingsWidget({ articleId }: { articleId: string }) {
  const [rating, setRating] = useState<KbArticleRatingSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    knowledge.ratings(articleId).then(setRating).catch(() => null);
  }, [articleId]);

  const vote = async (r: 1 | -1 | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = rating?.my_rating === r ? null : r;
      const updated = await knowledge.rate(articleId, next);
      setRating(updated);
    } finally {
      setBusy(false);
    }
  };

  if (!rating) return null;

  return (
    <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
      <span className="text-xs text-gray-500">Was this helpful?</span>
      <button
        onClick={() => vote(1)}
        disabled={busy}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          rating.my_rating === 1
            ? 'bg-green-100 border-green-300 text-green-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-green-50 hover:border-green-200'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17H8.204a1.75 1.75 0 01-1.047-.348L5.93 15.555A1.75 1.75 0 015.5 14.25v-5.5c0-.43.16-.84.448-1.154l4.37-4.68A1.5 1.5 0 0111 3z" />
        </svg>
        {rating.thumbs_up}
      </button>
      <button
        onClick={() => vote(-1)}
        disabled={busy}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          rating.my_rating === -1
            ? 'bg-red-100 border-red-300 text-red-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 rotate-180">
          <path d="M1 8.25a1.25 1.25 0 112.5 0v7.5a1.25 1.25 0 11-2.5 0v-7.5zM11 3V1.7c0-.268.14-.526.395-.607A2 2 0 0114 3c0 .995-.182 1.948-.514 2.826-.204.54.166 1.174.744 1.174h2.52c1.243 0 2.261 1.01 2.146 2.247a23.864 23.864 0 01-1.341 5.974C17.153 16.323 16.072 17 14.9 17H8.204a1.75 1.75 0 01-1.047-.348L5.93 15.555A1.75 1.75 0 015.5 14.25v-5.5c0-.43.16-.84.448-1.154l4.37-4.68A1.5 1.5 0 0111 3z" />
        </svg>
        {rating.thumbs_down}
      </button>
    </div>
  );
}

export default function KnowledgePage() {
  const { user } = useAuth();
  const canManageKnowledge = hasKnowledgeRole(user?.roles);
  const isReadOnlyView = !canManageKnowledge;
  const [searchParams, setSearchParams] = useSearchParams();

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [selected, setSelected] = useState<KnowledgeArticleDetail | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [aRes, cRes] = await Promise.all([
        knowledge.articles(),
        knowledge.categories(),
      ]);
      const gRes = canManageKnowledge ? await knowledge.assignmentGroups() : { assignment_groups: [] as AssignmentGroupItem[] };
      setArticles(aRes.articles);
      setCategories(cRes.categories.filter((c) => c.is_active));
      setGroups(gRes.assignment_groups.filter((g) => g.is_active));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load knowledge articles');
    } finally {
      setLoading(false);
    }
  }, [canManageKnowledge]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const effectiveStatus = isReadOnlyView ? 'published' : statusFilter;
    return articles.filter((a) => {
      if (isReadOnlyView && a.status !== 'published') return false;
      if (selectedCategoryId !== 'all') {
        if (selectedCategoryId === 'uncategorized' && a.category_id) return false;
        if (selectedCategoryId !== 'uncategorized' && a.category_id !== selectedCategoryId) return false;
      }
      if (!isReadOnlyView && effectiveStatus !== 'all' && a.status !== effectiveStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.number.toLowerCase().includes(q) || a.title.toLowerCase().includes(q);
      }
      return true;
    });
  }, [articles, selectedCategoryId, statusFilter, search, isReadOnlyView]);

  const categoryLabelById = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const cache = new Map<string, string>();
    const labelFor = (id: string): string => {
      if (cache.has(id)) return cache.get(id)!;
      const current = byId.get(id);
      if (!current) return id;
      const label = current.parent_id && byId.has(current.parent_id)
        ? `${labelFor(current.parent_id)} / ${current.name}`
        : current.name;
      cache.set(id, label);
      return label;
    };
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, labelFor(c.id)));
    return map;
  }, [categories]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorized = 0;
    const source = isReadOnlyView ? articles.filter((a) => a.status === 'published') : articles;
    for (const article of source) {
      if (!article.category_id) uncategorized += 1;
      else counts.set(article.category_id, (counts.get(article.category_id) || 0) + 1);
    }
    return { counts, uncategorized };
  }, [articles, isReadOnlyView]);

  const openNew = () => {
    if (isReadOnlyView) return;
    setSelectedId('new');
    setSelected(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const openArticle = async (id: string) => {
    setError('');
    setSelectedId(id);
    try {
      const detail = await knowledge.article(id);
      setSelected(detail);
      setForm({
        title: detail.title,
        content: detail.content,
        category_id: detail.category_id || '',
        assignment_group_id: detail.assignment_group_id || '',
        status: detail.status,
      });
    } catch (err: unknown) {
      setSelected(null);
      setError(err instanceof Error ? err.message : 'Failed to load article');
    }
  };

  useEffect(() => {
    const articleId = searchParams.get('articleId');
    if (!articleId || loading) return;
    if (selectedId === articleId) return;
    if (!articles.some((a) => a.id === articleId)) return;

    openArticle(articleId).finally(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('articleId');
        return next;
      }, { replace: true });
    });
  }, [searchParams, setSearchParams, loading, selectedId, articles]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (selectedId === 'new' || !selectedId) {
        const created = await knowledge.createArticle({
          title: form.title,
          content: form.content,
          category_id: form.category_id || null,
          assignment_group_id: form.assignment_group_id || null,
        });
        await load();
        await openArticle(created.id);
      } else {
        await knowledge.updateArticle(selectedId, {
          title: form.title,
          content: form.content,
          category_id: form.category_id || null,
          assignment_group_id: form.assignment_group_id || null,
          status: form.status,
        });
        await load();
        await openArticle(selectedId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save article');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!selected || !selectedId || selectedId === 'new') return;
    setSaving(true);
    setError('');
    try {
      await knowledge.submitForReview(selectedId);
      await load();
      await openArticle(selectedId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit for review');
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (approvalId: string, decision: 'approved' | 'rejected') => {
    if (!selectedId || selectedId === 'new') return;
    setSaving(true);
    setError('');
    try {
      await knowledge.decideApproval(selectedId, approvalId, decision);
      await openArticle(selectedId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to decide approval');
    } finally {
      setSaving(false);
    }
  };

  const isPublished = selected?.status === 'published';

  // Resolve attachment URLs referenced in content
  useEffect(() => {
    let cancelled = false;
    const imageMatches = Array.from(form.content.matchAll(/!\[[^\]]*]\(attachment:([^)]+)\)/g));
    const linkMatches = Array.from(form.content.matchAll(/\[[^\]]+]\(attachment:([^)]+)\)/g));
    const allMatches = [...imageMatches, ...linkMatches];
    const ids = Array.from(new Set(
      allMatches
        .map((m) => m[1])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ));
    if (ids.length === 0) { setAttachmentUrls({}); return; }
    Promise.all(ids.map(async (id) => ({ id, url: await attachments.previewUrl(id) })))
      .then((pairs) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of pairs) map[p.id] = p.url;
        setAttachmentUrls(map);
      })
      .catch(() => { if (!cancelled) setAttachmentUrls({}); });
    return () => { cancelled = true; };
  }, [form.content]);

  const insertAtLineStart = (prefix: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const lineStart = form.content.lastIndexOf('\n', start - 1) + 1;
    const next = `${form.content.slice(0, lineStart)}${prefix}${form.content.slice(lineStart)}`;
    setForm((p) => ({ ...p, content: next }));
    setTimeout(() => { el.focus(); const pos = start + prefix.length; el.setSelectionRange(pos, pos); }, 0);
  };

  const insertAroundSelection = (before: string, after = '') => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selectedText = form.content.slice(start, end);
    const next = `${form.content.slice(0, start)}${before}${selectedText}${after}${form.content.slice(end)}`;
    setForm((p) => ({ ...p, content: next }));
    setTimeout(() => { el.focus(); const pos = start + before.length + selectedText.length + after.length; el.setSelectionRange(pos, pos); }, 0);
  };

  const insertLink = () => insertAroundSelection('[link text](', ')');

  const insertImage = async () => {
    if (!selectedId || selectedId === 'new') { setError('Please create the article first, then upload images.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const uploaded = await attachments.upload('knowledge_article', selectedId, file);
        insertAroundSelection(`![${file.name}](attachment:${uploaded.id})`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to upload image');
      }
    };
    input.click();
  };

  const insertAttachment = async () => {
    if (!selectedId || selectedId === 'new') { setError('Please create the article first, then upload attachments.'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const uploaded = await attachments.upload('knowledge_article', selectedId, file);
        insertAroundSelection(`[${file.name}](attachment:${uploaded.id})`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to upload attachment');
      }
    };
    input.click();
  };

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white';
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1';
  const toolbarBtnCls = 'px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 transition-colors font-mono text-gray-700';

  const categoryNavItem = (
    id: string,
    label: string,
    count: number,
  ) => {
    const isActive = selectedCategoryId === id;
    return (
      <button
        key={id}
        onClick={() => setSelectedCategoryId(id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-indigo-50 text-indigo-700 font-medium'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        <span className="truncate">{label}</span>
        <span className={`text-xs ml-2 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-gray-400'}`}>{count}</span>
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description={isReadOnlyView ? 'Browse guides and articles from your IT team.' : 'Browse, author, and publish knowledge articles.'}
        action={
          !isReadOnlyView ? (
            <Button onClick={openNew}>
              + New Article
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">

        {/* ── Left panel: categories + article list ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Categories */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Categories</h3>
            <div className="space-y-0.5">
              {categoryNavItem('all', 'All categories', isReadOnlyView ? articles.filter((a) => a.status === 'published').length : articles.length)}
              {categories.map((c) =>
                categoryNavItem(c.id, categoryLabelById.get(c.id) || c.name, categoryCounts.counts.get(c.id) || 0),
              )}
              {categoryNavItem('uncategorized', 'Uncategorized', categoryCounts.uncategorized)}
            </div>
          </Card>

          {/* Article list */}
          <Card>
            <div className="space-y-3">
              {/* Search */}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles..."
                className={inputCls}
              />

              {/* Status filter — agents only */}
              {!isReadOnlyView && (
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        statusFilter === s
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Article rows */}
              <div className="space-y-1 max-h-[55vh] overflow-y-auto -mx-1 px-1">
                {filtered.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No articles found.</p>
                ) : (
                  filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => openArticle(a.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        selectedId === a.id
                          ? 'border-indigo-200 bg-indigo-50'
                          : 'border-transparent hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs text-gray-400 font-mono">{a.number}</span>
                        <Badge value={a.status} />
                      </div>
                      <p className={`text-sm font-medium truncate ${selectedId === a.id ? 'text-indigo-800' : 'text-gray-900'}`}>
                        {a.title}
                      </p>
                      {a.category_id && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {categoryLabelById.get(a.category_id) || a.category_name}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ── Right panel: article editor ── */}
        <div className="lg:col-span-3">
          {!selectedId ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-600 mb-1">No article selected</p>
                <p className="text-xs text-gray-400 mb-4">Select an article from the list{!isReadOnlyView ? ' or create a new one' : ''}.</p>
                {!isReadOnlyView && <Button onClick={openNew}>+ New Article</Button>}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="space-y-6">

                {/* ── Header ── */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {selected ? (
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-mono text-gray-400">{selected.number}</span>
                        <Badge value={selected.status} />
                        {selected.version_no && (
                          <span className="text-xs text-gray-400">v{selected.version_no}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mb-0.5">New Article</p>
                    )}
                    <h2 className="text-lg font-semibold text-gray-900 truncate">
                      {form.title || 'Untitled Article'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isReadOnlyView && selectedId !== 'new' && isPublished && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (isReadOnlyView) return;
                          if (!selectedId || selectedId === 'new') return;
                          const created = await knowledge.newVersion(selectedId);
                          await load();
                          await openArticle(created.id);
                        }}
                      >
                        New Version
                      </Button>
                    )}
                    {selectedId !== 'new' && !isPublished && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSubmitReview}
                        disabled={saving}
                      >
                        Submit for Review
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving || isPublished || !form.title || !form.content}
                    >
                      {saving ? 'Saving...' : selectedId === 'new' ? 'Create' : isPublished ? 'Read-only' : 'Save'}
                    </Button>
                  </div>
                </div>

                {error && (
                  <div className="px-3 py-2.5 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700">
                    {error}
                  </div>
                )}

                {/* ── Article Details ── */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Article Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Title</label>
                      <input
                        value={form.title}
                        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Article title..."
                        className={inputCls}
                        readOnly={isPublished}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Category</label>
                      <select
                        value={form.category_id}
                        onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
                        className={inputCls}
                        disabled={isPublished}
                      >
                        <option value="">No category</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{categoryLabelById.get(c.id) || c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Assignment Group</label>
                      <select
                        value={form.assignment_group_id}
                        onChange={(e) => setForm((p) => ({ ...p, assignment_group_id: e.target.value }))}
                        className={inputCls}
                        disabled={isPublished}
                      >
                        <option value="">No assignment group</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    {!isPublished && selectedId !== 'new' && (
                      <div>
                        <label className={labelCls}>Status</label>
                        <select
                          value={form.status}
                          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as KnowledgeArticle['status'] }))}
                          className={inputCls}
                        >
                          <option value="draft">Draft</option>
                          <option value="review">Review</option>
                          <option value="published">Published</option>
                          <option value="retired">Retired</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Content ── */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Content</h3>

                  {isPublished ? (
                    <div className="space-y-4">
                      <div className="w-full min-h-[260px] px-4 py-4 border border-gray-200 rounded-lg text-sm prose max-w-none bg-gray-50/40">
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '', attachmentUrls) }} />
                      </div>
                      {selected && <RatingsWidget articleId={selected.id} />}
                    </div>
                  ) : (
                    <>
                      {/* Toolbar */}
                      <div className="flex flex-wrap items-center gap-1 mb-2 p-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                        <button type="button" onClick={() => insertAroundSelection('**', '**')} className={toolbarBtnCls} title="Bold"><strong>B</strong></button>
                        <button type="button" onClick={() => insertAroundSelection('*', '*')} className={`${toolbarBtnCls} italic`} title="Italic">I</button>
                        <span className="w-px h-4 bg-gray-300 mx-0.5" />
                        <button type="button" onClick={() => insertAtLineStart('# ')} className={toolbarBtnCls} title="Heading 1">H1</button>
                        <button type="button" onClick={() => insertAtLineStart('## ')} className={toolbarBtnCls} title="Heading 2">H2</button>
                        <button type="button" onClick={() => insertAtLineStart('### ')} className={toolbarBtnCls} title="Heading 3">H3</button>
                        <span className="w-px h-4 bg-gray-300 mx-0.5" />
                        <button type="button" onClick={() => insertAtLineStart('- ')} className={toolbarBtnCls} title="Bullet list">UL</button>
                        <button type="button" onClick={() => insertAtLineStart('1. ')} className={toolbarBtnCls} title="Numbered list">OL</button>
                        <span className="w-px h-4 bg-gray-300 mx-0.5" />
                        <button type="button" onClick={() => insertAroundSelection('`', '`')} className={toolbarBtnCls} title="Inline code">`</button>
                        <button type="button" onClick={() => insertAroundSelection('```\n', '\n```')} className={toolbarBtnCls} title="Code block">```</button>
                        <span className="w-px h-4 bg-gray-300 mx-0.5" />
                        <button type="button" onClick={insertLink} className={toolbarBtnCls} title="Link">Link</button>
                        <button type="button" onClick={insertImage} className={toolbarBtnCls} title="Upload image">Image</button>
                        <button type="button" onClick={insertAttachment} className={toolbarBtnCls} title="Upload attachment">Attach</button>
                        <button type="button" onClick={() => insertAtLineStart('---')} className={toolbarBtnCls} title="Horizontal rule">HR</button>
                      </div>

                      {/* Split pane */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <textarea
                          ref={contentRef}
                          value={form.content}
                          onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                          rows={20}
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono resize-none"
                          placeholder="Write in markdown..."
                        />
                        <div className="hidden lg:block">
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Preview</p>
                          <div className="w-full h-[calc(100%-24px)] min-h-[300px] px-4 py-3 border border-gray-200 rounded-lg text-sm bg-gray-50/40 overflow-y-auto">
                            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '', attachmentUrls) }} />
                          </div>
                        </div>
                        <div className="lg:hidden">
                          <p className="text-xs font-medium text-gray-500 mb-1.5">Preview</p>
                          <div className="w-full min-h-[180px] px-4 py-3 border border-gray-200 rounded-lg text-sm bg-gray-50/40">
                            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content || '', attachmentUrls) }} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ── Versions ── */}
                {selected?.versions?.length ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Versions</h3>
                    <div className="flex flex-wrap gap-2">
                      {selected.versions.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => openArticle(v.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            v.id === selected.id
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {v.number} · v{v.version_no} · <Badge value={v.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* ── Approvals ── */}
                {selected?.approvals?.length ? (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Approval Steps</h3>
                    <div className="space-y-2">
                      {selected.approvals.map((ap) => (
                        <div key={ap.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50/40">
                          <span className="text-xs text-gray-400">Step {ap.step_order}</span>
                          <span className="text-sm font-medium text-gray-800">{ap.assignment_group_name}</span>
                          <Badge value={ap.status} />
                          {ap.status === 'pending' && (
                            <div className="ml-auto flex items-center gap-2">
                              <Button size="sm" onClick={() => handleDecision(ap.id, 'approved')} className="bg-green-600 hover:bg-green-700">
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDecision(ap.id, 'rejected')} className="text-red-600 border-red-200 hover:bg-red-50">
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* ── Metadata footer ── */}
                {selected && (
                  <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                    <span>Number: <span className="text-gray-600">{selected.number}</span></span>
                    <span>Views: <span className="text-gray-600">{selected.view_count}</span></span>
                    <span>Group: <span className="text-gray-600">{selected.assignment_group_name || 'None'}</span></span>
                    <span>Updated: <span className="text-gray-600">{formatDateTime(selected.updated_at)}</span></span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
