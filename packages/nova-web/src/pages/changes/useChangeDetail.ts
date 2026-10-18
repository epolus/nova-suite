/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLocation, useNavigate, useParams } from 'react-router';
import { changes, cmdb, incidents, problems } from '@/api/client';
import type {
  AssignmentGroupItem,
  Change,
  ChangeApproval,
  ChangeConflict,
  ChangeRiskQuestion,
  ChangeType,
  CI,
  Incident,
  Problem,
  ServiceListItem,
  StandardChangeTemplate,
} from '@/api/client';
import { useChange, useInvalidateChanges } from '@/hooks/queries';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { hasChangeFormChanges } from './changeDetailFields';
import { EMPTY_CHANGE_FORM, formFromDetail, type ChangeFormState } from './changeFormState';

const PIR_FAILURE_CATEGORIES = ['incomplete', 'caused_incident', 'rolled_back', 'exceeded_window', 'other'] as const;

function pirFailureCategory(value: string): (typeof PIR_FAILURE_CATEGORIES)[number] | null {
  return (PIR_FAILURE_CATEGORIES as readonly string[]).includes(value)
    ? value as (typeof PIR_FAILURE_CATEGORIES)[number]
    : null;
}

function hasInvalidScheduleRange(start: string, end: string): boolean {
  if (!start || !end) return false;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return endMs < startMs;
}

