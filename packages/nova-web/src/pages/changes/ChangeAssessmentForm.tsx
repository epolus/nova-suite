/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, SetStateAction } from 'react';
import type {
  Change,
  ChangeRiskQuestion,
  CI,
  Incident,
  Problem,
  ServiceListItem,
} from '@/api/client';
import Card from '../../components/Card';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import UserDateTimeInput from '../../components/UserDateTimeInput';
import { useFieldLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import type { ChangeFormState } from './useChangeDetail';

export function ChangeAssessmentForm({
  form,
  setForm,
  services,
  cis,
  incidentsList,
  problemsList,
  change,
  riskQuestions,
  riskScores,
  setRiskScores,
  riskScore,
  suggestedRiskLevel,
  inputCls,
  selectCls,
  textareaCls,
}: {
  form: ChangeFormState;
  setForm: Dispatch<SetStateAction<ChangeFormState>>;
  services: ServiceListItem[];
  cis: CI[];
  incidentsList: Incident[];
  problemsList: Problem[];
  change: Change | null;
  riskQuestions: ChangeRiskQuestion[];
  riskScores: Record<string, number>;
  setRiskScores: Dispatch<SetStateAction<Record<string, number>>>;
  riskScore: number | null;
  suggestedRiskLevel: Change['risk_level'] | null;
  inputCls: string;
  selectCls: string;
  textareaCls: string;
}) {
  const tChanges = useTranslations('pages.changes');
  const tStates = useTranslations('common.states');
  const fieldLabel = useFieldLabel();

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Left pane */}
      <div className="space-y-6">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tChanges('scheduling')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('scheduledStart')}</label>
              <UserDateTimeInput
                value={form.scheduled_start}
                onChange={(v) => setForm((p) => ({ ...p, scheduled_start: v }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('scheduledEnd')}</label>
              <UserDateTimeInput
                value={form.scheduled_end}
                onChange={(v) => setForm((p) => ({ ...p, scheduled_end: v }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('maintenanceWindow')}</label>
              <input value={form.maintenance_window} onChange={(e) => setForm((p) => ({ ...p, maintenance_window: e.target.value }))} className={inputCls} placeholder={tChanges('maintenanceWindowPlaceholder')} />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-500 cursor-pointer">
                <input type="checkbox" checked={form.downtime_required} onChange={(e) => setForm((p) => ({ ...p, downtime_required: e.target.checked }))} className="rounded-sm" />
                {tChanges('downtimeRequired')}
              </label>
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">{tChanges('serviceCiContext')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('service')}</label>
              <SearchableDropdown<ServiceListItem>
                items={services}
                selectedId={form.service_id}
                onSelect={(id) => setForm((p) => ({ ...p, service_id: id }))}
                onClear={() => setForm((p) => ({ ...p, service_id: '' }))}
                getItemId={(s) => s.id}
                getDisplayText={(s) => s.name}
                fallbackDisplayText={change?.service_name || ''}
                placeholder={tChanges('searchService')}
                renderItem={(s) => s.name}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('configurationItem')}</label>
              <SearchableDropdown<CI>
                items={cis}
                selectedId={form.affected_cis[0] || ''}
                onSelect={(id) => setForm((p) => ({ ...p, affected_cis: [id] }))}
                onClear={() => setForm((p) => ({ ...p, affected_cis: [] }))}
                getItemId={(ci) => ci.id}
                getDisplayText={(ci) => ci.display_name || ci.name}
                placeholder={tChanges('searchCi')}
                renderItem={(ci) => ci.display_name || ci.name}
              />
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tChanges('relationships')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('relatedIncident')}</label>
              <select value={form.related_incident_id} onChange={(e) => setForm((p) => ({ ...p, related_incident_id: e.target.value }))} className={selectCls}>
                <option value="">{tStates('none')}</option>
                {incidentsList.map((i) => <option key={i.id} value={i.id}>{i.number} — {i.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('relatedProblem')}</label>
              <select value={form.related_problem_id} onChange={(e) => setForm((p) => ({ ...p, related_problem_id: e.target.value }))} className={selectCls}>
                <option value="">{tStates('none')}</option>
                {problemsList.map((p) => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('estimatedCost')}</label>
              <input type="number" value={form.estimated_cost} onChange={(e) => setForm((p) => ({ ...p, estimated_cost: e.target.value }))} className={inputCls} placeholder="0.00" />
            </div>
          </div>
        </Card>
      </div>

      {/* Center pane */}
      <div className="space-y-6 min-w-0">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tChanges('changeDetails')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('title')} <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} placeholder={tChanges('changeTitle')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('description')}</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={textareaCls} placeholder={tChanges('describeChange')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('reasonForChange')}</label>
              <textarea rows={3} value={form.reason_for_change} onChange={(e) => setForm((p) => ({ ...p, reason_for_change: e.target.value }))} className={textareaCls} placeholder={tChanges('reasonPlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('businessJustification')}</label>
              <textarea rows={2} value={form.business_justification} onChange={(e) => setForm((p) => ({ ...p, business_justification: e.target.value }))} className={textareaCls} placeholder={tChanges('businessJustificationPlaceholder')} />
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tChanges('plans')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('implementationPlan')}</label>
              <textarea rows={4} value={form.implementation_plan} onChange={(e) => setForm((p) => ({ ...p, implementation_plan: e.target.value }))} className={textareaCls} placeholder={tChanges('implementationPlanPlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('backoutPlan')}</label>
              <textarea rows={3} value={form.backout_plan} onChange={(e) => setForm((p) => ({ ...p, backout_plan: e.target.value }))} className={textareaCls} placeholder={tChanges('backoutPlanPlaceholder')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('testPlan')}</label>
              <textarea rows={2} value={form.test_plan} onChange={(e) => setForm((p) => ({ ...p, test_plan: e.target.value }))} className={textareaCls} placeholder={tChanges('testPlanPlaceholder')} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900">{tChanges('riskQuestionnaire')}</h3>
              <p className="text-xs text-gray-500 mt-1">{tChanges('riskQuestionnaireHint')}</p>
            </div>
            {(riskScore != null || suggestedRiskLevel) && (
              <div className="text-right shrink-0">
                {riskScore != null && (
                  <p className="text-sm font-medium text-gray-900">{tChanges('riskScore', { score: riskScore })}</p>
                )}
                {suggestedRiskLevel && (
                  <p className="text-xs text-gray-600 capitalize mt-0.5">
                    {tChanges('suggestedRisk', {
                      level: tChanges(`riskLevels.${suggestedRiskLevel === 'very_high' ? 'veryHigh' : suggestedRiskLevel}` as 'riskLevels.low'),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
          {riskQuestions.length === 0 ? (
            <p className="text-sm text-gray-500">{tChanges('noRiskQuestions')}</p>
          ) : (
            <div className="space-y-3">
              {riskQuestions.map((q) => (
                <div key={q.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm text-gray-800">{q.prompt}</p>
                    <span className="text-[11px] text-gray-400 shrink-0">{tChanges('riskWeight', { weight: Number(q.weight) })}</span>
                  </div>
                  <select
                    value={riskScores[q.id] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? undefined : Number(e.target.value);
                      setRiskScores((prev) => {
                        const next = { ...prev };
                        if (value === undefined || Number.isNaN(value)) delete next[q.id];
                        else next[q.id] = value;
                        return next;
                      });
                    }}
                    className={selectCls}
                  >
                    <option value="">{tChanges('selectScore')}</option>
                    {[0, 1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>{score}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
