/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changes } from '@/api/client';
import type { Change } from '@/api/client';
import { useChangeDetail } from './useChangeDetail';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../utils/dateTime';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { ChangeAssessmentForm } from './ChangeAssessmentForm';
import {
  ChangeApprovalsPanel,
  ChangePlanningPanel,
  ChangeImplementationPanel,
  ChangeReviewPanel,
} from './ChangeDetailPanels';

function hasInvalidScheduleRange(start: string, end: string): boolean {
  if (!start || !end) return false;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return endMs < startMs;
}

export default function ChangeDetailPage() {
  const navigate = useNavigate();
  const tChanges = useTranslations('pages.changes');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();
  const {
    id,
    isNew,
    listParams,
    loading,
    saving,
    setSaving,
    error,
    setError,
    change,
    form,
    setForm,
    types,
    templates,
    templateOptions,
    groups,
    services,
    cis,
    incidentsList,
    problemsList,
    approvals,
    conflicts,
    prevId,
    nextId,
    goTo,
    reload,
  } = useChangeDetail();

  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'planning' | 'implementation' | 'review'>('overview');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId);
      if (e.key === 'ArrowRight' && nextId) goTo(nextId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, goTo]);

  const hasRequiredFields =
    !!form.change_type_id &&
    !!form.title.trim() &&
    !!form.assignment_group_id;

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setForm((p) => ({
      ...p,
      standard_change_id: tpl.id,
      category: tpl.category || p.category,
      implementation_plan: tpl.implementation_plan_template || p.implementation_plan,
      backout_plan: tpl.backout_plan_template || p.backout_plan,
      test_plan: tpl.test_plan_template || p.test_plan,
      risk_level: tpl.pre_assessed_risk,
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    if (!form.assignment_group_id) {
      setError(tChanges('assignmentGroupRequired'));
      setSaving(false);
      return;
    }
    if (hasInvalidScheduleRange(form.scheduled_start, form.scheduled_end)) {
      setError(tChanges('invalidScheduleRange'));
      setSaving(false);
      return;
    }
    try {
      const payload = {
        change_type_id: form.change_type_id,
        standard_change_id: form.standard_change_id || null,
        category: form.category || undefined,
        title: form.title,
        description: form.description,
        reason_for_change: form.reason_for_change,
        risk_level: form.risk_level,
        impact: form.impact,
        impact_description: form.impact_description || undefined,
        implementation_plan: form.implementation_plan,
        backout_plan: form.backout_plan,
        test_plan: form.test_plan || undefined,
        assigned_to: form.assigned_to || null,
        assignment_group_id: form.assignment_group_id,
        service_id: form.service_id || null,
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
        maintenance_window: form.maintenance_window || undefined,
        downtime_required: form.downtime_required,
        related_problem_id: form.related_problem_id || null,
        related_incident_id: form.related_incident_id || null,
        priority: form.priority,
        business_justification: form.business_justification || undefined,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
        review_notes: form.review_notes || undefined,
        affected_cis: form.affected_cis,
      };
      if (isNew || !id) {
        const created = await changes.create(payload);
        navigate(`/changes/${created.id}`, { state: { listParams }, replace: true });
      } else {
        await changes.update(id, payload);
        await reload();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tChanges('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const runTransition = async (action: string) => {
    if (!id || isNew) return;
    if ((action === 'schedule' || action === 'request_approval' || action === 'approve')
      && hasInvalidScheduleRange(form.scheduled_start, form.scheduled_end)) {
      setError(tChanges('invalidScheduleRange'));
      return;
    }
    try {
      await changes.transition(id, {
        action,
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      });
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tChanges('transitionFailed'));
    }
  };

  const decideApproval = async (approvalId: string, decision: 'approved' | 'rejected' | 'waived') => {
    if (!id || isNew) return;
    try {
      await changes.decideApproval(id, approvalId, decision);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : tChanges('approvalDecisionFailed'));
    }
  };

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = `${inputCls} bg-white`;
  const textareaCls = `${inputCls} resize-none`;
  const pageTitle = isNew
    ? tChanges('newChange')
    : change?.number
      ? `${change.number} — ${form.title || change.title || ''}`.trim()
      : form.title || tChanges('title');

  const tabs = [
    { key: 'overview' as const, label: tChanges('tabs.assessment') },
    { key: 'approvals' as const, label: `${tChanges('tabs.approvals')}${approvals.length ? ` (${approvals.length})` : ''}` },
    { key: 'planning' as const, label: tChanges('tabs.planning') },
    { key: 'implementation' as const, label: tChanges('tabs.implementation') },
    { key: 'review' as const, label: tChanges('tabs.review') },
  ];
  const allowedActions = !isNew ? (change?.allowed_actions || []) : [];
  const canRequestApprovalFromForm =
    !!form.implementation_plan.trim()
    && !!form.scheduled_start
    && !!form.scheduled_end
    && (form.affected_cis.length > 0 || !!form.service_id);
  const showAssessmentHint =
    !isNew
    && change?.status === 'assessment'
    && !allowedActions.includes('request_approval');
  const actionMeta: Record<string, { label: string; variant?: 'outline' | 'warning' }> = {
    submit_assessment: { label: tChanges('actions.submitAssessment'), variant: 'outline' },
    request_approval: { label: tChanges('actions.requestApproval'), variant: 'outline' },
    approve: { label: tActions('approve'), variant: 'outline' },
    reject: { label: tActions('reject'), variant: 'warning' },
    start_planning: { label: tChanges('actions.startPlanning'), variant: 'outline' },
    schedule: { label: tChanges('actions.schedule'), variant: 'outline' },
    start_implementation: { label: tChanges('actions.startImplementation'), variant: 'outline' },
    mark_implemented: { label: tChanges('actions.markImplemented'), variant: 'outline' },
    start_review: { label: tChanges('actions.startReview'), variant: 'outline' },
    close: { label: tChanges('actions.close'), variant: 'outline' },
    cancel: { label: tChanges('actions.cancel'), variant: 'warning' },
  };

  return (
    <>
      <PageHeader
        title={pageTitle}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || !hasRequiredFields}>
              {saving ? tActions('saving') : isNew ? tChanges('createChange') : tMaster('saveChanges')}
            </Button>
            {!isNew && allowedActions.map((action: string) => {
              const meta = actionMeta[action];
              if (!meta) return null;
              return (
                <Button
                  key={action}
                  variant={meta.variant || 'outline'}
                  size="sm"
                  onClick={() => runTransition(action)}
                >
                  {meta.label}
                </Button>
              );
            })}
            <Button variant="outline" size="icon" onClick={() => prevId && goTo(prevId)} disabled={!prevId} title={tMaster('previousEntity', { entity: tChanges('title') })}>&#8592;</Button>
            <Button variant="outline" size="icon" onClick={() => nextId && goTo(nextId)} disabled={!nextId} title={tMaster('nextEntity', { entity: tChanges('title') })}>&#8594;</Button>
            <Button variant="outline" onClick={() => navigate('/changes')}>{tChanges('backToList')}</Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>
      )}
      {showAssessmentHint && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <p className="font-medium mb-1">{tChanges('assessmentHintTitle')}</p>
          <p className="text-xs">{tChanges('assessmentHintBody')}</p>
          {canRequestApprovalFromForm && (
            <p className="text-xs mt-1 font-medium">{tChanges('assessmentHintReady')}</p>
          )}
        </div>
      )}

      {/* ── Summary ── */}
      <Card className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">{tChanges('summary')}</h3>
        {change && (
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 flex-wrap">
            <Badge value={change.status} />
            <Badge value={change.stage} />
            {change.change_type_name && <span className="text-sm text-gray-600">{change.change_type_name}</span>}
            <span className="text-xs text-gray-400 ml-auto">{tChanges('updatedAt', { time: formatDateTime(change.updated_at) })}</span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('changeType')} <span className="text-red-500">*</span></label>
            <select value={form.change_type_id} onChange={(e) => setForm((p) => ({ ...p, change_type_id: e.target.value, standard_change_id: '' }))} className={selectCls}>
              <option value="">{tChanges('selectType')}</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('standardTemplate')}</label>
            <select value={form.standard_change_id} onChange={(e) => applyTemplate(e.target.value)} className={selectCls}>
              <option value="">{tChanges('noTemplate')}</option>
              {templateOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{tChanges('risk')}</label>
            <select value={form.risk_level} onChange={(e) => setForm((p) => ({ ...p, risk_level: e.target.value as Change['risk_level'] }))} className={selectCls}>
              {['low', 'medium', 'high', 'very_high'].map((x) => <option key={x} value={x}>{tChanges(`riskLevels.${x === 'very_high' ? 'veryHigh' : x}` as 'riskLevels.low')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('priority')}</label>
            <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Change['priority'] }))} className={selectCls}>
              {['low', 'medium', 'high', 'critical'].map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('assignmentGroup')} <span className="text-red-500">*</span></label>
            <select value={form.assignment_group_id} onChange={(e) => setForm((p) => ({ ...p, assignment_group_id: e.target.value }))} className={selectCls}>
              <option value="">{tChanges('selectAssignmentGroup')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('category')}</label>
            <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className={inputCls} placeholder={fieldLabel('category')} />
          </div>
        </div>
      </Card>

      {/* ── Tab navigation (existing changes only) ── */}
      {!isNew && (
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Assessment / main form ── */}
      {(isNew || activeTab === 'overview') && (
        <ChangeAssessmentForm
          form={form}
          setForm={setForm}
          services={services}
          cis={cis}
          incidentsList={incidentsList}
          problemsList={problemsList}
          change={change}
          inputCls={inputCls}
          selectCls={selectCls}
          textareaCls={textareaCls}
        />
      )}

      {/* ── Approvals tab ── */}
      {!isNew && activeTab === 'approvals' && (
        <ChangeApprovalsPanel approvals={approvals} decideApproval={decideApproval} />
      )}

      {/* ── Planning tab ── */}
      {!isNew && activeTab === 'planning' && (
        <ChangePlanningPanel conflicts={conflicts} />
      )}

      {/* ── Implementation tab ── */}
      {!isNew && activeTab === 'implementation' && (
        <ChangeImplementationPanel form={form} setForm={setForm} textareaCls={textareaCls} />
      )}

      {/* ── Review tab ── */}
      {!isNew && activeTab === 'review' && (
        <ChangeReviewPanel form={form} setForm={setForm} textareaCls={textareaCls} />
      )}

    </>
  );
}
