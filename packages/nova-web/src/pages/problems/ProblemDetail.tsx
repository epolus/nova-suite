/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { attachments as attachmentsApi, problems as problemsApi } from '@/api/client';
import type { Attachment, KnownError, ProblemTask } from '@/api/client';
import { useProblemDetail } from './useProblemDetail';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { AttachmentCard } from '../../components/AttachmentCard';
import { useFieldLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import {
  ProblemIncidentsPanel,
  ProblemTasksPanel,
  ProblemKnownErrorsPanel,
  type TaskFormState,
  type KnownErrorFormState,
} from './ProblemDetailTabs';
import { ProblemSummaryCard } from './ProblemSummaryCard';

export default function ProblemDetail() {
  const {
    id,
    isNew,
    loading,
    saving,
    error,
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
  } = useProblemDetail();
  const navigate = useNavigate();
  const tProblems = useTranslations('pages.problems');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const fieldLabel = useFieldLabel();

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
  });

  useEffect(() => {
    if (!incidentSearch.trim() || !id || isNew) {
      setIncidentResults([]);
      return;
    }
    const t = setTimeout(() => {
      problemsApi.searchIncidents(incidentSearch).then((r) => setIncidentResults(r.incidents));
    }, 200);
    return () => clearTimeout(t);
  }, [incidentSearch, id, isNew]);

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
    });
    const keRes = await problemsApi.knownErrors(id);
    setKnownErrors(keRes.known_errors);
    setKeForm({ title: '', symptoms: '', workaround: '', permanent_fix_eta: '', tags: '', severity: 'medium', is_active: true });
  };

  const toggleKnownError = async (ke: KnownError) => {
    if (!id || isNew) return;
    await problemsApi.updateKnownError(id, ke.id, { is_active: !ke.is_active });
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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) handleFileUpload(files);
  };

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = `${inputCls} bg-white`;
  const textareaCls = `${inputCls} resize-none`;
  const pageTitle = isNew
    ? tProblems('newProblem')
    : problem?.number
      ? `${problem.number} — ${form.title || problem.title || ''}`.trim()
      : form.title || tProblems('title');

  return (
    <>
      <PageHeader
        title={pageTitle}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || !form.title || !form.assignment_group_id}>
              {saving ? tActions('saving') : isNew ? tProblems('createProblem') : tMaster('saveChanges')}
            </Button>
            <Button variant="outline" size="icon" onClick={() => prevId && goTo(prevId)} disabled={!prevId} title={tProblems('previousRecord')}>&#8592;</Button>
            <Button variant="outline" size="icon" onClick={() => nextId && goTo(nextId)} disabled={!nextId} title={tProblems('nextRecord')}>&#8594;</Button>
            <Button variant="outline" onClick={() => navigate('/problems')}>{tProblems('backToList')}</Button>
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

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">

        {/* ── Left pane ── */}
        <div className="space-y-6">
          {problem && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">{tProblems('incidentImpact')}</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">{tProblems('linkedIncidents')}</dt>
                  <dd className="text-gray-900 font-medium mt-0.5">{problem.incident_count || 0}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">{tProblems('openIncidents')}</dt>
                  <dd className="font-medium mt-0.5">{problem.open_incident_count || 0}</dd>
                </div>
              </dl>
            </Card>
          )}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">{tProblems('workaround')}</h3>
            <textarea rows={5} value={form.workaround} onChange={(e) => setForm((p) => ({ ...p, workaround: e.target.value }))} className={textareaCls} placeholder={tProblems('workaroundPlaceholder')} />
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">{tProblems('permanentFix')}</h3>
            <textarea rows={5} value={form.permanent_fix} onChange={(e) => setForm((p) => ({ ...p, permanent_fix: e.target.value }))} className={textareaCls} placeholder={tProblems('permanentFixPlaceholder')} />
          </Card>
        </div>

        {/* ── Center pane ── */}
        <div className="space-y-6 min-w-0">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tProblems('problemDetails')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('title')} <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} placeholder={tProblems('problemTitle')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('description')}</label>
                <textarea rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={textareaCls} placeholder={tProblems('describeProblem')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tProblems('symptoms')}</label>
                <textarea rows={3} value={form.symptoms} onChange={(e) => setForm((p) => ({ ...p, symptoms: e.target.value }))} className={textareaCls} placeholder={tProblems('symptomsPlaceholder')} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tProblems('rootCause')}</label>
                <textarea rows={3} value={form.root_cause} onChange={(e) => setForm((p) => ({ ...p, root_cause: e.target.value }))} className={textareaCls} placeholder={tProblems('rootCausePlaceholder')} />
              </div>
              {(form.status === 'resolved' || form.status === 'closed' || form.resolution_notes) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tProblems('resolutionNotes')}</label>
                  <textarea rows={3} value={form.resolution_notes} onChange={(e) => setForm((p) => ({ ...p, resolution_notes: e.target.value }))} className={textareaCls} placeholder={tProblems('howProblemResolved')} />
                </div>
              )}
            </div>
          </Card>

          {/* ── Attachments ── */}
          {!isNew && id && (
            <AttachmentCard
              attachments={fileAttachments}
              uploading={uploading}
              dragOver={dragOver}
              fileInputRef={fileInputRef}
              previewUrl={previewUrl}
              previewName={previewName}
              onDragOver={() => setDragOver(true)}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClickZone={() => fileInputRef.current?.click()}
              onFileChange={handleFileUpload}
              onPreview={handlePreview}
              onDownload={(a) => attachmentsApi.download(a.id, a.file_name)}
              onDelete={handleDeleteAttachment}
              onClosePreview={closePreview}
              formatSize={formatSize}
            />
          )}

          {/* ── Sub-entity tabs ── */}
          {!isNew && id && (
            <>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'incidents' as const, label: tProblems('tabs.incidents', { count: linkedIncidents.length }) },
                  { key: 'tasks' as const, label: tProblems('tabs.tasks', { count: tasks.length }) },
                  { key: 'known_errors' as const, label: tProblems('tabs.knownErrors', { count: knownErrors.length }) },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      activeTab === tab.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'incidents' && (
                <ProblemIncidentsPanel
                  incidentSearch={incidentSearch}
                  setIncidentSearch={setIncidentSearch}
                  incidentResults={incidentResults}
                  linkedIncidents={linkedIncidents}
                  linkIncident={linkIncident}
                  unlinkIncident={unlinkIncident}
                  inputCls={inputCls}
                />
              )}

              {activeTab === 'tasks' && (
                <ProblemTasksPanel
                  taskForm={taskForm}
                  setTaskForm={setTaskForm}
                  createTask={createTask}
                  tasks={tasks}
                  updateTaskStatus={updateTaskStatus}
                  removeTask={removeTask}
                  inputCls={inputCls}
                  selectCls={selectCls}
                  textareaCls={textareaCls}
                />
              )}

              {activeTab === 'known_errors' && (
                <ProblemKnownErrorsPanel
                  keForm={keForm}
                  setKeForm={setKeForm}
                  createKnownError={createKnownError}
                  knownErrors={knownErrors}
                  toggleKnownError={toggleKnownError}
                  inputCls={inputCls}
                  selectCls={selectCls}
                  textareaCls={textareaCls}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
