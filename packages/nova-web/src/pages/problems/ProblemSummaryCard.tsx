/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, SetStateAction } from 'react';
import type { AssignmentGroupItem, CI, Problem } from '@/api/client';
import Card from '../../components/Card';
import { formatDateTime } from '../../utils/dateTime';
import { useFieldLabel, useImpactUrgencyLabel, useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import type { EMPTY_PROBLEM_FORM } from './useProblemDetail';

type ProblemFormState = typeof EMPTY_PROBLEM_FORM;

export function ProblemSummaryCard({
  form,
  setForm,
  problem,
  groups,
  ciItems,
  inputCls,
  selectCls,
}: {
  form: ProblemFormState;
  setForm: Dispatch<SetStateAction<ProblemFormState>>;
  problem: Problem | null;
  groups: AssignmentGroupItem[];
  ciItems: CI[];
  inputCls: string;
  selectCls: string;
}) {
  const tProblems = useTranslations('pages.problems');
  const fieldLabel = useFieldLabel();
  const { impact: impactLabel } = useImpactUrgencyLabel();
  const statusLabel = useStatusLabel();

  const problemStatusLabel = (s: string) => {
    const key = s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as 'new' | 'investigating' | 'rootCauseIdentified' | 'fixInProgress' | 'resolved' | 'closed' | 'knownError';
    return tProblems(`statuses.${key}` as 'statuses.new');
  };

  return (
    <Card className="mb-6">
      <h3 className="font-semibold text-gray-900 mb-4">{tProblems('summary')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('status')}</label>
          <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Problem['status'] }))} className={selectCls}>
            {['new', 'investigating', 'root_cause_identified', 'fix_in_progress', 'resolved', 'closed', 'known_error'].map((s) => (
              <option key={s} value={s}>{problemStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('priority')}</label>
          <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Problem['priority'] }))} className={selectCls}>
            {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('impact')}</label>
          <select value={form.impact} onChange={(e) => setForm((p) => ({ ...p, impact: e.target.value as Problem['impact'] }))} className={selectCls}>
            {['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{impactLabel(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('category')}</label>
          <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className={inputCls} placeholder={fieldLabel('category')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {fieldLabel('assignmentGroup')} <span className="text-red-500">*</span>
          </label>
          <select value={form.assignment_group_id} onChange={(e) => setForm((p) => ({ ...p, assignment_group_id: e.target.value }))} className={selectCls}>
            <option value="">{tProblems('selectAssignmentGroup')}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tProblems('affectedCi')}</label>
          <select value={form.affected_ci} onChange={(e) => setForm((p) => ({ ...p, affected_ci: e.target.value }))} className={selectCls}>
            <option value="">{tProblems('noCi')}</option>
            {ciItems.map((ci) => <option key={ci.id} value={ci.id}>{ci.display_name || ci.name}</option>)}
          </select>
        </div>
        {problem && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tProblems('reportedBy')}</label>
              <p className="text-sm text-gray-900 mt-0.5">{problem.reported_by_name || '—'}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tProblems('lastUpdated')}</label>
              <p className="text-sm text-gray-900 mt-0.5">{formatDateTime(problem.updated_at)}</p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
