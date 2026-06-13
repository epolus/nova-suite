/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cmdb, auth, admin } from '../../api/client';
import type { CI, CIClass, AssignmentGroupItem, LocationItem } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useInvalidateReferenceData } from '../../hooks/queries';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { hasConfigurationRole } from '../../utils/roles';
import { useFieldLabel, useStatusLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { resolveClassAttrs, classEmoji } from './cmdbHelpers';
import {
  CiAttributeFields,
  UserPicker,
  type UserOption,
  type RefDataMap,
} from './cmdbFormFields';

export default function CIForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const invalidateReference = useInvalidateReferenceData();
  const isEdit = !!id;
  const tCmdb = useTranslations('pages.cmdb');
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tStates = useTranslations('common.states');
  const fieldLabel = useFieldLabel();
  const statusLabel = useStatusLabel();

  const [classes, setClasses] = useState<CIClass[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [refData, setRefData] = useState<RefDataMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Wizard step (only for create mode)
  const [step, setStep] = useState(isEdit ? 2 : 1);

  // Form state
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

  const selectedClass = classes.find((c) => c.id === classId);
  const classAttrs = resolveClassAttrs(selectedClass?.id, classes);

  useEffect(() => {
    const promises: Promise<any>[] = [
      cmdb.classes(),
      auth.users(),
      admin.assignmentGroups(),
      admin.locations(),
    ];
    if (isEdit) promises.push(cmdb.item(id!));

    Promise.all(promises).then(async ([classRes, userRes, groupRes, locationRes, ciRes]) => {
      setClasses(classRes.classes);
      const userList = userRes.users.map((u: any) => ({ id: u.id, display_name: u.display_name || u.email, email: u.email }));
      setUsers(userList);
      const groupList = groupRes.assignment_groups.filter((g: AssignmentGroupItem) => g.is_active);
      setGroups(groupList);
      setLocations(locationRes.locations.filter((l: LocationItem) => l.is_active));

      // Build reference data from already-loaded entities
      const refs: RefDataMap = {
        users: userList.map((u: UserOption) => ({ id: u.id, label: `${u.display_name} (${u.email})` })),
        assignment_groups: groupList.map((g: AssignmentGroupItem) => ({ id: g.id, label: g.name })),
      };

      // Load additional reference tables if needed by any class attribute
      const allAttrs = classRes.classes.flatMap((c: CIClass) => Object.values(c.attributes));
      const neededTables = new Set(allAttrs.filter((a: any) => a.type === 'reference' && a.reference_table).map((a: any) => a.reference_table));

      if (neededTables.has('departments') && !refs.departments) {
        try {
          const res = await admin.departments();
          refs.departments = res.departments.filter((d: any) => d.is_active).map((d: any) => ({ id: d.id, label: d.name }));
        } catch { /* ignore */ }
      }
      if (neededTables.has('cost_centers') && !refs.cost_centers) {
        try {
          const res = await admin.costCenters();
          refs.cost_centers = res.cost_centers.filter((d: any) => d.is_active).map((d: any) => ({ id: d.id, label: `${d.code} – ${d.name}` }));
        } catch { /* ignore */ }
      }
      if (neededTables.has('services') && !refs.services) {
        try {
          const res = await admin.services();
          refs.services = res.services.filter((d: any) => d.is_active).map((d: any) => ({ id: d.id, label: d.name }));
        } catch { /* ignore */ }
      }

      setRefData(refs);

      if (ciRes) {
        const ci: CI = ciRes;
        setClassId(ci.class_id);
        setName(ci.name);
        setDisplayName(ci.display_name || '');
        setStatus(ci.status);
        setEnvironment(ci.environment);
        setManagedBy(ci.managed_by || '');
        setAssignedTo(ci.assigned_to || '');
        setSupportedBy(ci.supported_by || '');
        setLocationId(ci.location_id || '');
        setNotes(ci.notes || '');
        const attrMap: Record<string, string> = {};
        for (const [k, v] of Object.entries(ci.attributes || {})) {
          attrMap[k] = String(v);
        }
        setAttributes(attrMap);
      }
      setLoading(false);
    }).catch((err) => {
      setError(String(err));
      setLoading(false);
    });
  }, [id, isEdit]);

  // When class changes in create mode, reset attributes
  const handleClassChange = (newClassId: string) => {
    setClassId(newClassId);
    const allAttrs = resolveClassAttrs(newClassId, classes);
    const defaults: Record<string, string> = {};
    for (const key of Object.keys(allAttrs)) {
      defaults[key] = '';
    }
    setAttributes(defaults);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError(tCmdb('nameRequired')); return; }
    if (!classId) { setError(tCmdb('classRequired')); return; }
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
      navigate(`/cmdb/${saved.id}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const canEdit = hasConfigurationRole(user?.roles);
  if (!canEdit) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">{tCmdb('noPermission')}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium">{tCmdb('goBack')}</button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? tCmdb('editTitle', { name: displayName || name }) : tCmdb('newCi')}
        description={isEdit ? `${selectedClass?.display_name || ''} · ${name}` : tCmdb('createDescription')}
        action={
          <button onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            &larr; {tActions('cancel')}
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Step 1: Class Selection (Create only) */}
      {!isEdit && step === 1 && (
        <div className="max-w-2xl">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-2">{tCmdb('step1Title')}</h3>
            <p className="text-sm text-gray-500 mb-4">{tCmdb('step1Description')}</p>

            {classes.length === 0 ? (
              <p className="text-sm text-gray-400">{tCmdb('noCiClasses')}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {classes.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => { handleClassChange(cls.id); setStep(2); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                      classId === cls.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{classEmoji(cls.icon)}</span>
                      <div>
                        <h4 className="font-semibold text-gray-900">{cls.display_name}</h4>
                        {cls.description && <p className="text-xs text-gray-500 mt-0.5">{cls.description}</p>}
                        {Object.keys(cls.attributes).length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">{tCmdb('attributeCount', { count: Object.keys(cls.attributes).length })}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Step 2: CI Form */}
      {step === 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">{tCmdb('basicInformation')}</h3>
                {!isEdit && (
                  <button onClick={() => setStep(1)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    {tCmdb('changeClass')}
                  </button>
                )}
              </div>

              {selectedClass && (
                <div className="flex items-center gap-2 mb-4 p-2 bg-indigo-50 rounded-lg">
                  <span className="text-lg">{classEmoji(selectedClass.icon)}</span>
                  <span className="text-sm font-medium text-indigo-700">{selectedClass.display_name}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('name')} *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={tCmdb('namePlaceholder')}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('displayName')}</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={tCmdb('displayNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('status')}</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">{tStates('active')}</option>
                    <option value="planned">{statusLabel('planned')}</option>
                    <option value="maintenance">{statusLabel('maintenance')}</option>
                    <option value="retired">{statusLabel('retired')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('environment')}</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="production">{statusLabel('production')}</option>
                    <option value="staging">{statusLabel('staging')}</option>
                    <option value="development">{statusLabel('development')}</option>
                    <option value="test">{statusLabel('test')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('location')}</label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{tStates('none')}</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} - {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isEdit && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('class')}</label>
                    <select
                      value={classId}
                      onChange={(e) => handleClassChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </Card>

            {/* Class Attributes */}
            {Object.keys(classAttrs).length > 0 && (
              <CiAttributeFields
                classAttrs={classAttrs}
                className={selectedClass?.display_name ?? ''}
                attributes={attributes}
                setAttributes={setAttributes}
                refData={refData}
              />
            )}

            {/* Notes */}
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">{fieldLabel('notes')}</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder={tCmdb('notesPlaceholder')}
              />
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">{tCmdb('ownership')}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('managedBy')}</label>
                  <UserPicker users={users} value={managedBy} onChange={setManagedBy} placeholder={tCmdb('selectManager')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('assignedTo')}</label>
                  <UserPicker users={users} value={assignedTo} onChange={setAssignedTo} placeholder={tCmdb('selectAssignee')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tCmdb('supportedByGroup')}</label>
                  <select
                    value={supportedBy}
                    onChange={(e) => setSupportedBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">{tStates('none')}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !classId}
              className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isEdit ? tMaster('saveChanges') : tCmdb('createConfigurationItem')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
