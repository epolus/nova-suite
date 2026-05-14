/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useRef, useMemo, type FormEvent } from 'react';
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
  SimilarIncident,
  KnowledgeSuggestion,
  CI,
  Problem,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isFulfillerRole } from '../../utils/roles';
import { useUserPreferenceState } from '../../hooks/useUserPreferenceState';

const SIDEBAR_STORAGE_KEY = 'incident_detail_intelligence_sidebar_open';

const EMPTY_FIELDS = {
  impact: '',
  urgency: '',
  status: '',
  pendingReason: '',
  assignmentGroupId: '',
  assignedTo: '',
  callerId: '',
  contactInfo: '',
  serviceId: '',
  configurationItemId: '',
  title: '',
  description: '',
  category: '',
  subcategory: '',
  resolutionNotes: '',
  relatedProblemId: '',
};

export function useIncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const listParams: Record<string, string> =
    (location.state as { listParams?: Record<string, string> })?.listParams || {};

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
  const [fileAttachments, setFileAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  // Journal
  const [journalContent, setJournalContent] = useState('');
  const [journalType, setJournalType] = useState('comment');
  const [journalVisible, setJournalVisible] = useState(true);

  // Intelligence sidebar
  const [similarIncidents, setSimilarIncidents] = useState<SimilarIncident[]>([]);
  const [kbSuggestions, setKbSuggestions] = useState<KnowledgeSuggestion[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

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
    setFields({
      impact: i.impact,
      urgency: i.urgency,
      status: i.status,
      pendingReason: i.resolution_code || '',
      assignmentGroupId: i.assignment_group_id || '',
      assignedTo: i.assigned_to || '',
      callerId: i.caller_id || '',
      contactInfo: i.contact_info || '',
      serviceId: i.service_id || '',
      configurationItemId: i.configuration_item_id || '',
      title: i.title,
      description: i.description || '',
      category: i.category || '',
      subcategory: i.subcategory || '',
      resolutionNotes: i.resolution_notes || '',
      relatedProblemId: '',
    });
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
  }, [id, isFulfiller]);

  useEffect(() => {
    if (!id || !intelligenceOpen) return;
    setLoadingSidebar(true);
    setSidebarError(null);
    Promise.all([
      incidentsApi.similar(id, { limit: 6 }),
      knowledgeApi.suggestionsForIncident(id, { limit: 6 }),
    ])
      .then(([similarRes, kbRes]) => {
        setSimilarIncidents(similarRes.incidents);
        setKbSuggestions(kbRes.articles);
      })
      .catch((err: Error) => {
        setSidebarError(err.message || 'Failed to load suggestions');
        setSimilarIncidents([]);
        setKbSuggestions([]);
      })
      .finally(() => setLoadingSidebar(false));
  }, [id, intelligenceOpen]);

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
      const updates: Record<string, unknown> = {};
      if (fields.impact !== inc.impact) updates.impact = fields.impact;
      if (fields.urgency !== inc.urgency) updates.urgency = fields.urgency;
      if (fields.status !== inc.status) updates.status = fields.status;
      if (fields.title !== inc.title) updates.title = fields.title;
      if (fields.description !== (inc.description || '')) updates.description = fields.description || null;
      if (fields.category !== (inc.category || '')) updates.category = fields.category || null;
      if (fields.subcategory !== (inc.subcategory || '')) updates.subcategory = fields.subcategory || null;
      if (fields.contactInfo !== (inc.contact_info || '')) updates.contact_info = fields.contactInfo || null;
      if (fields.pendingReason !== (inc.resolution_code || '')) updates.resolution_code = fields.pendingReason || null;

      const newAgId = fields.assignmentGroupId || null;
      if (newAgId !== (inc.assignment_group_id || null)) updates.assignment_group_id = newAgId;

      const newAssignedTo = fields.assignedTo || null;
      if (newAssignedTo !== (inc.assigned_to || null)) updates.assigned_to = newAssignedTo;

      const newCallerId = fields.callerId || null;
      if (newCallerId !== (inc.caller_id || null)) updates.caller_id = newCallerId;

      const newServiceId = fields.serviceId || null;
      if (newServiceId !== (inc.service_id || null)) updates.service_id = newServiceId;

      const newCiId = fields.configurationItemId || null;
      if (newCiId !== (inc.configuration_item_id || null)) updates.configuration_item_id = newCiId;

      if (
        (fields.status === 'resolved' || inc.status === 'resolved') &&
        fields.resolutionNotes !== (inc.resolution_notes || '')
      ) {
        updates.resolution_notes = fields.resolutionNotes || null;
      }

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

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!id) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const att = await attachmentsApi.upload('incident', id, file);
          setFileAttachments((prev) => [att, ...prev]);
        }
      } finally {
        setUploading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (!id) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const filesToUpload: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const ext = file.type.split('/')[1] || 'png';
            const name =
              file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.${ext}`;
            filesToUpload.push(new File([file], name, { type: file.type }));
          }
        }
      }
      if (filesToUpload.length > 0) {
        e.preventDefault();
        await handleFileUpload(filesToUpload);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [id, handleFileUpload]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await handleFileUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    await attachmentsApi.delete(attId);
    setFileAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handlePreview = async (att: Attachment) => {
    if (att.mime_type.startsWith('image/')) {
      const url = await attachmentsApi.previewUrl(att.id);
      setPreviewUrl(url);
      setPreviewName(att.file_name);
    } else {
      await attachmentsApi.download(att.id, att.file_name);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
