/* SPDX-License-Identifier: AGPL-3.0-only */
import { type FormEvent } from 'react';
import type { JournalEntry } from '../../api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { formatDateTime } from '../../utils/dateTime';
import { useFieldLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { getInputCls, type IncidentDetailState } from './incidentDetailShared';

export function IncidentDetailsCard({ d }: { d: IncidentDetailState }) {
  const { inc, readonly, fields, setField } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  if (!inc) return null;
  const inputCls = getInputCls(readonly);
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('incidentDetails')}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('title')}</label>
          {readonly ? (
            <p className="text-sm font-medium text-gray-900">{inc.title}</p>
          ) : (
            <input type="text" value={fields.title} onChange={(e) => setField('title', e.target.value)} className={inputCls} />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('description')}</label>
          {readonly ? (
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{inc.description || tTable('emDash')}</p>
          ) : (
            <textarea value={fields.description} onChange={(e) => setField('description', e.target.value)} rows={4} className={`${inputCls} resize-none`} placeholder={tIncidents('describeIncident')} />
          )}
        </div>
        {(fields.status === 'resolved' || inc.status === 'resolved' || inc.resolution_notes) && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('resolutionNotes')}</label>
            {readonly ? (
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{inc.resolution_notes || tTable('emDash')}</p>
            ) : (
              <textarea value={fields.resolutionNotes} onChange={(e) => setField('resolutionNotes', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder={tIncidents('howResolved')} />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export function IncidentJournalCard({ d }: { d: IncidentDetailState }) {
  const {
    inc, user, isFulfiller, isClosed, journal, journalLoading,
    journalContent, setJournalContent, journalType, setJournalType, journalVisible, setJournalVisible,
    handleAddJournal,
  } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tStates = useTranslations('common.states');
  if (!inc) return null;
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('activityJournal')}</h3>
      {(isFulfiller || inc.caller_id === user?.id) && !isClosed && (
        <JournalForm
          content={journalContent}
          type={journalType}
          visible={journalVisible}
          isFulfiller={isFulfiller}
          onSubmit={handleAddJournal}
          onContentChange={setJournalContent}
          onTypeChange={setJournalType}
          onVisibleChange={setJournalVisible}
        />
      )}
      <div className="space-y-3 divide-y divide-gray-50">
        {journalLoading ? (
          <p className="text-sm text-gray-500 text-center py-4">{tStates('loading')}</p>
        ) : (
          (isFulfiller ? journal : journal.filter((e) => e.is_customer_visible)).map((entry) => (
            <JournalEntryRow key={entry.id} entry={entry} isFulfiller={isFulfiller} />
          ))
        )}
        {!journalLoading && journal.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">{tIncidents('noActivity')}</p>
        )}
      </div>
    </Card>
  );
}

function JournalForm({
  content, type, visible, isFulfiller, onSubmit, onContentChange, onTypeChange, onVisibleChange,
}: {
  content: string;
  type: string;
  visible: boolean;
  isFulfiller: boolean;
  onSubmit: (e: FormEvent) => void;
  onContentChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onVisibleChange: (v: boolean) => void;
}) {
  const tIncidents = useTranslations('pages.incidents');
  return (
    <form onSubmit={onSubmit} className="mb-4">
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        placeholder={isFulfiller ? tIncidents('journalForm.addCommentWorkNote') : tIncidents('journalForm.addComment')}
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
      />
      <div className="flex items-center gap-3 mt-2">
        {isFulfiller ? (
          <>
            <select value={type} onChange={(e) => onTypeChange(e.target.value)} className="px-2 py-1 border border-gray-200 rounded text-xs">
              <option value="comment">{tIncidents('journalForm.comment')}</option>
              <option value="work_note">{tIncidents('journalForm.workNote')}</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={visible} onChange={(e) => onVisibleChange(e.target.checked)} className="rounded" />
              {tIncidents('journalForm.customerVisible')}
            </label>
          </>
        ) : (
          <span className="text-xs text-gray-400">{tIncidents('journalForm.comment')}</span>
        )}
        <button type="submit" disabled={!content.trim()} className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-40">{tIncidents('journalForm.post')}</button>
      </div>
    </form>
  );
}

function JournalEntryRow({ entry, isFulfiller }: { entry: JournalEntry; isFulfiller: boolean }) {
  const tIncidents = useTranslations('pages.incidents');
  return (
    <div className="pt-3 first:pt-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-gray-900">{entry.author_name}</span>
        <Badge value={entry.entry_type} />
        {isFulfiller && !entry.is_customer_visible && (
          <span className="text-xs text-orange-500 font-medium">{tIncidents('journalForm.internal')}</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{formatDateTime(entry.created_at)}</span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
    </div>
  );
}
