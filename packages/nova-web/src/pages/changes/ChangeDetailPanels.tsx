/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, SetStateAction } from 'react';
import type { ChangeApproval, ChangeConflict } from '@/api/client';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { Button } from '../../components/ui/button';
import { useTranslations } from 'use-intl';
import type { ChangeFormState } from './changeFormState';
import { ImprovementSourceLink } from '../../components/ImprovementSourceLink';

export function ChangeApprovalsPanel({
  approvals,
  decideApproval,
}: {
  approvals: ChangeApproval[];
  decideApproval: (approvalId: string, decision: 'approved' | 'rejected' | 'waived') => void;
}) {
  const tChanges = useTranslations('pages.changes');
  const tActions = useTranslations('common.actions');
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tChanges('tabs.approvals')}</h3>
      <div className="space-y-3">
        {approvals.map((a) => (
          <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 capitalize">{tChanges('approvalType', { type: a.approval_type })}</p>
              <p className="text-xs text-gray-500">{a.approver_name || a.approver_group_name || tChanges('unassignedApprover')}</p>
            </div>
            <Badge value={a.status} />
            {a.status === 'pending' && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => decideApproval(a.id, 'approved')} className="bg-green-600 hover:bg-green-500 text-white">{tActions('approve')}</Button>
                <Button size="sm" variant="warning" onClick={() => decideApproval(a.id, 'rejected')}>{tActions('reject')}</Button>
                <Button size="sm" variant="outline" onClick={() => decideApproval(a.id, 'waived')}>{tChanges('waive')}</Button>
              </div>
            )}
          </div>
        ))}
        {approvals.length === 0 && <p className="text-sm text-gray-400 text-center py-4">{tChanges('noApprovalRecords')}</p>}
      </div>
    </Card>
  );
}

export function ChangePlanningPanel({ conflicts }: { conflicts: ChangeConflict[] }) {
  const tChanges = useTranslations('pages.changes');
  const dependencyCount = conflicts.filter((c) => c.conflict_type === 'dependency_conflict').length;
  const typeLabel = (type: ChangeConflict['conflict_type']) => {
    const labels: Record<ChangeConflict['conflict_type'], string> = {
      dependency_conflict: tChanges('conflictTypes.dependencyConflict'),
      ci_overlap: tChanges('conflictTypes.ciOverlap'),
      blackout_window: tChanges('conflictTypes.blackoutWindow'),
      schedule_overlap: tChanges('conflictTypes.scheduleOverlap'),
    };
    return labels[type] || type;
  };
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tChanges('conflictsScheduling')}</h3>
      {dependencyCount > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {tChanges('dependencyConflictSummary', { count: dependencyCount })}
        </p>
      )}
      <div className="space-y-2">
        {conflicts.map((c) => (
          <div key={c.id} className={`p-3 rounded-lg border ${c.severity === 'blocking' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className="text-sm font-medium">{typeLabel(c.conflict_type)}</p>
            <p className="text-xs text-gray-600 mt-0.5">{c.details || tChanges('conflictDetected')}</p>
            {c.conflicting_change_number && (
              <p className="text-xs text-gray-500 mt-1">
                {c.conflicting_change_number}
                {c.conflicting_change_title ? ` — ${c.conflicting_change_title}` : ''}
              </p>
            )}
          </div>
        ))}
        {conflicts.length === 0 && <p className="text-sm text-gray-500 text-center py-4">{tChanges('noConflicts')}</p>}
      </div>
    </Card>
  );
}

export function ChangeImplementationPanel({
  form,
  setForm,
  textareaCls,
}: {
  form: ChangeFormState;
  setForm: Dispatch<SetStateAction<ChangeFormState>>;
  textareaCls: string;
}) {
  const tChanges = useTranslations('pages.changes');
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tChanges('implementationPlans')}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('implementationPlan')}</label>
          <textarea rows={5} value={form.implementation_plan} onChange={(e) => setForm((p) => ({ ...p, implementation_plan: e.target.value }))} className={textareaCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('backoutPlan')}</label>
          <textarea rows={4} value={form.backout_plan} onChange={(e) => setForm((p) => ({ ...p, backout_plan: e.target.value }))} className={textareaCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('testPlan')}</label>
          <textarea rows={3} value={form.test_plan} onChange={(e) => setForm((p) => ({ ...p, test_plan: e.target.value }))} className={textareaCls} />
        </div>
      </div>
    </Card>
  );
}

const FAILURE_CATEGORIES = ['incomplete', 'caused_incident', 'rolled_back', 'exceeded_window', 'other'] as const;

export function ChangeReviewPanel({
  form,
  setForm,
  inputCls,
  selectCls,
  textareaCls,
  changeId,
  savedUnsuccessful,
}: {
  form: ChangeFormState;
  setForm: Dispatch<SetStateAction<ChangeFormState>>;
  inputCls: string;
  selectCls: string;
  textareaCls: string;
  changeId?: string;
  savedUnsuccessful?: boolean;
}) {
  const tChanges = useTranslations('pages.changes');
  const failureLabel = (key: (typeof FAILURE_CATEGORIES)[number]) => {
    const labels: Record<(typeof FAILURE_CATEGORIES)[number], string> = {
      incomplete: tChanges('pirFailure.incomplete'),
      caused_incident: tChanges('pirFailure.causedIncident'),
      rolled_back: tChanges('pirFailure.rolledBack'),
      exceeded_window: tChanges('pirFailure.exceededWindow'),
      other: tChanges('pirFailure.other'),
    };
    return labels[key];
  };
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-1">{tChanges('postImplementationReview')}</h3>
      <p className="text-xs text-gray-500 mb-4">{tChanges('pirRequiredHint')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('pirOutcome')} <span className="text-red-500">*</span></label>
          <select
            value={form.success}
            onChange={(e) => setForm((p) => ({
              ...p,
              success: e.target.value as ChangeFormState['success'],
              failure_category: e.target.value === 'false' ? p.failure_category : '',
            }))}
            className={selectCls}
          >
            <option value="">{tChanges('pirSelectOutcome')}</option>
            <option value="true">{tChanges('pirSuccessful')}</option>
            <option value="false">{tChanges('pirUnsuccessful')}</option>
          </select>
        </div>
        {form.success === 'false' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('failureCategory')} <span className="text-red-500">*</span></label>
            <select
              value={form.failure_category}
              onChange={(e) => setForm((p) => ({ ...p, failure_category: e.target.value }))}
              className={selectCls}
            >
              <option value="">{tChanges('pirSelectFailure')}</option>
              {FAILURE_CATEGORIES.map((key) => (
                <option key={key} value={key}>{failureLabel(key)}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('plannedDowntimeMinutes')} <span className="text-red-500">*</span></label>
          <input
            type="number"
            min={0}
            value={form.planned_downtime_minutes}
            onChange={(e) => setForm((p) => ({ ...p, planned_downtime_minutes: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('actualDowntimeMinutes')} <span className="text-red-500">*</span></label>
          <input
            type="number"
            min={0}
            value={form.actual_downtime_minutes}
            onChange={(e) => setForm((p) => ({ ...p, actual_downtime_minutes: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('reviewNotesPir')}</label>
        <textarea rows={6} value={form.review_notes} onChange={(e) => setForm((p) => ({ ...p, review_notes: e.target.value }))} className={textareaCls} placeholder={tChanges('reviewNotesPlaceholder')} />
      </div>
      {changeId && savedUnsuccessful && (
        <div className="mt-4">
          <ImprovementSourceLink sourceType="change" sourceId={changeId} canRegister />
        </div>
      )}
    </Card>
  );
}
