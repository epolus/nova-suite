/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useParams, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Incident, JournalEntry } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isFulfillerRole } from '../../utils/roles';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';
import {
  queryKeys,
  useIncidentDetailQuery,
  useIncidentJournal,
  useIncidentLinkedProblems,
  useIncidentNav,
  useReferenceAssignmentGroups,
  useReferenceCmdbItems,
  useReferenceIncidentCategories,
  useReferenceIncidentResolutionCodes,
  useReferenceIncidentServices,
  useReferenceProblemPicker,
  useReferenceUsers,
} from '../../hooks/queries';
import {
  EMPTY_FIELDS,
  SIDEBAR_STORAGE_KEY,
  buildFieldsFromIncident,
  hasIncidentFormChanges,
} from './incidentDetailFields';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { useIncidentAttachments } from './useIncidentAttachments';
import { useIncidentSidebar } from './useIncidentSidebar';
import { useIncidentDetailActions } from './useIncidentDetailActions';

export function useIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> })?.listParams || {},
    [location.state],
  );

  const isFulfiller = isFulfillerRole(user?.roles);

  // Core data (React Query: cached per incident, shared with invalidations from other pages)
  const incidentQuery = useIncidentDetailQuery(id);
  const journalQuery = useIncidentJournal(id);
  const navQuery = useIncidentNav(id, listParams);
  const inc: Incident | null = incidentQuery.data ?? null;
  const journal = useMemo<JournalEntry[]>(() => journalQuery.data ?? [], [journalQuery.data]);
  const journalLoading = journalQuery.isFetching;
  const loading = incidentQuery.isPending && !!id;
  const loadError = incidentQuery.error
    ? (incidentQuery.error instanceof Error ? incidentQuery.error.message : 'Failed to load incident')
    : null;
  const prevId = navQuery.data?.prev_id ?? null;
  const nextId = navQuery.data?.next_id ?? null;
  const setJournal = useCallback<Dispatch<SetStateAction<JournalEntry[]>>>((next) => {
    if (!id) return;
    queryClient.setQueryData<JournalEntry[]>(queryKeys.incidents.journal(id), (prev = []) =>
      typeof next === 'function' ? next(prev) : next);
  }, [id, queryClient]);

  // Reference data (fulfiller only, cached via React Query)
  const { data: assignmentGroups = [] } = useReferenceAssignmentGroups(isFulfiller);
  const { data: services = [] } = useReferenceIncidentServices(isFulfiller);
  const { data: ciOptions = [] } = useReferenceCmdbItems({ status: 'installed' }, 1, 100, isFulfiller);
  const { data: users = [] } = useReferenceUsers(isFulfiller);
  const { data: problemOptions = [] } = useReferenceProblemPicker(isFulfiller);
  const { data: incidentCategories = [] } = useReferenceIncidentCategories(isFulfiller, true);
  const { data: resolutionCodes = [] } = useReferenceIncidentResolutionCodes(isFulfiller, true);
  const { data: linkedProblems = [] } = useIncidentLinkedProblems(id, isFulfiller);
  const linkedProblemIds = useMemo(
    () => linkedProblems.map((p) => p.problem_id),
    [linkedProblems],
  );

  // Edit fields — all grouped
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
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
  const { similarIncidents, kbSuggestions, knownErrors, correlations, loadingSidebar, sidebarError } = useIncidentSidebar(
    id,
    intelligenceOpen,
  );

  // Resolve with KB modal
  const [kbResolveOpen, setKbResolveOpen] = useState(false);

  const isClosed = inc?.status === 'closed' || inc?.status === 'cancelled';
  const isResolved = inc?.status === 'resolved';
  const isCaller = inc?.caller_id === user?.id;
  const readonly = isClosed || !isFulfiller;

  const syncFields = useCallback((i: Incident) => {
    setFields(buildFieldsFromIncident(i));
    setCustomFields(i.custom_fields || {});
  }, []);

  const relatedProblemSync = linkedProblemIds[0] || '';
  const relatedSyncKey = `${id}|${isFulfiller}|${relatedProblemSync}`;
  const [prevRelatedSyncKey, setPrevRelatedSyncKey] = useState(relatedSyncKey);
  if (relatedSyncKey !== prevRelatedSyncKey) {
    setPrevRelatedSyncKey(relatedSyncKey);
    if (id && isFulfiller) setField('relatedProblemId', relatedProblemSync);
  }

  // Copy server data into the edit form on first load, and on later refetches only
  // while the form has no unsaved edits (refresh() re-syncs explicitly after a save).
  const [syncedInc, setSyncedInc] = useState<Incident | null>(null);
  if (inc && inc !== syncedInc) {
    const firstForThisIncident = !syncedInc || syncedInc.id !== inc.id;
    const unsaved = !firstForThisIncident && (
      hasIncidentFormChanges(fields, syncedInc, linkedProblemIds)
      || JSON.stringify(syncedInc.custom_fields || {}) !== JSON.stringify(customFields)
    );
    setSyncedInc(inc);
    if (!unsaved) syncFields(inc);
  }

  const { refetch: refetchIncident } = incidentQuery;
  const { refetch: refetchJournal } = journalQuery;
  const refresh = useCallback(async () => {
    if (!id) return;
    const { data: full, error } = await refetchIncident();
    if (error) throw error;
    if (full) syncFields(full);
    await queryClient.invalidateQueries({ queryKey: queryKeys.incidents.linkedProblems(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.incidents.lists() });
    void refetchJournal();
  }, [id, queryClient, refetchIncident, refetchJournal, syncFields]);

  const withSave = useCallback(async (fn: () => Promise<void>) => {
    setSaving(true);
    try {
      await fn();
    } finally {
      setSaving(false);
    }
  }, []);

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
          vip: inc.caller_vip === true,
        }
      : callerUser
        ? { email: callerUser.email, phone: callerUser.phone ?? null, mobile: callerUser.mobile ?? null, department: null, vip: callerUser.vip === true }
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
    customFields,
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

  const isFormDirty = Boolean(
    inc &&
      !readonly &&
      (hasIncidentFormChanges(fields, inc, linkedProblemIds) ||
        JSON.stringify(inc.custom_fields || {}) !== JSON.stringify(customFields)),
  );

  const {
    dialogOpen: unsavedDialogOpen,
    saving: unsavedDialogSaving,
    guardNavigate,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  } = useUnsavedChangesGuard({
    isDirty: isFormDirty,
    enabled: !readonly,
    onSave: handleUpdate,
  });

  const goTo = useCallback(
    (targetId: string) => {
      guardNavigate(`/incidents/${targetId}`, { state: { listParams }, replace: true });
    },
    [guardNavigate, listParams],
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

  return {
    // Identity / navigation
    id,
    user,
    navigate: guardNavigate,
    prevId,
    nextId,
    goTo,
    unsavedDialogOpen,
    unsavedDialogSaving,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
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
    incidentCategories,
    resolutionCodes,
    groupMembers,
    // Edit fields
    fields,
    setField,
    customFields,
    setCustomFields,
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
    knownErrors,
    correlations,
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
