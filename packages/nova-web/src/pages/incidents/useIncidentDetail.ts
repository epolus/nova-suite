/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  incidents as incidentsApi,
  admin as adminApi,
  auth as authApi,
  attachments as attachmentsApi,
  knowledge as knowledgeApi,
  cmdb as cmdbApi,
  problems as problemsApi,
} from '../../api/client';
import type {
  Incident,
  JournalEntry,
  AssignmentGroupItem,
  Attachment,
  ServiceListItem,
  UserListItem,
  CI,
  Problem,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isFulfillerRole } from '../../utils/roles';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import {
  EMPTY_FIELDS,
  SIDEBAR_STORAGE_KEY,
  buildFieldsFromIncident,
  buildIncidentUpdates,
} from './incidentDetailFields';
import { useIncidentAttachments } from './useIncidentAttachments';
import { useIncidentSidebar } from './useIncidentSidebar';

export function useIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> })?.listParams || {},
    [location.state],
  );

  // Core data
  const [inc, setInc] = useState<Incident | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  // Reference data (fulfiller only)
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroupItem[]>([]);
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [ciOptions, setCiOptions] = useState<CI[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [problemOptions, setProblemOptions] = useState<Problem[]>([]);
  const [linkedProblemIds, setLinkedProblemIds] = useState<string[]>([]);

  // Edit fields — all grouped
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const setField = <K extends keyof typeof EMPTY_FIELDS>(key: K, val: string) =>
    setFields((prev) => ({ ...prev, [key]: val }));

  // UI state
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [intelligenceOpen, setIntelligenceOpen] = useUserPreferenceState<boolean>(
    'ui:incident_detail_intelligence_sidebar_open',
    true,
    SIDEBAR_STORAGE_KEY,
  );

  // Attachments
  const {
    fileAttachments,
    setFileAttachments,
    uploading,
    dragOver,
    setDragOver,
    fileInputRef,
    previewUrl,
    previewName,
    closePreview,
    handleFileUpload,
    handleDrop,
    handleDeleteAttachment,
    handlePreview,
    formatSize,
  } = useIncidentAttachments(id);

  // Journal
  const [journalContent, setJournalContent] = useState('');
  const [journalType, setJournalType] = useState('comment');
  const [journalVisible, setJournalVisible] = useState(true);

  // Intelligence sidebar
  const { similarIncidents, kbSuggestions, loadingSidebar, sidebarError } = useIncidentSidebar(
    id,
    intelligenceOpen,
  );

  // Resolve with KB modal
  const [kbResolveOpen, setKbResolveOpen] = useState(false);

  // Derived permissions
  const isFulfiller = isFulfillerRole(user?.roles);
  const isClosed = inc?.status === 'closed' || inc?.status === 'cancelled';
  const isResolved = inc?.status === 'resolved';
  const isCaller = inc?.caller_id === user?.id;
  const readonly = isClosed || !isFulfiller;

  // ─── Helpers ───

  const syncFields = (i: Incident) => {
    setFields(buildFieldsFromIncident(i));
  };

  const refresh = useCallback(async () => {
    if (!id) return;
    const [full, jRes, linkedProblemsRes] = await Promise.all([
      incidentsApi.get(id),
      incidentsApi.journal(id),
      incidentsApi.linkedProblems(id).catch(() => ({ problems: [] })),
    ]);
    setInc(full);
    syncFields(full);
    setJournal(jRes.entries);
    const linkedIds = linkedProblemsRes.problems.map((p) => p.problem_id);
    setLinkedProblemIds(linkedIds);
    setField('relatedProblemId', linkedIds[0] || '');
  }, [id]);

  const withSave = async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  };

  // ─── Data loading ───

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const basePromises: [
      Promise<Incident>,
      Promise<{ entries: JournalEntry[] }>,
      Promise<{ prev_id: string | null; next_id: string | null }>,
      Promise<{ attachments: Attachment[] }>,
    ] = [
      incidentsApi.get(id),
      incidentsApi.journal(id),
      incidentsApi.nav(id, listParams),
      attachmentsApi.list('incident', id),
    ];

    const clearIncidentState = () => {
      setInc(null);
      setJournal([]);
      setPrevId(null);
      setNextId(null);
      setFileAttachments([]);
      setAssignmentGroups([]);
      setServices([]);
      setCiOptions([]);
      setUsers([]);
      setProblemOptions([]);
      setLinkedProblemIds([]);
    };

    const load = isFulfiller
      ? Promise.all([
          ...basePromises,
          adminApi.assignmentGroups().catch(() => ({ assignment_groups: [] as AssignmentGroupItem[] })),
          incidentsApi.services().catch(() => ({ services: [] as ServiceListItem[] })),
          cmdbApi.items({ status: 'active' }, 1, 100).catch(() => ({ items: [] as CI[] })),
          authApi.users().catch(() => ({ users: [] as UserListItem[] })),
          problemsApi.list({}, 1, 100).catch(() => ({ problems: [] as Problem[] })),
          incidentsApi.linkedProblems(id).catch(() => ({ problems: [] })),
        ]).then(([incRes, jRes, navRes, attRes, agRes, svcRes, ciRes, usersRes, problemRes, linkedProblemsRes]) => {
          if (cancelled) return;
          setInc(incRes);
          setJournal(jRes.entries);
          syncFields(incRes);
          setPrevId(navRes.prev_id);
          setNextId(navRes.next_id);
          setAssignmentGroups(agRes.assignment_groups);
          setFileAttachments(attRes.attachments);
          setServices(svcRes.services);
          setCiOptions(ciRes.items);
          setUsers(usersRes.users);
          setProblemOptions(problemRes.problems);
          const linkedIds = linkedProblemsRes.problems.map((p) => p.problem_id);
          setLinkedProblemIds(linkedIds);
          setField('relatedProblemId', linkedIds[0] || '');
          setLoadError(null);
        })
      : Promise.all(basePromises).then(([incRes, jRes, navRes, attRes]) => {
          if (cancelled) return;
          setInc(incRes);
          setJournal(jRes.entries);
          syncFields(incRes);
          setPrevId(navRes.prev_id);
          setNextId(navRes.next_id);
          setFileAttachments(attRes.attachments);
          setLoadError(null);
        });

    load
      .catch((err: unknown) => {
        if (cancelled) return;
        clearIncidentState();
        setLoadError(err instanceof Error ? err.message : 'Failed to load incident');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isFulfiller, listParams, setFileAttachments]);

  // ─── Navigation ───

  const goTo = useCallback(
    (targetId: string) => {
      navigate(`/incidents/${targetId}`, { state: { listParams }, replace: true });
    },
    [navigate, listParams],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId);
      if (e.key === 'ArrowRight' && nextId) goTo(nextId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, goTo]);

  // ─── Computed ───

  const callerUser = useMemo(
    () => users.find((u) => u.id === fields.callerId) ?? null,
    [fields.callerId, users],
  );

  const selectedService = useMemo(
    () => services.find((s) => s.id === fields.serviceId) ?? null,
    [fields.serviceId, services],
  );

  const selectedCi = useMemo(
    () => ciOptions.find((ci) => ci.id === fields.configurationItemId) ?? null,
    [fields.configurationItemId, ciOptions],
  );
  const selectedProblem = useMemo(
    () => problemOptions.find((p) => p.id === fields.relatedProblemId) ?? null,
    [fields.relatedProblemId, problemOptions],
  );

  const callerInfo =
    inc && fields.callerId === inc.caller_id
      ? {
          email: inc.caller_email,
          phone: inc.caller_phone,
          mobile: inc.caller_mobile,
          department: inc.caller_department_name,
        }
      : callerUser
        ? { email: callerUser.email, phone: null, mobile: null, department: null }
        : null;

  const groupMembers = useMemo(() => {
    if (!fields.assignmentGroupId) return users;
    const group = assignmentGroups.find((g) => g.id === fields.assignmentGroupId);
    if (!group || !group.members.length) return users;
    const memberIds = new Set(group.members.map((m) => m.id));
    return users.filter((u) => memberIds.has(u.id));
  }, [fields.assignmentGroupId, assignmentGroups, users]);

  const requiredFieldMissing = !readonly
    ? {
        assignment_group: !fields.assignmentGroupId,
        impact: !fields.impact,
        urgency: !fields.urgency,
        caller: !fields.callerId,
        service_or_ci: !fields.serviceId && !fields.configurationItemId,
      }
    : {
        assignment_group: false,
        impact: false,
        urgency: false,
        caller: false,
        service_or_ci: false,
      };

  // ─── Actions ───

  const handleUpdate = async () => {
    if (!id || !inc) return;
    setFormError(null);
    if (!readonly) {
      const missing: string[] = [];
      if (!fields.assignmentGroupId) missing.push('Assignment Group');
      if (!fields.impact) missing.push('Impact');
      if (!fields.urgency) missing.push('Urgency');
      if (!fields.callerId) missing.push('Caller');
      if (!fields.serviceId && !fields.configurationItemId) missing.push('Service or Configuration Item');
      if (fields.status === 'pending' && !fields.pendingReason) missing.push('Pending Reason');
      if (fields.status === 'resolved' && !fields.resolutionNotes.trim()) missing.push('Resolution Notes');
      if (missing.length > 0) {
        setFormError(`Please fill required fields: ${missing.join(', ')}`);
        return;
      }
    }
    await withSave(async () => {
      const updates = buildIncidentUpdates(fields, inc);

      if (Object.keys(updates).length > 0) {
        await incidentsApi.update(id, updates as Partial<Incident>);
      }

      const currentPrimaryProblemId = linkedProblemIds[0] || '';
      const nextPrimaryProblemId = fields.relatedProblemId || '';
      if (currentPrimaryProblemId && currentPrimaryProblemId !== nextPrimaryProblemId) {
        await incidentsApi.unrelateProblem(id, currentPrimaryProblemId);
      }
      if (nextPrimaryProblemId && nextPrimaryProblemId !== currentPrimaryProblemId) {
        await incidentsApi.relateProblem(id, nextPrimaryProblemId, 'related_to');
      }

      if (Object.keys(updates).length > 0 || currentPrimaryProblemId !== nextPrimaryProblemId) {
        await refresh();
      }
    });
  };

  const handleReopen = () =>
    withSave(async () => {
      await incidentsApi.update(id!, { status: 'in_progress' } as Partial<Incident>);
      await refresh();
    });

  const handleCancel = () =>
    withSave(async () => {
      await incidentsApi.update(id!, { status: 'cancelled' } as Partial<Incident>);
      await refresh();
    });

  const handleResolveWithKb = async (kbId: string, resolutionNotes: string) => {
    if (!id || !inc) return;
    await withSave(async () => {
      await knowledgeApi.linkIncidentResolution(id, kbId);
      await incidentsApi.update(id, {
        status: 'resolved',
        resolution_notes: resolutionNotes || null,
      } as Partial<Incident>);
      await refresh();
    });
    setKbResolveOpen(false);
  };

  const handleAddJournal = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !journalContent.trim()) return;
    const entry = await incidentsApi.addJournal(id, {
      entry_type: journalType,
      content: journalContent,
      is_customer_visible: journalVisible,
    });
    setJournal((prev) => [entry, ...prev]);
    setJournalContent('');
  };

  return {
    // Identity / navigation
    id,
    user,
    navigate,
    prevId,
    nextId,
    goTo,
    // Core data
    inc,
    journal,
    loading,
    loadError,
    // Reference data
    assignmentGroups,
    services,
    ciOptions,
    users,
    problemOptions,
    groupMembers,
    // Edit fields
    fields,
    setField,
    // Computed
    callerUser,
    selectedService,
    selectedCi,
    selectedProblem,
    callerInfo,
    requiredFieldMissing,
    // Permissions
    isFulfiller,
    isClosed,
    isResolved,
    isCaller,
    readonly,
    // UI state
    saving,
    formError,
    intelligenceOpen,
    setIntelligenceOpen,
    // Attachments
    fileAttachments,
    uploading,
    dragOver,
    setDragOver,
    fileInputRef,
    previewUrl,
    previewName,
    closePreview,
    // Journal
    journalContent,
    setJournalContent,
    journalType,
    setJournalType,
    journalVisible,
    setJournalVisible,
    // Intelligence sidebar
    similarIncidents,
    kbSuggestions,
    loadingSidebar,
    sidebarError,
    // KB resolve modal
    kbResolveOpen,
    setKbResolveOpen,
    // Actions
    handleUpdate,
    handleReopen,
    handleCancel,
    handleResolveWithKb,
    handleAddJournal,
    handleFileUpload,
    handleDrop,
    handleDeleteAttachment,
    handlePreview,
    formatSize,
    refresh,
  };
}