export function useChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> })?.listParams || {},
    [location.state],
  );
  const invalidateChanges = useInvalidateChanges();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ChangeFormState>(EMPTY_CHANGE_FORM);
  const [types, setTypes] = useState<ChangeType[]>([]);
  const [templates, setTemplates] = useState<StandardChangeTemplate[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [cis, setCis] = useState<CI[]>([]);
  const [incidentsList, setIncidentsList] = useState<Incident[]>([]);
  const [problemsList, setProblemsList] = useState<Problem[]>([]);
  const [approvals, setApprovals] = useState<ChangeApproval[]>([]);
  const [conflicts, setConflicts] = useState<ChangeConflict[]>([]);
  const [riskQuestions, setRiskQuestions] = useState<ChangeRiskQuestion[]>([]);
  const [riskScores, setRiskScores] = useState<Record<string, number>>({});
  const [riskScore, setRiskScore] = useState<number | null>(null);
  const [suggestedRiskLevel, setSuggestedRiskLevel] = useState<Change['risk_level'] | null>(null);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const { data: change, isLoading: changeLoading, refetch: refetchChange } = useChange(isNew ? undefined : id);

  const metaKey = `${id}|${isNew}|${JSON.stringify(listParams)}`;
  const [prevMetaKey, setPrevMetaKey] = useState(metaKey);
  if (metaKey !== prevMetaKey) {
    setPrevMetaKey(metaKey);
    setMetaLoading(true);
    setError('');
  }

  const [prevChange, setPrevChange] = useState(change);
  if (change !== prevChange) {
    setPrevChange(change);
    if (change) {
      setForm(formFromDetail(change));
      setApprovals(change.approvals || []);
      setConflicts(change.conflicts || []);
    }
  }

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setError('');
    try {
      const [typesRes, templatesRes, groupsRes, servicesRes, ciRes, incRes, prbRes, questionsRes] = await Promise.all([
        changes.types(),
        changes.standardTemplates(),
        changes.assignmentGroups(),
        incidents.services(),
        cmdb.items({ status: 'installed' }, 1, 100),
        incidents.list({ status: 'new' }, 1, 100),
        problems.list({}, 1, 100),
        changes.riskQuestions(false),
      ]);
      setTypes(typesRes.change_types);
      setTemplates(templatesRes.templates);
      setGroups(groupsRes.assignment_groups);
      setServices(servicesRes.services);
      setCis(ciRes.items);
      setIncidentsList(incRes.incidents);
      setProblemsList(prbRes.problems);
      setRiskQuestions(questionsRes.questions || []);

      if (isNew) {
        setForm({ ...EMPTY_CHANGE_FORM, change_type_id: typesRes.change_types[0]?.id || '' });
        setApprovals([]);
        setConflicts([]);
        setRiskScores({});
        setRiskScore(null);
        setSuggestedRiskLevel(null);
        setPrevId(null);
        setNextId(null);
      } else if (id) {
        const [navRes, conflictRes, riskRes] = await Promise.all([
          changes.nav(id, listParams),
          changes.conflicts(id),
          changes.riskAnswers(id),
        ]);
        setConflicts(conflictRes.conflicts || []);
        setPrevId(navRes.prev_id);
        setNextId(navRes.next_id);
        const nextScores: Record<string, number> = {};
        for (const a of riskRes.answers || []) {
          nextScores[a.question_id] = a.score;
        }
        setRiskScores(nextScores);
        setRiskScore(riskRes.risk_score);
        setSuggestedRiskLevel(riskRes.suggested_risk_level);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load change');
    } finally {
      setMetaLoading(false);
    }
  }, [id, isNew, listParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadMeta();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [loadMeta]);

  const loading = changeLoading || metaLoading;

  const isFormDirty = useMemo(
    () => hasChangeFormChanges(form, change ?? null, isNew),
    [form, change, isNew],
  );

  const saveRef = useRef<() => Promise<boolean>>(async () => false);

  const {
    dialogOpen: unsavedDialogOpen,
    saving: unsavedDialogSaving,
    guardNavigate,
    allowNextNavigation,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useUnsavedChangesGuard({
    isDirty: isFormDirty,
    onSave: useCallback(() => saveRef.current(), []),
  });

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError('');
    if (!form.assignment_group_id) {
      setError('Assignment group is required');
      setSaving(false);
      return false;
    }
    if (hasInvalidScheduleRange(form.scheduled_start, form.scheduled_end)) {
      setError('Scheduled end must be after scheduled start');
      setSaving(false);
      return false;
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
        success: form.success === '' ? null : form.success === 'true',
        failure_category: form.success === 'false' ? pirFailureCategory(form.failure_category) : null,
        planned_downtime_minutes: form.planned_downtime_minutes === '' ? null : Number(form.planned_downtime_minutes),
        actual_downtime_minutes: form.actual_downtime_minutes === '' ? null : Number(form.actual_downtime_minutes),
        affected_cis: form.affected_cis,
      };
      if (isNew || !id) {
        const created = await changes.create(payload);
        const answered = Object.entries(riskScores)
          .filter(([, score]) => Number.isFinite(score))
          .map(([question_id, score]) => ({ question_id, score }));
        if (answered.length > 0) {
          const riskRes = await changes.submitRiskAssessment(created.id, {
            answers: answered,
            apply_suggested_risk_level: true,
          });
          if (riskRes.risk_level) {
            await changes.update(created.id, { risk_level: riskRes.risk_level });
          }
        }
        allowNextNavigation();
        navigate(`/changes/${created.id}`, { state: { listParams }, replace: true });
      } else {
        await changes.update(id, payload);
        const answered = Object.entries(riskScores)
          .filter(([, score]) => Number.isFinite(score))
          .map(([question_id, score]) => ({ question_id, score }));
        if (answered.length > 0) {
          const riskRes = await changes.submitRiskAssessment(id, {
            answers: answered,
            apply_suggested_risk_level: true,
          });
          setRiskScore(riskRes.risk_score);
          setSuggestedRiskLevel(riskRes.suggested_risk_level);
          setForm((p) => ({ ...p, risk_level: riskRes.risk_level }));
        }
        await refetchChange();
        await loadMeta();
        invalidateChanges();
      }
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save change');
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    form,
    id,
    invalidateChanges,
    isNew,
    listParams,
    loadMeta,
    navigate,
    refetchChange,
    riskScores,
  ]);

  useEffect(() => {
    saveRef.current = save;
  });

  const goTo = useCallback(
    (targetId: string) => {
      guardNavigate(`/changes/${targetId}`, { state: { listParams }, replace: true });
    },
    [guardNavigate, listParams],
  );

  const templateOptions = useMemo(
    () => templates.filter((t) => t.change_type_id === form.change_type_id && t.is_active),
    [templates, form.change_type_id],
  );

  const reload = async () => {
    await refetchChange();
    await loadMeta();
    invalidateChanges();
  };

  return {
    id,
    isNew,
    listParams,
    loading,
    saving,
    setSaving,
    error,
    setError,
    change: change ?? null,
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
    setApprovals,
    conflicts,
    setConflicts,
    riskQuestions,
    riskScores,
    setRiskScores,
    riskScore,
    suggestedRiskLevel,
    prevId,
    nextId,
    goTo,
    reload,
    save,
    guardNavigate,
    unsavedDialogOpen,
    unsavedDialogSaving,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  };
}
