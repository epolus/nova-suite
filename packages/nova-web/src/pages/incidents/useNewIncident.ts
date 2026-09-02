/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  incidents as incidentsApi,
  knowledge as knowledgeApi,
  problems as problemsApi,
  admin as adminApi,
  cmdb as cmdbApi,
} from '../../api/client';
import type {
  UserListItem,
  AssignmentGroupItem,
  CI,
  ServiceListItem,
  Problem,
  SimilarIncident,
  KnowledgeSuggestion,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import {
  buildNewIncidentBaseline,
  hasNewIncidentFormChanges,
  type NewIncidentFormState,
} from './incidentDetailFields';

export function useNewIncident(tIncidents: (key: string) => string) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEss = !isAgentRole(user?.roles);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('medium');
  const [urgency, setUrgency] = useState('medium');
  const [callerId, setCallerId] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [configItemId, setConfigItemId] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [relatedProblemId, setRelatedProblemId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [similarIncidents, setSimilarIncidents] = useState<SimilarIncident[]>([]);
  const [kbSuggestions, setKbSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroupItem[]>([]);
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [cis, setCis] = useState<CI[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);

  useEffect(() => {
    if (!user) return;
    incidentsApi.callers().then((res) => setUsers(res.users)).catch(() => {
      setUsers([{
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        user_id: null,
        roles: user.roles || [],
      }]);
    });
    if (!isEss) {
      adminApi.assignmentGroups().then((res) => setAssignmentGroups(res.assignment_groups)).catch(() => {});
      incidentsApi.services().then((res) => setServices(res.services)).catch(() => {});
      cmdbApi.items({ status: 'installed' }, 1, 100).then((res) => setCis(res.items)).catch(() => {});
      problemsApi.list({}, 1, 100).then((res) => setProblems(res.problems)).catch(() => {});
    }
  }, [user, isEss]);

  useEffect(() => {
    if (!user || callerId) return;
    setCallerId(user.id);
  }, [user, callerId]);

  const selectedCaller = users.find((u) => u.id === callerId);
  const groupMembers = useMemo(() => {
    if (!assignmentGroupId) return users;
    const group = assignmentGroups.find((g) => g.id === assignmentGroupId);
    if (!group || !group.members.length) return users;
    const memberIds = new Set(group.members.map((m) => m.id));
    return users.filter((u) => memberIds.has(u.id));
  }, [assignmentGroupId, assignmentGroups, users]);

  const formSnapshot = useMemo<NewIncidentFormState>(() => ({
    title,
    description,
    impact,
    urgency,
    callerId,
    contactInfo,
    assignmentGroupId,
    assignedTo,
    serviceId,
    configItemId,
    category,
    subcategory,
    relatedProblemId,
  }), [
    assignedTo,
    assignmentGroupId,
    callerId,
    category,
    configItemId,
    contactInfo,
    description,
    impact,
    relatedProblemId,
    serviceId,
    subcategory,
    title,
    urgency,
  ]);

  const baseline = useMemo(
    () => buildNewIncidentBaseline(user?.id || ''),
    [user?.id],
  );

  const isFormDirty = useMemo(
    () => hasNewIncidentFormChanges(formSnapshot, baseline),
    [baseline, formSnapshot],
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

  useEffect(() => {
    if (!sidebarOpen) return;
    const text = (title + ' ' + description).trim();
    if (!text) { setSimilarIncidents([]); setKbSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingSidebar(true);
      try {
        const [simRes, kbRes] = await Promise.all([
          incidentsApi.similarByText({ title, description, limit: 6 }),
          knowledgeApi.suggestionsByText({ title, description, category: isEss ? undefined : category, limit: 6 }),
        ]);
        setSimilarIncidents(simRes.incidents);
        setKbSuggestions(kbRes.articles);
      } catch {
        // silently ignore
      } finally {
        setLoadingSidebar(false);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [title, description, sidebarOpen, category, isEss]);

  const handleSubmit = useCallback(async (): Promise<boolean> => {
    setError('');
    if (!user) {
      setError(tIncidents('mustBeSignedIn'));
      return false;
    }
    if (!title.trim()) {
      setError(tIncidents('titleRequired'));
      return false;
    }
    if (!isEss && !assignmentGroupId) {
      setError(tIncidents('assignmentGroupRequired'));
      return false;
    }
    setSubmitting(true);
    try {
      const createPayload = {
        title,
        description: description || undefined,
        impact: impact as 'low' | 'medium' | 'high',
        urgency: urgency as 'low' | 'medium' | 'high',
        caller_id: callerId || user.id,
        contact_info: contactInfo || undefined,
        ...(isEss
          ? {}
          : {
            assignment_group_id: assignmentGroupId || undefined,
            assigned_to: assignedTo || undefined,
            service_id: serviceId || undefined,
            configuration_item_id: configItemId || undefined,
            category: category || undefined,
            subcategory: subcategory || undefined,
          }),
      };
      const res = isEss
        ? await incidentsApi.createEss(createPayload)
        : await incidentsApi.create(createPayload);
      if (!isEss && relatedProblemId) {
        await incidentsApi.relateProblem(res.id, relatedProblemId, 'related_to');
      }
      allowNextNavigation();
      navigate(`/incidents/${res.id}`);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tIncidents('createFailed'));
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [
    allowNextNavigation,
    assignedTo,
    assignmentGroupId,
    callerId,
    category,
    configItemId,
    contactInfo,
    description,
    impact,
    isEss,
    navigate,
    relatedProblemId,
    serviceId,
    subcategory,
    title,
    tIncidents,
    urgency,
    user,
  ]);

  saveRef.current = handleSubmit;

  return {
    isEss,
    title,
    setTitle,
    description,
    setDescription,
    impact,
    setImpact,
    urgency,
    setUrgency,
    callerId,
    setCallerId,
    contactInfo,
    setContactInfo,
    assignmentGroupId,
    setAssignmentGroupId,
    assignedTo,
    setAssignedTo,
    serviceId,
    setServiceId,
    configItemId,
    setConfigItemId,
    category,
    setCategory,
    subcategory,
    setSubcategory,
    relatedProblemId,
    setRelatedProblemId,
    submitting,
    error,
    sidebarOpen,
    setSidebarOpen,
    similarIncidents,
    kbSuggestions,
    loadingSidebar,
    users,
    assignmentGroups,
    services,
    cis,
    problems,
    selectedCaller,
    groupMembers,
    unsavedDialogOpen,
    unsavedDialogSaving,
    guardNavigate,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
    handleSubmit,
  };
}
