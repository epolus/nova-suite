/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { attachments as attachmentsApi, cmdb, problems as problemsApi } from '../../api/client';
import type { AssignmentGroupItem, Attachment, CI, KnownError, Problem, ProblemIncidentLink, ProblemTask } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { AttachmentCard } from '../../components/AttachmentCard';
import { formatDateTime } from '../../utils/dateTime';

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'medium' as Problem['priority'],
  impact: 'medium' as Problem['impact'],
  category: '',
  status: 'new' as Problem['status'],
  assignment_group_id: '',
  affected_ci: '',
  root_cause: '',
  symptoms: '',
  workaround: '',
  permanent_fix: '',
  resolution_notes: '',
};

export default function ProblemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const listParams: Record<string, string> = (location.state as { listParams?: Record<string, string> })?.listParams || {};
  const isNew = id === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [ciItems, setCiItems] = useState<CI[]>([]);
  const [linkedIncidents, setLinkedIncidents] = useState<ProblemIncidentLink[]>([]);
  const [tasks, setTasks] = useState<ProblemTask[]>([]);
  const [knownErrors, setKnownErrors] = useState<KnownError[]>([]);
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentResults, setIncidentResults] = useState<Array<{ id: string; number: string; title: string; status: string }>>([]);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'incidents' | 'tasks' | 'known_errors'>('incidents');

  const [fileAttachments, setFileAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    task_type: 'investigate',
    status: 'pending',
    assigned_to: '',
    due_date: '',
  });
  const [keForm, setKeForm] = useState({
    title: '',
    symptoms: '',
    workaround: '',
    permanent_fix_eta: '',
    tags: '',
    severity: 'medium',
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, ciRes] = await Promise.all([
        problemsApi.assignmentGroups(),
        cmdb.items({ status: 'active' }, 1, 100),
      ]);
      setGroups(gRes.assignment_groups);
      setCiItems(ciRes.items);

      if (isNew) {
        setProblem(null);
        setForm(EMPTY_FORM);
        setLinkedIncidents([]);
        setTasks([]);
        setKnownErrors([]);
        setPrevId(null);
        setNextId(null);
      } else if (id) {
        const [pRes, lRes, tRes, keRes, navRes, aRes] = await Promise.all([
          problemsApi.get(id),
          problemsApi.linkedIncidents(id),
          problemsApi.tasks(id),
          problemsApi.knownErrors(id),
          problemsApi.nav(id, listParams),
          attachmentsApi.list('problem', id),
        ]);
        setProblem(pRes);
        setForm({
          title: pRes.title,
          description: pRes.description || '',
          priority: pRes.priority,
          impact: pRes.impact,
          category: pRes.category || '',
          status: pRes.status,
          assignment_group_id: pRes.assignment_group_id || '',
          affected_ci: pRes.affected_ci || '',
          root_cause: pRes.root_cause || '',
          symptoms: pRes.symptoms || '',
          workaround: pRes.workaround || '',
          permanent_fix: pRes.permanent_fix || '',
          resolution_notes: pRes.resolution_notes || '',
        });
        setLinkedIncidents(lRes.incidents);
        setTasks(tRes.tasks);
        setKnownErrors(keRes.known_errors);
        setPrevId(navRes.prev_id);
        setNextId(navRes.next_id);
        setFileAttachments(aRes.attachments);
      }
    } finally {
      setLoading(false);
    }
  }, [id, isNew, JSON.stringify(listParams)]);

  useEffect(() => {
    load();
  }, [load]);

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

  const goTo = useCallback((targetId: string) => {
    navigate(`/problems/${targetId}`, { state: { listParams }, replace: true });
  }, [navigate, listParams]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId);
      if (e.key === 'ArrowRight' && nextId) goTo(nextId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, goTo]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (!form.assignment_group_id) {
        setError('Assignment Group is required');
        return;
      }
      const payload = {
        title: form.title,
        priority: form.priority,
        impact: form.impact,
        status: form.status,
        assignment_group_id: form.assignment_group_id,
        affected_ci: form.affected_ci || null,
        ...(form.description ? { description: form.description } : {}),
        ...(form.category ? { category: form.category } : {}),
        ...(form.root_cause ? { root_cause: form.root_cause } : {}),
        ...(form.symptoms ? { symptoms: form.symptoms } : {}),
        ...(form.workaround ? { workaround: form.workaround } : {}),
        ...(form.permanent_fix ? { permanent_fix: form.permanent_fix } : {}),
        ...(form.resolution_notes ? { resolution_notes: form.resolution_notes } : {}),
      };

      if (isNew || !id) {
        const created = await problemsApi.create(payload);
        navigate(`/problems/${created.id}`, { replace: true, state: { listParams } });
      } else {
        await problemsApi.update(id, payload);
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save problem');
    } finally {
      setSaving(false);
    }
  };

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
    ? 'New Problem'
    : problem?.number
      ? `${problem.number} — ${form.title || problem.title || ''}`.trim()
      : form.title || 'Problem';

  return (
    <>
      <PageHeader
        title={pageTitle}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || !form.title || !form.assignment_group_id}>
              {saving ? 'Saving...' : isNew ? 'Create Problem' : 'Save Changes'}
            </Button>
            <Button variant="outline" size="icon" onClick={() => prevId && goTo(prevId)} disabled={!prevId} title="Previous (Left Arrow)">&#8592;</Button>
            <Button variant="outline" size="icon" onClick={() => nextId && goTo(nextId)} disabled={!nextId} title="Next (Right Arrow)">&#8594;</Button>
            <Button variant="outline" onClick={() => navigate('/problems')}>Back to list</Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>
      )}

      {/* ── Summary ── */}
      <Card className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Problem['status'] }))} className={selectCls}>
              {['new', 'investigating', 'root_cause_identified', 'fix_in_progress', 'resolved', 'closed', 'known_error'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Problem['priority'] }))} className={selectCls}>
              {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Impact</label>
            <select value={form.impact} onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value as Problem['impact'] }))} className={selectCls}>
              {['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className={inputCls} placeholder="Category" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Assignment Group <span className="text-red-500">*</span>
            </label>
            <select value={form.assignment_group_id} onChange={(e) => setForm((p) => ({ ...p, assignment_group_id: e.target.value }))} className={selectCls}>
              <option value="">Select assignment group...</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Affected CI</label>
            <select value={form.affected_ci} onChange={(e) => setForm((p) => ({ ...p, affected_ci: e.target.value }))} className={selectCls}>
              <option value="">— No CI —</option>
              {ciItems.map((ci) => <option key={ci.id} value={ci.id}>{ci.display_name || ci.name}</option>)}
            </select>
          </div>
          {problem && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Reported By</label>
                <p className="text-sm text-gray-900 mt-0.5">{problem.reported_by_name || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Last Updated</label>
                <p className="text-sm text-gray-900 mt-0.5">{formatDateTime(problem.updated_at)}</p>
              </div>
            </>
          )}
        </div>
      </Card>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">

        {/* ── Left pane ── */}
        <div className="space-y-6">
          {problem && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Incident Impact</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Linked Incidents</dt>
                  <dd className="text-gray-900 font-medium mt-0.5">{problem.incident_count || 0}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Open Incidents</dt>
                  <dd className="font-medium mt-0.5">{problem.open_incident_count || 0}</dd>
                </div>
              </dl>
            </Card>
          )}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Workaround</h3>
            <textarea rows={5} value={form.workaround} onChange={(e) => setForm((p) => ({ ...p, workaround: e.target.value }))} className={textareaCls} placeholder="Describe the workaround..." />
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Permanent Fix</h3>
            <textarea rows={5} value={form.permanent_fix} onChange={(e) => setForm((p) => ({ ...p, permanent_fix: e.target.value }))} className={textareaCls} placeholder="Describe the permanent fix..." />
          </Card>
        </div>

        {/* ── Center pane ── */}
        <div className="space-y-6 min-w-0">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Problem Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Problem title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={textareaCls} placeholder="Describe the problem..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Symptoms</label>
                <textarea rows={3} value={form.symptoms} onChange={(e) => setForm((p) => ({ ...p, symptoms: e.target.value }))} className={textareaCls} placeholder="What symptoms are observed?" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Root Cause</label>
                <textarea rows={3} value={form.root_cause} onChange={(e) => setForm((p) => ({ ...p, root_cause: e.target.value }))} className={textareaCls} placeholder="Root cause analysis..." />
              </div>
              {(form.status === 'resolved' || form.status === 'closed' || form.resolution_notes) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Resolution Notes</label>
                  <textarea rows={3} value={form.resolution_notes} onChange={(e) => setForm((p) => ({ ...p, resolution_notes: e.target.value }))} className={textareaCls} placeholder="How was the problem resolved?" />
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
                {[
                  { key: 'incidents' as const, label: `Incidents (${linkedIncidents.length})` },
                  { key: 'tasks' as const, label: `Tasks (${tasks.length})` },
                  { key: 'known_errors' as const, label: `Known Errors (${knownErrors.length})` },
                ].map((tab) => (
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
                <Card>
                  <h3 className="font-semibold text-gray-900 mb-4">Linked Incidents</h3>
                  <input
                    value={incidentSearch}
                    onChange={(e) => setIncidentSearch(e.target.value)}
                    placeholder="Search incidents by number/title..."
                    className={`${inputCls} mb-3`}
                  />
                  {incidentResults.length > 0 && (
                    <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                      {incidentResults.map((inc) => (
                        <button key={inc.id} onClick={() => linkIncident(inc.id)} className="w-full text-left p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          <span className="text-xs text-gray-500">{inc.number}</span>
                          <p className="text-sm text-gray-900">{inc.title}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    {linkedIncidents.map((li) => (
                      <div key={li.incident_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                        <span className="text-sm font-medium text-indigo-700 shrink-0">{li.incident_number}</span>
                        <span className="text-sm text-gray-800 flex-1 min-w-0 truncate">{li.incident_title}</span>
                        <span className="text-xs text-gray-500 shrink-0">{li.relationship_type}</span>
                        <Button variant="ghost" size="sm" onClick={() => unlinkIncident(li.incident_id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0">Remove</Button>
                      </div>
                    ))}
                    {linkedIncidents.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No linked incidents.</p>}
                  </div>
                </Card>
              )}

              {activeTab === 'tasks' && (
                <Card>
                  <h3 className="font-semibold text-gray-900 mb-4">Problem Tasks</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                    <input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" className={inputCls} />
                    <select value={taskForm.task_type} onChange={(e) => setTaskForm((p) => ({ ...p, task_type: e.target.value }))} className={selectCls}>
                      {['investigate', 'analyze', 'test', 'document'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" className={`${textareaCls} md:col-span-2`} rows={2} />
                    <div className="md:col-span-2 flex justify-end">
                      <Button onClick={createTask} disabled={!taskForm.title.trim()}>+ Add Task</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900">{t.title}</p>
                          <p className="text-xs text-gray-500">{t.task_type || 'task'} · {t.assigned_to_name || 'unassigned'}</p>
                        </div>
                        <select value={t.status} onChange={(e) => updateTaskStatus(t, e.target.value as ProblemTask['status'])} className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white">
                          {['pending', 'in_progress', 'blocked', 'completed'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <Button variant="ghost" size="sm" onClick={() => removeTask(t.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                      </div>
                    ))}
                    {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No tasks yet.</p>}
                  </div>
                </Card>
              )}

              {activeTab === 'known_errors' && (
                <Card>
                  <h3 className="font-semibold text-gray-900 mb-4">Known Errors</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                    <input value={keForm.title} onChange={(e) => setKeForm((p) => ({ ...p, title: e.target.value }))} placeholder="Known error title" className={inputCls} />
                    <input value={keForm.tags} onChange={(e) => setKeForm((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma separated)" className={inputCls} />
                    <textarea value={keForm.symptoms} onChange={(e) => setKeForm((p) => ({ ...p, symptoms: e.target.value }))} placeholder="Symptoms" className={textareaCls} rows={2} />
                    <textarea value={keForm.workaround} onChange={(e) => setKeForm((p) => ({ ...p, workaround: e.target.value }))} placeholder="Workaround" className={textareaCls} rows={2} />
                    <div className="flex items-center gap-2">
                      <select value={keForm.severity} onChange={(e) => setKeForm((p) => ({ ...p, severity: e.target.value }))} className={selectCls}>
                        {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="date" value={keForm.permanent_fix_eta} onChange={(e) => setKeForm((p) => ({ ...p, permanent_fix_eta: e.target.value }))} className={inputCls} />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={createKnownError} disabled={!keForm.title.trim() || !keForm.symptoms.trim() || !keForm.workaround.trim()}>+ Add Known Error</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {knownErrors.map((ke) => (
                      <div key={ke.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{ke.title}</p>
                          <p className="text-xs text-gray-500">{ke.severity || 'n/a'} · {ke.tags.join(', ') || 'no tags'}</p>
                        </div>
                        <button
                          onClick={() => toggleKnownError(ke)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${ke.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {ke.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </div>
                    ))}
                    {knownErrors.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No known errors yet.</p>}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
