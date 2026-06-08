/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { changes, cmdb, incidents, problems } from '@/api/client';
import type {
  AssignmentGroupItem,
  Change,
  ChangeApproval,
  ChangeConflict,
  ChangeDetail,
  ChangeType,
  CI,
  Incident,
  Problem,
  ServiceListItem,
  StandardChangeTemplate,
} from '@/api/client';
import { useChange, useInvalidateChanges } from '@/hooks/queries';

export type ChangeFormState = {
  change_type_id: string;
  standard_change_id: string;
  category: string;
  title: string;
  description: string;
  reason_for_change: string;
  risk_level: Change['risk_level'];
  impact: string;
  impact_description: string;
  implementation_plan: string;
  backout_plan: string;
  test_plan: string;
  assigned_to: string;
  assignment_group_id: string;
  service_id: string;
  scheduled_start: string;
  scheduled_end: string;
  maintenance_window: string;
  downtime_required: boolean;
  related_problem_id: string;
  related_incident_id: string;
  priority: Change['priority'];
  business_justification: string;
  estimated_cost: string;
  review_notes: string;
  affected_cis: string[];
};

export const EMPTY_CHANGE_FORM: ChangeFormState = {
  change_type_id: '',
  standard_change_id: '',
  category: '',
  title: '',
  description: '',
  reason_for_change: '',
  risk_level: 'medium',
  impact: 'medium',
  impact_description: '',
  implementation_plan: '',
  backout_plan: '',
  test_plan: '',
  assigned_to: '',
  assignment_group_id: '',
  service_id: '',
  scheduled_start: '',
  scheduled_end: '',
  maintenance_window: '',
  downtime_required: false,
  related_problem_id: '',
  related_incident_id: '',
  priority: 'medium',
  business_justification: '',
  estimated_cost: '',
  review_notes: '',
  affected_cis: [],
};

function formFromDetail(detail: ChangeDetail): ChangeFormState {
  return {
    change_type_id: detail.change_type_id,
    standard_change_id: detail.standard_change_id || '',
    category: detail.category || '',
    title: detail.title,
    description: detail.description,
    reason_for_change: detail.reason_for_change,
    risk_level: detail.risk_level,
    impact: detail.impact,
    impact_description: detail.impact_description || '',
    implementation_plan: detail.implementation_plan,
    backout_plan: detail.backout_plan,
    test_plan: detail.test_plan || '',
    assigned_to: detail.assigned_to || '',
    assignment_group_id: detail.assignment_group_id || '',
    service_id: detail.service_id || '',
    scheduled_start: detail.scheduled_start ? detail.scheduled_start.slice(0, 16) : '',
    scheduled_end: detail.scheduled_end ? detail.scheduled_end.slice(0, 16) : '',
    maintenance_window: detail.maintenance_window || '',
    downtime_required: detail.downtime_required,
    related_problem_id: detail.related_problem_id || '',
    related_incident_id: detail.related_incident_id || '',
    priority: detail.priority,
    business_justification: detail.business_justification || '',
    estimated_cost: detail.estimated_cost != null ? String(detail.estimated_cost) : '',
    review_notes: detail.review_notes || '',
    affected_cis: (detail.affected_cis || []).map((x) => x.ci_id),
  };
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
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const { data: change, isLoading: changeLoading, refetch: refetchChange } = useChange(isNew ? undefined : id);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setError('');
    try {
      const [typesRes, templatesRes, groupsRes, servicesRes, ciRes, incRes, prbRes] = await Promise.all([
        changes.types(),
        changes.standardTemplates(),
        changes.assignmentGroups(),
        incidents.services(),
        cmdb.items({ status: 'active' }, 1, 100),
        incidents.list({ status: 'new' }, 1, 100),
        problems.list({}, 1, 100),
      ]);
      setTypes(typesRes.change_types);
      setTemplates(templatesRes.templates);
      setGroups(groupsRes.assignment_groups);
      setServices(servicesRes.services);
      setCis(ciRes.items);
      setIncidentsList(incRes.incidents);
      setProblemsList(prbRes.problems);

      if (isNew) {
        setForm({ ...EMPTY_CHANGE_FORM, change_type_id: typesRes.change_types[0]?.id || '' });
        setApprovals([]);
        setConflicts([]);
        setPrevId(null);
        setNextId(null);
      } else if (id) {
        const [navRes, conflictRes] = await Promise.all([
          changes.nav(id, listParams),
          changes.conflicts(id),
        ]);
        setConflicts(conflictRes.conflicts || []);
        setPrevId(navRes.prev_id);
        setNextId(navRes.next_id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load change');
    } finally {
      setMetaLoading(false);
    }
  }, [id, isNew, listParams]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!change) return;
    setForm(formFromDetail(change));
    setApprovals(change.approvals || []);
    setConflicts(change.conflicts || []);
  }, [change]);

  const loading = changeLoading || metaLoading;

  const goTo = useCallback(
    (targetId: string) => {
      navigate(`/changes/${targetId}`, { state: { listParams }, replace: true });
    },
    [navigate, listParams],
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
    prevId,
    nextId,
    goTo,
    reload,
  };
}
