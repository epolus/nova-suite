/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  attachments,
  knowledge,
  type AssignmentGroupItem,
  type KnowledgeArticle,
  type KnowledgeArticleDetail,
  type KnowledgeCategory,
} from '../../api/client';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { createKnowledgeEditorInsertHandlers } from './knowledgeEditorInsert';
import type { StatusFilter } from './knowledgeSections';

export const EMPTY_KNOWLEDGE_FORM = {
  title: '',
  content: '',
  category_id: '',
  assignment_group_id: '',
  status: 'draft' as KnowledgeArticle['status'],
};

export function useKnowledgePage(
  t: (key: string) => string,
  canManageKnowledge: boolean,
) {
  const isReadOnlyView = !canManageKnowledge;
  const [searchParams, setSearchParams] = useSearchParams();

  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [selected, setSelected] = useState<KnowledgeArticleDetail | null>(null);
  const [form, setForm] = useState(EMPTY_KNOWLEDGE_FORM);
  const [baseline, setBaseline] = useState(EMPTY_KNOWLEDGE_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false);
  const pendingArticleAction = useRef<(() => void) | null>(null);

  const isArticleDirty = useMemo(
    () => !isReadOnlyView && selectedId !== null && JSON.stringify(form) !== JSON.stringify(baseline),
    [baseline, form, isReadOnlyView, selectedId],
  );

  const saveRef = useRef<() => Promise<boolean>>(async () => false);

  const {
    dialogOpen: unsavedDialogOpen,
    saving: unsavedDialogSaving,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useUnsavedChangesGuard({
    isDirty: isArticleDirty,
    enabled: !isReadOnlyView,
    onSave: useCallback(() => saveRef.current(), []),
  });

  const requestArticleSwitch = useCallback((action: () => void) => {
    if (!isArticleDirty) {
      action();
      return;
    }
    pendingArticleAction.current = action;
    setSwitchDialogOpen(true);
  }, [isArticleDirty]);

  const completeArticleSwitch = useCallback(() => {
    const action = pendingArticleAction.current;
    pendingArticleAction.current = null;
    setSwitchDialogOpen(false);
    action?.();
  }, []);

  const stayOnArticle = useCallback(() => {
    pendingArticleAction.current = null;
    setSwitchDialogOpen(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [aRes, cRes] = await Promise.all([
        knowledge.articles(),
        knowledge.categories(),
      ]);
      const gRes = canManageKnowledge
        ? await knowledge.assignmentGroups()
        : { assignment_groups: [] as AssignmentGroupItem[] };
      setArticles(aRes.articles);
      setCategories(cRes.categories.filter((c) => c.is_active));
      setGroups(gRes.assignment_groups.filter((g) => g.is_active));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [canManageKnowledge, t]);

  useEffect(() => { void load(); }, [load]);

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
    requestArticleSwitch(() => {
      setSelectedId('new');
      setSelected(null);
      setForm(EMPTY_KNOWLEDGE_FORM);
      setBaseline(EMPTY_KNOWLEDGE_FORM);
      setError('');
    });
  };

  const openArticle = useCallback(async (id: string) => {
    requestArticleSwitch(async () => {
      setError('');
      setSelectedId(id);
      try {
        const detail = await knowledge.article(id);
        setSelected(detail);
        const nextForm = {
          title: detail.title,
          content: detail.content,
          category_id: detail.category_id || '',
          assignment_group_id: detail.assignment_group_id || '',
          status: detail.status,
        };
        setForm(nextForm);
        setBaseline(nextForm);
      } catch (err: unknown) {
        setSelected(null);
        setError(err instanceof Error ? err.message : t('loadArticleFailed'));
      }
    });
  }, [requestArticleSwitch, t]);

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

  const handleSave = useCallback(async (): Promise<boolean> => {
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
        setSelectedId(created.id);
        const detail = await knowledge.article(created.id);
        setSelected(detail);
        const nextForm = {
          title: detail.title,
          content: detail.content,
          category_id: detail.category_id || '',
          assignment_group_id: detail.assignment_group_id || '',
          status: detail.status,
        };
        setForm(nextForm);
        setBaseline(nextForm);
      } else {
        await knowledge.updateArticle(selectedId, {
          title: form.title,
          content: form.content,
          category_id: form.category_id || null,
          assignment_group_id: form.assignment_group_id || null,
          status: form.status,
        });
        await load();
        setBaseline(form);
      }
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [form, load, selectedId, t]);

  saveRef.current = handleSave;

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

  const {
    insertAtLineStart,
    insertAroundSelection,
    insertLink,
    insertImage,
    insertAttachment,
  } = useMemo(
    () => createKnowledgeEditorInsertHandlers(contentRef, form.content, setForm, selectedId, setError, t),
    [form.content, selectedId, t],
  );

  return {
    isReadOnlyView,
    loading,
    articles,
    categories,
    groups,
    selectedId,
    selected,
    form,
    setForm,
    saving,
    statusFilter,
    setStatusFilter,
    selectedCategoryId,
    setSelectedCategoryId,
    search,
    setSearch,
    error,
    contentRef,
    attachmentUrls,
    unsavedDialogOpen,
    unsavedDialogSaving,
    switchDialogOpen,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
    stayOnArticle,
    completeArticleSwitch,
    handleSave,
    filtered,
    categoryLabelById,
    categoryCounts,
    openNew,
    openArticle,
    load,
    handleSubmitReview,
    handleDecision,
    isPublished,
    insertAtLineStart,
    insertAroundSelection,
    insertLink,
    insertImage,
    insertAttachment,
  };
}
