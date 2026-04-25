/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cmdb, auth, admin } from '../../api/client';
import type { CI, CIClass, AssignmentGroupItem } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { hasConfigurationRole } from '../../utils/roles';

type UserOption = { id: string; display_name: string; email: string };
type RefOption = { id: string; label: string };
type RefDataMap = Record<string, RefOption[]>;

export default function CIForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;

  const [classes, setClasses] = useState<CIClass[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
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
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  const selectedClass = classes.find((c) => c.id === classId);

  const resolveAllAttrs = (cls: CIClass | undefined): Record<string, { type: string; reference_table?: string }> => {
    if (!cls) return {};
    const result: Record<string, { type: string; reference_table?: string }> = {};
    const visited = new Set<string>();
    let current: CIClass | undefined = cls;
    const chain: CIClass[] = [];
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current);
      current = current.parent_class ? classes.find((c) => c.id === current!.parent_class) : undefined;
    }
    for (const c of chain) {
      for (const [key, val] of Object.entries(c.attributes)) {
        if (!result[key]) result[key] = val;
      }
    }
    return result;
  };

  const classAttrs = resolveAllAttrs(selectedClass);

  useEffect(() => {
    const promises: Promise<any>[] = [
      cmdb.classes(),
      auth.users(),
      admin.assignmentGroups(),
    ];
    if (isEdit) promises.push(cmdb.item(id!));

    Promise.all(promises).then(async ([classRes, userRes, groupRes, ciRes]) => {
      setClasses(classRes.classes);
      const userList = userRes.users.map((u: any) => ({ id: u.id, display_name: u.display_name || u.email, email: u.email }));
      setUsers(userList);
      const groupList = groupRes.assignment_groups.filter((g: AssignmentGroupItem) => g.is_active);
      setGroups(groupList);

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
        setLocation(ci.location || '');
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
  }, [id]);

  // When class changes in create mode, reset attributes
  const handleClassChange = (newClassId: string) => {
    setClassId(newClassId);
    const cls = classes.find((c) => c.id === newClassId);
    const allAttrs = resolveAllAttrs(cls);
    const defaults: Record<string, string> = {};
    for (const key of Object.keys(allAttrs)) {
      defaults[key] = '';
    }
    setAttributes(defaults);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!classId) { setError('Class is required'); return; }
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
      location: location || null,
      notes: notes || null,
    };

    try {
      let saved: CI;
      if (isEdit) {
        saved = await cmdb.updateItem(id!, payload as Partial<CI>);
      } else {
        saved = await cmdb.createItem(payload as Partial<CI>);
      }
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
        <p className="text-gray-500">You don't have permission to manage configuration items.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium">Go back</button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? `Edit: ${displayName || name}` : 'New Configuration Item'}
        description={isEdit ? `${selectedClass?.display_name || ''} · ${name}` : 'Create a new CI in the CMDB'}
        action={
          <button onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            &larr; Cancel
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
            <h3 className="font-semibold text-gray-900 mb-2">Step 1: Select CI Class</h3>
            <p className="text-sm text-gray-500 mb-4">Choose the type of configuration item you want to create.</p>

            {classes.length === 0 ? (
              <p className="text-sm text-gray-400">No CI classes found. Ask an admin to create one.</p>
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
                      <span className="text-2xl">{cls.icon === 'server' ? '🖥️' : cls.icon === 'network' ? '🌐' : cls.icon === 'database' ? '🗄️' : cls.icon === 'application' ? '📱' : cls.icon === 'storage' ? '💾' : '📦'}</span>
                      <div>
                        <h4 className="font-semibold text-gray-900">{cls.display_name}</h4>
                        {cls.description && <p className="text-xs text-gray-500 mt-0.5">{cls.description}</p>}
                        {Object.keys(cls.attributes).length > 0 && (
                          <p className="text-xs text-gray-400 mt-1">{Object.keys(cls.attributes).length} attribute{Object.keys(cls.attributes).length !== 1 ? 's' : ''}</p>
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
                <h3 className="font-semibold text-gray-900">Basic Information</h3>
                {!isEdit && (
                  <button onClick={() => setStep(1)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    &larr; Change Class
                  </button>
                )}
              </div>

              {selectedClass && (
                <div className="flex items-center gap-2 mb-4 p-2 bg-indigo-50 rounded-lg">
                  <span className="text-lg">{selectedClass.icon === 'server' ? '🖥️' : selectedClass.icon === 'network' ? '🌐' : selectedClass.icon === 'database' ? '🗄️' : selectedClass.icon === 'application' ? '📱' : selectedClass.icon === 'storage' ? '💾' : '📦'}</span>
                  <span className="text-sm font-medium text-indigo-700">{selectedClass.display_name}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. web-server-01"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Web Server 01 (Production)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="planned">Planned</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Environment</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                    <option value="test">Test</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                  <input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Zurich DC-1"
                  />
                </div>
                {isEdit && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
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
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">
                  {selectedClass?.display_name} Attributes
                  <span className="ml-2 text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    {Object.keys(classAttrs).length}
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(classAttrs).map(([attrName, attrDef]) => {
                    const attrType = (attrDef as any)?.type || 'string';
                    const refTable = (attrDef as any)?.reference_table;
                    const refLabel = refTable === 'users' ? 'Users' : refTable === 'assignment_groups' ? 'Groups' : refTable === 'departments' ? 'Departments' : refTable === 'cost_centers' ? 'Cost Centers' : refTable === 'services' ? 'Services' : refTable;
                    return (
                      <div key={attrName}>
                        <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">
                          {attrName.replace(/_/g, ' ')}
                          <span className="ml-1 text-gray-300 font-normal">
                            ({attrType === 'reference' ? `ref → ${refLabel}` : attrType})
                          </span>
                        </label>
                        {attrType === 'reference' && refTable ? (
                          <select
                            value={attributes[attrName] || ''}
                            onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- None --</option>
                            {(refData[refTable] || []).map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>
                        ) : attrType === 'boolean' ? (
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
                            <input
                              type="checkbox"
                              checked={attributes[attrName] === 'true'}
                              onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.checked ? 'true' : 'false' })}
                              className="w-4 h-4 text-indigo-600 rounded border-gray-300"
                            />
                            {attrName.replace(/_/g, ' ')}
                          </label>
                        ) : attrType === 'number' || attrType === 'integer' ? (
                          <input
                            type="number"
                            value={attributes[attrName] || ''}
                            onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        ) : (
                          <input
                            type="text"
                            value={attributes[attrName] || ''}
                            onChange={(e) => setAttributes({ ...attributes, [attrName]: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder={`Enter ${attrName.replace(/_/g, ' ')}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Notes */}
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Additional notes about this CI..."
              />
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Ownership</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Managed By</label>
                  <UserPicker users={users} value={managedBy} onChange={setManagedBy} placeholder="Select manager..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
                  <UserPicker users={users} value={assignedTo} onChange={setAssignedTo} placeholder="Select assignee..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Supported By Group</label>
                  <select
                    value={supportedBy}
                    onChange={(e) => setSupportedBy(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- None --</option>
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
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Configuration Item'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function UserPicker({ users, value, onChange, placeholder }: {
  users: UserOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{placeholder || 'None'}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>{u.display_name} ({u.email})</option>
      ))}
    </select>
  );
}
