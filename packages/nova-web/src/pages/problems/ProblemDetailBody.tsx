/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, DragEvent, RefObject, SetStateAction } from 'react';
import { useTranslations } from 'use-intl';
import { attachments as attachmentsApi } from '@/api/client';
import type { Attachment, KnownError, Problem, ProblemIncidentLink, ProblemTask } from '@/api/client';
import Card from '../../components/Card';
import { AttachmentCard } from '../../components/AttachmentCard';
import { useFieldLabel } from '@/i18n/hooks';
import {
  ProblemIncidentsPanel,
  ProblemKnownErrorsPanel,
  ProblemTasksPanel,
  type KbArticleSearchResult,
  type KnownErrorFormState,
  type TaskFormState,
} from './ProblemDetailTabs';
import type { ProblemFormState } from './useProblemDetail';
import { ImprovementSourceLink } from '../../components/ImprovementSourceLink';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProblemDetailBody({
  problem,
  form,
  setForm,
  inputCls,
  selectCls,
  textareaCls,
  isNew,
  id,
  fileAttachments,
  uploading,
  dragOver,
  fileInputRef,
  previewUrl,
  previewName,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onPreview,
  onDeleteAttachment,
  onClosePreview,
  activeTab,
  setActiveTab,
  linkedIncidents,
  incidentSearch,
  setIncidentSearch,
  incidentResults,
  linkIncident,
  unlinkIncident,
  taskForm,
  setTaskForm,
  createTask,
  tasks,
  updateTaskStatus,
  removeTask,
  keForm,
  setKeForm,
  createKnownError,
  knownErrors,
  toggleKnownError,
  kbSearch,
  setKbSearch,
  kbResults,
  selectKbArticle,
  clearKbArticle,
  linkKbArticle,
  unlinkKbArticle,
  linkingKeId,
  setLinkingKeId,
  linkKbSearch,
  setLinkKbSearch,
  linkKbResults,
}: {
  problem: Problem | null | undefined;
  form: ProblemFormState;
  setForm: Dispatch<SetStateAction<ProblemFormState>>;
  inputCls: string;
  selectCls: string;
  textareaCls: string;
  isNew: boolean;
  id: string | undefined;
  fileAttachments: Attachment[];
  uploading: boolean;
  dragOver: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  previewUrl: string | null;
  previewName: string;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onFileChange: (files: File[]) => void;
  onPreview: (att: Attachment) => void;
  onDeleteAttachment: (attId: string) => void;
  onClosePreview: () => void;
  activeTab: 'incidents' | 'tasks' | 'known_errors';
  setActiveTab: (tab: 'incidents' | 'tasks' | 'known_errors') => void;
  linkedIncidents: ProblemIncidentLink[];
  incidentSearch: string;
  setIncidentSearch: Dispatch<SetStateAction<string>>;
  incidentResults: Array<{ id: string; number: string; title: string; status: string }>;
  linkIncident: (incidentId: string) => void;
  unlinkIncident: (incidentId: string) => void;
  taskForm: TaskFormState;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  createTask: () => void;
  tasks: ProblemTask[];
  updateTaskStatus: (task: ProblemTask, status: ProblemTask['status']) => void;
  removeTask: (taskId: string) => void;
  keForm: KnownErrorFormState;
  setKeForm: Dispatch<SetStateAction<KnownErrorFormState>>;
  createKnownError: () => void;
  knownErrors: KnownError[];
  toggleKnownError: (ke: KnownError) => void;
  kbSearch: string;
  setKbSearch: Dispatch<SetStateAction<string>>;
  kbResults: KbArticleSearchResult[];
  selectKbArticle: (article: KbArticleSearchResult) => void;
  clearKbArticle: () => void;
  linkKbArticle: (ke: KnownError, articleId: string) => void;
  unlinkKbArticle: (ke: KnownError) => void;
  linkingKeId: string | null;
  setLinkingKeId: Dispatch<SetStateAction<string | null>>;
  linkKbSearch: string;
  setLinkKbSearch: Dispatch<SetStateAction<string>>;
  linkKbResults: KbArticleSearchResult[];
}) {
  const tProblems = useTranslations('pages.problems');
  const fieldLabel = useFieldLabel();

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
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
          {problem?.id && problem.permanent_fix?.trim() && (
            <div className="mt-3">
              <ImprovementSourceLink sourceType="problem" sourceId={problem.id} canRegister />
            </div>
          )}
        </Card>
      </div>

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

        {!isNew && id && (
          <AttachmentCard
            attachments={fileAttachments}
            uploading={uploading}
            dragOver={dragOver}
            fileInputRef={fileInputRef}
            previewUrl={previewUrl}
            previewName={previewName}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClickZone={() => fileInputRef.current?.click()}
            onFileChange={onFileChange}
            onPreview={onPreview}
            onDownload={(a) => attachmentsApi.download(a.id, a.file_name)}
            onDelete={onDeleteAttachment}
            onClosePreview={onClosePreview}
            formatSize={formatSize}
          />
        )}

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
                inputCls={inputCls}
                selectCls={selectCls}
                textareaCls={textareaCls}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
