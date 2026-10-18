/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useRef, useState } from 'react';
import { attachments as attachmentsApi, knowledge as knowledgeApi, problems as problemsApi } from '@/api/client';
import type { Attachment, KnownError, ProblemTask } from '@/api/client';
import { useProblemDetail } from './useProblemDetail';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import UnsavedChangesDialog from '../../components/ui/UnsavedChangesDialog';
import { Button } from '../../components/ui/button';
import { useTranslations } from 'use-intl';
import {
  type TaskFormState,
  type KnownErrorFormState,
  type KbArticleSearchResult,
} from './ProblemDetailTabs';
import { ProblemSummaryCard } from './ProblemSummaryCard';
import { ProblemDetailBody } from './ProblemDetailBody';

export default function ProblemDetail() {
  const {
    id,
    isNew,
    loading,
    saving,
    error,
    setError,
    problem,
    form,
    setForm,
    groups,
    ciItems,
    linkedIncidents,
    setLinkedIncidents,
    tasks,
    setTasks,
    knownErrors,
    setKnownErrors,
    prevId,
    nextId,
    fileAttachments,
    setFileAttachments,
    goTo,
    save,
    guardNavigate,
    unsavedDialogOpen,
    unsavedDialogSaving,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useProblemDetail();
  const tProblems = useTranslations('pages.problems');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');

  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentResults, setIncidentResults] = useState<Array<{ id: string; number: string; title: string; status: string }>>([]);
  const [activeTab, setActiveTab] = useState<'incidents' | 'tasks' | 'known_errors'>('incidents');

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  const [taskForm, setTaskForm] = useState<TaskFormState>({
    title: '',
    description: '',
    task_type: 'investigate',
    status: 'pending',
    assigned_to: '',
    due_date: '',
  });
  const [keForm, setKeForm] = useState<KnownErrorFormState>({
    title: '',
    symptoms: '',
    workaround: '',
    permanent_fix_eta: '',
    tags: '',
    severity: 'medium',
    is_active: true,
    kb_article_id: '',
    kb_article_label: '',
  });
  const [kbSearch, setKbSearch] = useState('');
  const [kbResults, setKbResults] = useState<KbArticleSearchResult[]>([]);
  const [linkingKeId, setLinkingKeId] = useState<string | null>(null);
  const [linkKbSearch, setLinkKbSearch] = useState('');
  const [linkKbResults, setLinkKbResults] = useState<KbArticleSearchResult[]>([]);

  const canSearchIncidents = !!incidentSearch.trim() && !!id && !isNew;
  const canSearchKb = !!kbSearch.trim();
  const canSearchLinkKb = !!linkKbSearch.trim() && !!linkingKeId;

  const [prevCanSearch, setPrevCanSearch] = useState(canSearchIncidents);
  if (canSearchIncidents !== prevCanSearch) {
    setPrevCanSearch(canSearchIncidents);
    if (!canSearchIncidents) setIncidentResults([]);
  }

  const [prevCanSearchKb, setPrevCanSearchKb] = useState(canSearchKb);
  if (canSearchKb !== prevCanSearchKb) {
    setPrevCanSearchKb(canSearchKb);
    if (!canSearchKb) setKbResults([]);
  }

  const [prevCanSearchLinkKb, setPrevCanSearchLinkKb] = useState(canSearchLinkKb);
  if (canSearchLinkKb !== prevCanSearchLinkKb) {
    setPrevCanSearchLinkKb(canSearchLinkKb);
    if (!canSearchLinkKb) setLinkKbResults([]);
  }

  useEffect(() => {
    if (!canSearchIncidents) return;
    const t = setTimeout(() => {
      problemsApi.searchIncidents(incidentSearch).then((r) => setIncidentResults(r.incidents));
    }, 200);
    return () => clearTimeout(t);
  }, [canSearchIncidents, incidentSearch]);

  useEffect(() => {
    if (!canSearchKb) return;
    const query = kbSearch.trim();
    const t = setTimeout(() => {
      knowledgeApi.articles({ search: query, status: 'published' }).then((r) => {
        setKbResults(r.articles.map((a) => ({ id: a.id, number: a.number, title: a.title })));
      }).catch(() => setKbResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [canSearchKb, kbSearch]);

  useEffect(() => {
    if (!canSearchLinkKb) return;
    const query = linkKbSearch.trim();
    const t = setTimeout(() => {
      knowledgeApi.articles({ search: query, status: 'published' }).then((r) => {
        setLinkKbResults(r.articles.map((a) => ({ id: a.id, number: a.number, title: a.title })));
      }).catch(() => setLinkKbResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [canSearchLinkKb, linkKbSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId);
      if (e.key === 'ArrowRight' && nextId) goTo(nextId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, goTo]);

  const linkIncident = async (incidentId: string) => {
    if (!id || isNew) return;
    await problemsApi.linkIncident(id, incidentId);
    const list = await problemsApi.linkedIncidents(id);
    setLinkedIncidents(list.incidents);
  };

  const unlinkIncident = async (incidentId: string) => {
    if (!id || isNew) return;
    await problemsApi.unlinkIncident(id, incidentId);
    const list = await problemsApi.linkedIncidents(id);
    setLinkedIncidents(list.incidents);
  };

  const createTask = async () => {
    if (!id || isNew || !taskForm.title.trim()) return;
    await problemsApi.createTask(id, {
      title: taskForm.title.trim(),
      description: taskForm.description || null,
      task_type: taskForm.task_type as ProblemTask['task_type'],
      status: taskForm.status as ProblemTask['status'],
      assigned_to: taskForm.assigned_to || null,
      due_date: taskForm.due_date || null,
    });
    const tRes = await problemsApi.tasks(id);
    setTasks(tRes.tasks);
    setTaskForm({ title: '', description: '', task_type: 'investigate', status: 'pending', assigned_to: '', due_date: '' });
  };

  const updateTaskStatus = async (task: ProblemTask, status: ProblemTask['status']) => {
    if (!id || isNew) return;
    await problemsApi.updateTask(id, task.id, { status });
    const tRes = await problemsApi.tasks(id);
    setTasks(tRes.tasks);
  };

  const removeTask = async (taskId: string) => {
    if (!id || isNew) return;
    await problemsApi.deleteTask(id, taskId);
    const tRes = await problemsApi.tasks(id);
    setTasks(tRes.tasks);
  };

  const emptyKeForm = (): KnownErrorFormState => ({
    title: '',
    symptoms: '',
    workaround: '',
    permanent_fix_eta: '',
    tags: '',
    severity: 'medium',
    is_active: true,
    kb_article_id: '',
    kb_article_label: '',
  });

  const createKnownError = async () => {
    if (!id || isNew || !keForm.title.trim() || !keForm.symptoms.trim() || !keForm.workaround.trim()) return;
    await problemsApi.createKnownError(id, {
      title: keForm.title.trim(),
      symptoms: keForm.symptoms.trim(),
      workaround: keForm.workaround.trim(),
      permanent_fix_eta: keForm.permanent_fix_eta || null,
      tags: keForm.tags.split(',').map((x) => x.trim()).filter(Boolean),
      severity: keForm.severity as KnownError['severity'],
      is_active: keForm.is_active,
      kb_article_id: keForm.kb_article_id || null,
    });
    const keRes = await problemsApi.knownErrors(id);
    setKnownErrors(keRes.known_errors);
    setKeForm(emptyKeForm());
    setKbSearch('');
    setKbResults([]);
  };

  const toggleKnownError = async (ke: KnownError) => {
    if (!id || isNew) return;
    setError('');
    try {
      await problemsApi.updateKnownError(id, ke.id, { is_active: !ke.is_active });
      const keRes = await problemsApi.knownErrors(id);
      setKnownErrors(keRes.known_errors);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update known error');
    }
  };

  const selectKbArticle = (article: KbArticleSearchResult) => {
    setKeForm((p) => ({
      ...p,
      kb_article_id: article.id,
      kb_article_label: `${article.number} — ${article.title}`,
    }));
    setKbSearch('');
    setKbResults([]);
  };

  const clearKbArticle = () => {
    setKeForm((p) => ({ ...p, kb_article_id: '', kb_article_label: '' }));
  };

  const linkKbArticle = async (ke: KnownError, articleId: string) => {
    if (!id || isNew) return;
    await problemsApi.linkKnownErrorKbArticle(id, ke.id, articleId);
    const keRes = await problemsApi.knownErrors(id);
    setKnownErrors(keRes.known_errors);
    setLinkingKeId(null);
    setLinkKbSearch('');
    setLinkKbResults([]);
  };

  const unlinkKbArticle = async (ke: KnownError) => {
    if (!id || isNew) return;
    await problemsApi.unlinkKnownErrorKbArticle(id, ke.id);
    const keRes = await problemsApi.knownErrors(id);
    setKnownErrors(keRes.known_errors);
  };


  const handleFileUpload = async (files: File[]) => {
    if (!id || isNew) return;
    setUploading(true);
    try {
      for (const file of files) {
        await attachmentsApi.upload('problem', id, file);
      }
      const aRes = await attachmentsApi.list('problem', id);
      setFileAttachments(aRes.attachments);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!id || isNew) return;
    await attachmentsApi.delete(attId);
    const aRes = await attachmentsApi.list('problem', id);
    setFileAttachments(aRes.attachments);
  };

  const handlePreview = async (att: Attachment) => {
    if (!att.mime_type.startsWith('image/')) {
      attachmentsApi.download(att.id, att.file_name);
      return;
    }
    const url = await attachmentsApi.previewUrl(att.id);
    setPreviewUrl(url);
    setPreviewName(att.file_name);
  };

  const closePreview = () => { setPreviewUrl(null); setPreviewName(''); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFileUpload(files);
  };

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden';
  const selectCls = `${inputCls} bg-white`;
  const textareaCls = `${inputCls} resize-none`;
  const pageTitle = isNew
    ? tProblems('newProblem')
    : problem?.number
      ? `${problem.number} — ${form.title || problem.title || ''}`.trim()
      : form.title || tProblems('title');

  return (
    <>
      <UnsavedChangesDialog
        open={unsavedDialogOpen}
        saving={unsavedDialogSaving}
        onStay={stayOnPage}
        onLeave={leaveWithoutSaving}
        onSaveAndLeave={saveAndLeave}
      />
      <PageHeader
        title={pageTitle}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || !form.title || !form.assignment_group_id}>
              {saving ? tActions('saving') : isNew ? tProblems('createProblem') : tMaster('saveChanges')}
            </Button>
            <Button variant="outline" size="icon" onClick={() => prevId && goTo(prevId)} disabled={!prevId} title={tProblems('previousRecord')}>&#8592;</Button>
            <Button variant="outline" size="icon" onClick={() => nextId && goTo(nextId)} disabled={!nextId} title={tProblems('nextRecord')}>&#8594;</Button>
            <Button variant="outline" onClick={() => guardNavigate('/problems')}>{tProblems('backToList')}</Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>
      )}

      {/* ── Summary ── */}
      <ProblemSummaryCard
        form={form}
        setForm={setForm}
        problem={problem}
        groups={groups}
        ciItems={ciItems}
        inputCls={inputCls}
        selectCls={selectCls}
      />

      <ProblemDetailBody
        problem={problem}
        form={form}
        setForm={setForm}
        inputCls={inputCls}
        selectCls={selectCls}
        textareaCls={textareaCls}
        isNew={isNew}
        id={id}
        fileAttachments={fileAttachments}
        uploading={uploading}
        dragOver={dragOver}
        fileInputRef={fileInputRef}
        previewUrl={previewUrl}
        previewName={previewName}
        onDragOver={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onFileChange={handleFileUpload}
        onPreview={handlePreview}
        onDeleteAttachment={handleDeleteAttachment}
        onClosePreview={closePreview}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        linkedIncidents={linkedIncidents}
        incidentSearch={incidentSearch}
        setIncidentSearch={setIncidentSearch}
        incidentResults={incidentResults}
        linkIncident={linkIncident}
        unlinkIncident={unlinkIncident}
        taskForm={taskForm}
        setTaskForm={setTaskForm}
        createTask={createTask}
        tasks={tasks}
        updateTaskStatus={updateTaskStatus}
        removeTask={removeTask}
        keForm={keForm}
        setKeForm={setKeForm}
        createKnownError={createKnownError}
        knownErrors={knownErrors}
        toggleKnownError={toggleKnownError}
        kbSearch={kbSearch}
        setKbSearch={setKbSearch}
        kbResults={kbResults}
        selectKbArticle={selectKbArticle}
        clearKbArticle={clearKbArticle}
        linkKbArticle={linkKbArticle}
        unlinkKbArticle={unlinkKbArticle}
        linkingKeId={linkingKeId}
        setLinkingKeId={setLinkingKeId}
        linkKbSearch={linkKbSearch}
        setLinkKbSearch={setLinkKbSearch}
        linkKbResults={linkKbResults}
      />
    </>
  );
}
