/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, SetStateAction } from 'react';
import type { KnownError, ProblemIncidentLink, ProblemTask } from '@/api/client';
import Card from '../../components/Card';
import { Button } from '../../components/ui/button';
import { useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';

export type TaskFormState = {
  title: string;
  description: string;
  task_type: string;
  status: string;
  assigned_to: string;
  due_date: string;
};

export type KnownErrorFormState = {
  title: string;
  symptoms: string;
  workaround: string;
  permanent_fix_eta: string;
  tags: string;
  severity: string;
  is_active: boolean;
};

type IncidentSearchResult = { id: string; number: string; title: string; status: string };

export function ProblemIncidentsPanel({
  incidentSearch,
  setIncidentSearch,
  incidentResults,
  linkedIncidents,
  linkIncident,
  unlinkIncident,
  inputCls,
}: {
  incidentSearch: string;
  setIncidentSearch: Dispatch<SetStateAction<string>>;
  incidentResults: IncidentSearchResult[];
  linkedIncidents: ProblemIncidentLink[];
  linkIncident: (incidentId: string) => void;
  unlinkIncident: (incidentId: string) => void;
  inputCls: string;
}) {
  const tProblems = useTranslations('pages.problems');
  const tActions = useTranslations('common.actions');
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tProblems('linkedIncidents')}</h3>
      <input
        value={incidentSearch}
        onChange={(e) => setIncidentSearch(e.target.value)}
        placeholder={tProblems('searchIncidentsPlaceholder')}
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
            <Button variant="ghost" size="sm" onClick={() => unlinkIncident(li.incident_id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0">{tActions('remove')}</Button>
          </div>
        ))}
        {linkedIncidents.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{tProblems('noLinkedIncidents')}</p>}
      </div>
    </Card>
  );
}

export function ProblemTasksPanel({
  taskForm,
  setTaskForm,
  createTask,
  tasks,
  updateTaskStatus,
  removeTask,
  inputCls,
  selectCls,
  textareaCls,
}: {
  taskForm: TaskFormState;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  createTask: () => void;
  tasks: ProblemTask[];
  updateTaskStatus: (task: ProblemTask, status: ProblemTask['status']) => void;
  removeTask: (taskId: string) => void;
  inputCls: string;
  selectCls: string;
  textareaCls: string;
}) {
  const tProblems = useTranslations('pages.problems');
  const tActions = useTranslations('common.actions');
  const taskTypeLabel = (t: string) => tProblems(`taskTypes.${t}` as 'taskTypes.investigate');
  const taskStatusLabel = (s: string) => {
    const key = s === 'in_progress' ? 'inProgress' : s;
    return tProblems(`taskStatuses.${key}` as 'taskStatuses.pending');
  };
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tProblems('problemTasks')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
        <input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder={tProblems('taskTitle')} className={inputCls} />
        <select value={taskForm.task_type} onChange={(e) => setTaskForm((p) => ({ ...p, task_type: e.target.value }))} className={selectCls}>
          {['investigate', 'analyze', 'test', 'document'].map((t) => <option key={t} value={t}>{taskTypeLabel(t)}</option>)}
        </select>
        <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} placeholder={tProblems('descriptionOptional')} className={`${textareaCls} md:col-span-2`} rows={2} />
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={createTask} disabled={!taskForm.title.trim()}>{tProblems('addTask')}</Button>
        </div>
      </div>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{t.title}</p>
              <p className="text-xs text-gray-500">{taskTypeLabel(t.task_type || 'investigate')} · {t.assigned_to_name || tProblems('unassigned')}</p>
            </div>
            <select value={t.status} onChange={(e) => updateTaskStatus(t, e.target.value as ProblemTask['status'])} className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white">
              {['pending', 'in_progress', 'blocked', 'completed'].map((s) => <option key={s} value={s}>{taskStatusLabel(s)}</option>)}
            </select>
            <Button variant="ghost" size="sm" onClick={() => removeTask(t.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">{tActions('delete')}</Button>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{tProblems('noTasks')}</p>}
      </div>
    </Card>
  );
}

export function ProblemKnownErrorsPanel({
  keForm,
  setKeForm,
  createKnownError,
  knownErrors,
  toggleKnownError,
  inputCls,
  selectCls,
  textareaCls,
}: {
  keForm: KnownErrorFormState;
  setKeForm: Dispatch<SetStateAction<KnownErrorFormState>>;
  createKnownError: () => void;
  knownErrors: KnownError[];
  toggleKnownError: (ke: KnownError) => void;
  inputCls: string;
  selectCls: string;
  textareaCls: string;
}) {
  const tProblems = useTranslations('pages.problems');
  const tStates = useTranslations('common.states');
  const statusLabel = useStatusLabel();
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tProblems('knownErrorsTitle')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
        <input value={keForm.title} onChange={(e) => setKeForm((p) => ({ ...p, title: e.target.value }))} placeholder={tProblems('knownErrorTitle')} className={inputCls} />
        <input value={keForm.tags} onChange={(e) => setKeForm((p) => ({ ...p, tags: e.target.value }))} placeholder={tProblems('tagsPlaceholder')} className={inputCls} />
        <textarea value={keForm.symptoms} onChange={(e) => setKeForm((p) => ({ ...p, symptoms: e.target.value }))} placeholder={tProblems('symptoms')} className={textareaCls} rows={2} />
        <textarea value={keForm.workaround} onChange={(e) => setKeForm((p) => ({ ...p, workaround: e.target.value }))} placeholder={tProblems('workaround')} className={textareaCls} rows={2} />
        <div className="flex items-center gap-2">
          <select value={keForm.severity} onChange={(e) => setKeForm((p) => ({ ...p, severity: e.target.value }))} className={selectCls}>
            {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <input type="date" value={keForm.permanent_fix_eta} onChange={(e) => setKeForm((p) => ({ ...p, permanent_fix_eta: e.target.value }))} className={inputCls} />
        </div>
        <div className="flex justify-end">
          <Button onClick={createKnownError} disabled={!keForm.title.trim() || !keForm.symptoms.trim() || !keForm.workaround.trim()}>{tProblems('addKnownError')}</Button>
        </div>
      </div>
      <div className="space-y-2">
        {knownErrors.map((ke) => (
          <div key={ke.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{ke.title}</p>
              <p className="text-xs text-gray-500">{ke.severity || 'n/a'} · {ke.tags.join(', ') || tProblems('noTags')}</p>
            </div>
            <button
              onClick={() => toggleKnownError(ke)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${ke.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {ke.is_active ? tStates('active') : tStates('inactive')}
            </button>
          </div>
        ))}
        {knownErrors.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{tProblems('noKnownErrors')}</p>}
      </div>
    </Card>
  );
}
