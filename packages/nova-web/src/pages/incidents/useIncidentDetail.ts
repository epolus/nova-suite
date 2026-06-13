/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { incidents as incidentsApi } from '../../api/client';
import type {
  Incident,
  JournalEntry,
  AssignmentGroupItem,
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
} from './incidentDetailFields';
import { useIncidentAttachments } from './useIncidentAttachments';
import { useIncidentSidebar } from './useIncidentSidebar';
import { useIncidentDetailLoad } from './useIncidentDetailLoad';
import { useIncidentDetailActions } from './useIncidentDetailActions';

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
  const [journalLoading, setJournalLoading] = useState(false);
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
  const setField = useCallback((key: keyof typeof EMPTY_FIELDS, val: string) => {
    setFields((prev) => ({ ...prev, [key]: val }));
  }, []);

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
    attachmentsLoading,
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

  const syncFields = useCallback((i: Incident) => {
    setFields(buildFieldsFromIncident(i));
  }, []);

  const loadJournal = useCallback(async (incidentId: string) => {
    setJournalLoading(true);
    try {
      const jRes = await incidentsApi.journal(incidentId);
      setJournal(jRes.entries);
    } catch {
      setJournal([]);
    } finally {
      setJournalLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [full, linkedProblemsRes] = await Promise.all([
      incidentsApi.get(id),
      incidentsApi.linkedProblems(id).catch(() => ({ problems: [] })),
    ]);
    setInc(full);
    syncFields(full);
    const linkedIds = linkedProblemsRes.problems.map((p) => p.problem_id);
    setLinkedProblemIds(linkedIds);
    setField('relatedProblemId', linkedIds[0] || '');
    void loadJournal(id);
  }, [id, loadJournal, syncFields, setField]);

  const withSave = useCallback(async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  }, []);

  useIncidentDetailLoad({
    id,
    isFulfiller,
    listParams,
    syncFields,
    setField,
    setLoading,
    setLoadError,
    setInc,
    setJournal,
    setJournalLoading,
    setPrevId,
    setNextId,
    setAssignmentGroups,
    setServices,
    setCiOptions,
    setUsers,
    setProblemOptions,
    setLinkedProblemIds,
  });

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

  const {
    handleUpdate,
    handleReopen,
    handleCancel,
    handleResolveWithKb,
    handleAddJournal,
  } = useIncidentDetailActions({
    id,
    inc,
    fields,
    readonly,
    linkedProblemIds,
    journalContent,
    journalType,
    journalVisible,
    setFormError,
    setJournal,
    setJournalContent,
    setKbResolveOpen,
    refresh,
    withSave,
  });

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
    journalLoading,
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
    attachmentsLoading,
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
