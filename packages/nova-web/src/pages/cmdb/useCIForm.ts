/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cmdb, auth, admin } from '../../api/client';
import type { CI, CIClass, AssignmentGroupItem, LocationItem } from '../../api/client';
import { useInvalidateReferenceData } from '../../hooks/queries';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { resolveClassAttrs } from './cmdbHelpers';
import {
  buildBaselineForCreate,
  buildFormFromCI,
  hasCIFormChanges,
  type CIFormSnapshot,
} from './ciFormFields';
import type { RefDataMap, UserOption } from './cmdbFormFields';

export function useCIForm(tCmdb: (key: string) => string) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidateReference = useInvalidateReferenceData();
  const isEdit = !!id;

  const [classes, setClasses] = useState<CIClass[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [refData, setRefData] = useState<RefDataMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(isEdit ? 2 : 1);

  const [classId, setClassId] = useState('');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('active');
  const [environment, setEnvironment] = useState('production');
  const [managedBy, setManagedBy] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [supportedBy, setSupportedBy] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<CIFormSnapshot | null>(null);

  const selectedClass = classes.find((c) => c.id === classId);
  const classAttrs = resolveClassAttrs(selectedClass?.id, classes);

  const currentSnapshot = useMemo<CIFormSnapshot>(() => ({
    classId,
    name,
    displayName,
    status,
    environment,
    managedBy,
    assignedTo,
    supportedBy,
    locationId,
    notes,
    attributes,
  }), [
    assignedTo,
    attributes,
    classId,
    displayName,
    environment,
    locationId,
    managedBy,
    name,
    notes,
    status,
    supportedBy,
  ]);

  const isFormDirty = useMemo(() => {
    if (!isEdit && step === 1) return false;
    if (!baseline) return false;
    return hasCIFormChanges(currentSnapshot, baseline);
  }, [baseline, currentSnapshot, isEdit, step]);

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
    const promises: Promise<unknown>[] = [
      cmdb.classes(),
      auth.users(),
      admin.assignmentGroups(),
      admin.locations(),
    ];
    if (isEdit) promises.push(cmdb.item(id!));

    Promise.all(promises).then(async ([classRes, userRes, groupRes, locationRes, ciRes]) => {
      const typedClassRes = classRes as Awaited<ReturnType<typeof cmdb.classes>>;
      const typedUserRes = userRes as Awaited<ReturnType<typeof auth.users>>;
      const typedGroupRes = groupRes as Awaited<ReturnType<typeof admin.assignmentGroups>>;
      const typedLocationRes = locationRes as Awaited<ReturnType<typeof admin.locations>>;

      setClasses(typedClassRes.classes);
      const userList = typedUserRes.users.map((u) => ({
        id: u.id,
        display_name: u.display_name || u.email,
        email: u.email,
      }));
      setUsers(userList);
      const groupList = typedGroupRes.assignment_groups.filter((g) => g.is_active);
      setGroups(groupList);
      setLocations(typedLocationRes.locations.filter((l) => l.is_active));

      const refs: RefDataMap = {
        users: userList.map((u) => ({ id: u.id, label: `${u.display_name} (${u.email})` })),
        assignment_groups: groupList.map((g) => ({ id: g.id, label: g.name })),
      };

      const allAttrs = typedClassRes.classes.flatMap((c) => Object.values(c.attributes));
      const neededTables = new Set(
        allAttrs
          .filter((a) => a.type === 'reference' && a.reference_table)
          .map((a) => a.reference_table!),
      );

      if (neededTables.has('departments') && !refs.departments) {
        try {
          const res = await admin.departments();
          refs.departments = res.departments
            .filter((d) => d.is_active)
            .map((d) => ({ id: d.id, label: d.name }));
        } catch { /* ignore */ }
      }
      if (neededTables.has('cost_centers') && !refs.cost_centers) {
        try {
          const res = await admin.costCenters();
          refs.cost_centers = res.cost_centers
            .filter((d) => d.is_active)
            .map((d) => ({ id: d.id, label: `${d.code} – ${d.name}` }));
        } catch { /* ignore */ }
      }
      if (neededTables.has('services') && !refs.services) {
        try {
          const res = await admin.services();
          refs.services = res.services
            .filter((d) => d.is_active)
            .map((d) => ({ id: d.id, label: d.name }));
        } catch { /* ignore */ }
      }

      setRefData(refs);

      if (ciRes) {
        const snapshot = buildFormFromCI(ciRes as CI);
        setClassId(snapshot.classId);
        setName(snapshot.name);
        setDisplayName(snapshot.displayName);
        setStatus(snapshot.status);
        setEnvironment(snapshot.environment);
        setManagedBy(snapshot.managedBy);
        setAssignedTo(snapshot.assignedTo);
        setSupportedBy(snapshot.supportedBy);
        setLocationId(snapshot.locationId);
        setNotes(snapshot.notes);
        setAttributes(snapshot.attributes);
        setBaseline(snapshot);
      }
      setLoading(false);
    }).catch((err) => {
      setError(String(err));
      setLoading(false);
    });
  }, [id, isEdit]);

  const handleClassChange = (newClassId: string) => {
    setClassId(newClassId);
    const allAttrs = resolveClassAttrs(newClassId, classes);
    const defaults: Record<string, string> = {};
    for (const key of Object.keys(allAttrs)) {
      defaults[key] = '';
    }
    setAttributes(defaults);
    if (!isEdit) {
      setBaseline(buildBaselineForCreate(newClassId, classes));
    }
  };

  const handleSubmit = useCallback(async (): Promise<boolean> => {
    if (!name.trim()) {
      setError(tCmdb('nameRequired'));
      return false;
    }
    if (!classId) {
      setError(tCmdb('classRequired'));
      return false;
    }
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = {
      class_id: classId,
      name: name.trim(),
      display_name: displayName.trim() || name.trim(),
      status,
      environment,
      attributes,
      managed_by: managedBy || null,
      assigned_to: assignedTo || null,
      supported_by: supportedBy || null,
      location_id: locationId || null,
      notes: notes || null,
    };

    try {
      let saved: CI;
      if (isEdit) {
        saved = await cmdb.updateItem(id!, payload as Partial<CI>);
      } else {
        saved = await cmdb.createItem(payload as Partial<CI>);
      }
      invalidateReference.cmdbItems();
      allowNextNavigation();
      navigate(`/cmdb/${saved.id}`);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    assignedTo,
    attributes,
    classId,
    displayName,
    environment,
    id,
    invalidateReference,
    isEdit,
    locationId,
    managedBy,
    name,
    navigate,
    notes,
    status,
    supportedBy,
    tCmdb,
  ]);

  saveRef.current = handleSubmit;

  return {
    isEdit,
    classes,
    users,
    groups,
    locations,
    refData,
    loading,
    saving,
    error,
    step,
    setStep,
    classId,
    name,
    setName,
    displayName,
    setDisplayName,
    status,
    setStatus,
    environment,
    setEnvironment,
    managedBy,
    setManagedBy,
    assignedTo,
    setAssignedTo,
    supportedBy,
    setSupportedBy,
    locationId,
    setLocationId,
    notes,
    setNotes,
    attributes,
    setAttributes,
    selectedClass,
    classAttrs,
    handleClassChange,
    handleSubmit,
    unsavedDialogOpen,
    unsavedDialogSaving,
    guardNavigate,
    stayOnPage,
    leaveWithoutSaving,
    saveAndLeave,
  };
}
