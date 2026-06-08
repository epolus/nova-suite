/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { attachments as attachmentsApi, cmdb, problems as problemsApi } from '@/api/client';
import type { AssignmentGroupItem, Attachment, CI, KnownError, Problem, ProblemIncidentLink, ProblemTask } from '@/api/client';
import { useProblem, useInvalidateProblems } from '@/hooks/queries';

export const EMPTY_PROBLEM_FORM = {
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

export function useProblemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> })?.listParams || {},
    [location.state],
  );
  const isNew = id === 'new';
  const invalidateProblems = useInvalidateProblems();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_PROBLEM_FORM);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [ciItems, setCiItems] = useState<CI[]>([]);
  const [linkedIncidents, setLinkedIncidents] = useState<ProblemIncidentLink[]>([]);
  const [tasks, setTasks] = useState<ProblemTask[]>([]);
  const [knownErrors, setKnownErrors] = useState<KnownError[]>([]);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fileAttachments, setFileAttachments] = useState<Attachment[]>([]);
  const [refLoading, setRefLoading] = useState(true);

  const { data: problem, isLoading: problemLoading, refetch: refetchProblem } = useProblem(isNew ? undefined : id);

  const loadReferenceData = useCallback(async () => {
    setRefLoading(true);
    try {
      const [gRes, ciRes] = await Promise.all([
        problemsApi.assignmentGroups(),
        cmdb.items({ status: 'active' }, 1, 100),
      ]);
      setGroups(gRes.assignment_groups);
      setCiItems(ciRes.items);

      if (isNew) {
        setForm(EMPTY_PROBLEM_FORM);
        setLinkedIncidents([]);
        setTasks([]);
        setKnownErrors([]);
        setPrevId(null);
        setNextId(null);
        setFileAttachments([]);
      } else if (id) {
        const [lRes, tRes, keRes, navRes, aRes] = await Promise.all([
          problemsApi.linkedIncidents(id),
          problemsApi.tasks(id),
          problemsApi.knownErrors(id),
          problemsApi.nav(id, listParams),
          attachmentsApi.list('problem', id),
        ]);
        setLinkedIncidents(lRes.incidents);
        setTasks(tRes.tasks);
        setKnownErrors(keRes.known_errors);
        setPrevId(navRes.prev_id);
        setNextId(navRes.next_id);
        setFileAttachments(aRes.attachments);
      }
    } finally {
      setRefLoading(false);
    }
  }, [id, isNew, listParams]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (!problem) return;
    setForm({
      title: problem.title,
      description: problem.description || '',
      priority: problem.priority,
      impact: problem.impact,
      category: problem.category || '',
      status: problem.status,
      assignment_group_id: problem.assignment_group_id || '',
      affected_ci: problem.affected_ci || '',
      root_cause: problem.root_cause || '',
      symptoms: problem.symptoms || '',
      workaround: problem.workaround || '',
      permanent_fix: problem.permanent_fix || '',
      resolution_notes: problem.resolution_notes || '',
    });
  }, [problem]);

  const loading = problemLoading || refLoading;

  const goTo = useCallback(
    (targetId: string) => {
      navigate(`/problems/${targetId}`, { state: { listParams }, replace: true });
    },
    [navigate, listParams],
  );

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
        await refetchProblem();
        await loadReferenceData();
        invalidateProblems();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save problem');
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    await refetchProblem();
    await loadReferenceData();
  };

  return {
    id,
    isNew,
    listParams,
    loading,
    saving,
    error,
    setError,
    problem: problem ?? null,
    form,
    setForm,
    groups,
    ciItems,
    linkedIncidents,
    setLinkedIncidents,
    tasks,
    setTasks,
    knownErrors,
    setKnownErrors,
    prevId,
    nextId,
    fileAttachments,
    setFileAttachments,
    goTo,
    save,
    reload,
  };
}
