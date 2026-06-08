/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import {
  attachments,
  knowledge,
  type AssignmentGroupItem,
  type KnowledgeArticle,
  type KnowledgeArticleDetail,
  type KnowledgeCategory,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import { hasKnowledgeRole } from '../../utils/roles';
import { ArticleListPanel, type StatusFilter } from './knowledgeSections';
import { ArticleEditorPanel } from './ArticleEditorPanel';

const EMPTY_FORM = {
  title: '',
  content: '',
  category_id: '',
  assignment_group_id: '',
  status: 'draft' as KnowledgeArticle['status'],
};

export default function KnowledgePage() {
  const t = useTranslations('pages.knowledge');
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
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canManageKnowledge, t]);

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

  const openArticle = useCallback(async (id: string) => {
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
      setError(err instanceof Error ? err.message : t('loadArticleFailed'));
    }
  }, [t]);

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
  }, [searchParams, setSearchParams, loading, selectedId, articles, openArticle]);

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
      setError(err instanceof Error ? err.message : t('saveFailed'));
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
      setError(err instanceof Error ? err.message : t('submitReviewFailed'));
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
      setError(err instanceof Error ? err.message : t('decideFailed'));
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
    if (!selectedId || selectedId === 'new') { setError(t('createFirstForImages')); return; }
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
        setError(err instanceof Error ? err.message : t('uploadImageFailed'));
      }
    };
    input.click();
  };

  const insertAttachment = async () => {
    if (!selectedId || selectedId === 'new') { setError(t('createFirstForAttachments')); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const uploaded = await attachments.upload('knowledge_article', selectedId, file);
        insertAroundSelection(`[${file.name}](attachment:${uploaded.id})`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('uploadAttachmentFailed'));
      }
    };
    input.click();
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={isReadOnlyView ? t('titleEss') : t('titleEss')}
        description={isReadOnlyView ? t('descriptionEss') : t('descriptionAgent')}
        action={
          !isReadOnlyView ? (
            <Button onClick={openNew}>
              + {t('newArticle')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <ArticleListPanel
          articles={articles}
          categories={categories}
          categoryLabelById={categoryLabelById}
          categoryCounts={categoryCounts}
          filtered={filtered}
          isReadOnlyView={isReadOnlyView}
          selectedId={selectedId}
          selectedCategoryId={selectedCategoryId}
          setSelectedCategoryId={setSelectedCategoryId}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          openArticle={openArticle}
        />

        <ArticleEditorPanel
          selectedId={selectedId}
          selected={selected}
          form={form}
          setForm={setForm}
          isReadOnlyView={isReadOnlyView}
          isPublished={isPublished}
          saving={saving}
          error={error}
          categories={categories}
          groups={groups}
          categoryLabelById={categoryLabelById}
          attachmentUrls={attachmentUrls}
          contentRef={contentRef}
          openNew={openNew}
          load={load}
          openArticle={openArticle}
          handleSave={handleSave}
          handleSubmitReview={handleSubmitReview}
          handleDecision={handleDecision}
          insertAtLineStart={insertAtLineStart}
          insertAroundSelection={insertAroundSelection}
          insertLink={insertLink}
          insertImage={insertImage}
          insertAttachment={insertAttachment}
        />
      </div>
    </>
  );
}
