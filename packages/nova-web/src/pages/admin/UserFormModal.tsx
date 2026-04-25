/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import {
  admin,
  type AdminUser,
  type RoleItem,
  type DepartmentItem,
  type CostCenterItem,
  type CompanyItem,
} from '../../api/client';

interface Props {
  user: AdminUser | null;
  allUsers: AdminUser[];
  roles: RoleItem[];
  departments: DepartmentItem[];
  costCenters: CostCenterItem[];
  companies?: CompanyItem[];
  onClose: () => void;
  onSaved: () => void;
  onNavigate?: (userId: string) => void;
  onDelete?: (userId: string) => void;
  prevUserId?: string | null;
  nextUserId?: string | null;
}

const EMPLOYEE_TYPES = [
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'intern', label: 'Intern' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'nl', label: 'Dutch' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
];

const TIME_FORMATS = [
  { value: '24h', label: '24-hour' },
  { value: '12h', label: '12-hour' },
];

const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
];

function buildDisplayName(firstName: string, lastName: string, userId: string): string {
  const parts: string[] = [];
  if (lastName) parts.push(lastName);
  if (firstName) parts.push(firstName);
  const name = lastName && firstName ? `${lastName}, ${firstName}` : parts.join(' ');
  if (!name) return '';
  return userId ? `${name} (${userId})` : name;
}

export default function UserFormModal({
  user, allUsers, roles, departments, costCenters, companies = [],
  onClose, onSaved, onNavigate, onDelete, prevUserId, nextUserId,
}: Props) {
  const isNew = !user;

  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    display_name: user?.display_name ?? '',
    email: user?.email ?? '',
    user_id: user?.user_id ?? '',
    password: '',
    title: user?.title ?? '',
    phone: user?.phone ?? '+41',
    mobile: user?.mobile ?? '',
    location: user?.location ?? 'Zurich',
    timezone: user?.timezone ?? 'UTC',
    time_format: user?.time_format ?? '24h',
    date_format: user?.date_format ?? 'YYYY-MM-DD',
    employee_type: user?.employee_type ?? 'employee',
    company: user?.company ?? '',
    preferred_language: user?.preferred_language ?? 'en',
    start_date: user?.start_date ?? '',
    last_working_date: user?.last_working_date ?? '',
    manager_id: user?.manager_id ?? '',
    department_id: user?.department_id ?? '',
    cost_center_id: user?.cost_center_id ?? '',
    is_active: user?.is_active ?? true,
    role_ids: user?.role_details?.map((r) => r.id) ?? [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [displayNameTouched, setDisplayNameTouched] = useState(!!user);
  useEffect(() => {
    if (!displayNameTouched) {
      const auto = buildDisplayName(form.first_name, form.last_name, form.user_id);
      if (auto) setForm((prev) => ({ ...prev, display_name: auto }));
    }
  }, [form.first_name, form.last_name, form.user_id, displayNameTouched]);

  const set = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleRole = (roleId: string) => {
    setForm((prev) => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter((id) => id !== roleId)
        : [...prev.role_ids, roleId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      if (isNew) {
        if (!form.password) {
          setError('Password is required for new users');
          setSaving(false);
          return;
        }
        await admin.createUser({
          email: form.email,
          password: form.password,
          first_name: form.first_name || undefined,
          last_name: form.last_name || undefined,
          display_name: form.display_name,
          title: form.title || undefined,
          phone: form.phone || undefined,
          mobile: form.mobile || undefined,
          location: form.location || undefined,
          timezone: form.timezone,
          time_format: form.time_format as '12h' | '24h',
          date_format: form.date_format as 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD',
          employee_type: form.employee_type,
          company: form.company || undefined,
          preferred_language: form.preferred_language,
          start_date: form.start_date || undefined,
          last_working_date: form.last_working_date || undefined,
          user_id: form.user_id || undefined,
          manager_id: form.manager_id || null,
          department_id: form.department_id || null,
          cost_center_id: form.cost_center_id || null,
          role_ids: form.role_ids,
        });
      } else {
        await admin.updateUser(user.id, {
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          display_name: form.display_name,
          title: form.title || null,
          phone: form.phone || null,
          mobile: form.mobile || null,
          location: form.location || null,
          timezone: form.timezone,
          time_format: form.time_format as '12h' | '24h',
          date_format: form.date_format as 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD',
          employee_type: form.employee_type,
          company: form.company || null,
          preferred_language: form.preferred_language,
          start_date: form.start_date || null,
          last_working_date: form.last_working_date || null,
          email: form.email,
          user_id: form.user_id || null,
          password: form.password || undefined,
          manager_id: form.manager_id || null,
          department_id: form.department_id || null,
          cost_center_id: form.cost_center_id || null,
          is_active: form.is_active,
          role_ids: form.role_ids,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!confirm(`Delete user "${user.display_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    try {
      await admin.deleteUser(user.id);
      onDelete ? onDelete(user.id) : onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setDeleting(false);
    }
  };

  const managerOptions = allUsers.filter((u) => u.is_active && u.id !== user?.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew || !onNavigate) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prevUserId) onNavigate(prevUserId);
      if (e.key === 'ArrowRight' && nextUserId) onNavigate(nextUserId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, onNavigate, prevUserId, nextUserId]);

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = `${inputCls} bg-white`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <form onSubmit={handleSubmit}>
          {/* Header with navigation */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {isNew ? 'Create User' : `Edit User`}
              </h2>
              <div className="flex items-center gap-2">
                {!isNew && onNavigate && (
                  <>
                    <button
                      type="button"
                      disabled={!prevUserId}
                      onClick={() => prevUserId && onNavigate(prevUserId)}
                      className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Previous user"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={!nextUserId}
                      onClick={() => nextUserId && onNavigate(nextUserId)}
                      className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Next user"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}
                <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 text-xl leading-none">
                  &times;
                </button>
              </div>
            </div>
            {!isNew && (
              <>
                <p className="text-sm text-gray-500 mt-0.5">{user.display_name} &middot; {user.email}</p>
                {(prevUserId || nextUserId) && (
                  <p className="text-xs text-gray-500 mt-0.5">Use &larr; / &rarr; to navigate records</p>
                )}
              </>
            )}
          </div>

          <div className="px-6 py-5 space-y-6">
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Identity */}
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">Identity</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">First Name</label>
                  <input type="text" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Last Name</label>
                  <input type="text" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Employee ID</label>
                  <input type="text" value={form.user_id} onChange={(e) => set('user_id', e.target.value)} placeholder="e.g. EMP004" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Display Name *</label>
                  <input
                    required
                    type="text"
                    value={form.display_name}
                    onChange={(e) => { set('display_name', e.target.value); setDisplayNameTouched(true); }}
                    placeholder="Auto: Lastname, Firstname (ID)"
                    className={inputCls}
                  />
                  {!displayNameTouched && (
                    <p className="text-xs text-gray-400 mt-1">Auto-calculated from name and employee ID</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Job Title</label>
                  <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Senior Engineer" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Email *</label>
                  <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    {isNew ? 'Password *' : 'New Password'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder={isNew ? '' : 'Leave blank to keep current'}
                    className={inputCls}
                  />
                </div>
              </div>
            </fieldset>

            {/* Contact */}
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">Contact</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+41" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mobile</label>
                  <input type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="+41 0 1234 5678" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Location / Office</label>
                  <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Zurich" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Timezone</label>
                  <input type="text" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="e.g. Europe/Zurich" className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Preferred Language</label>
                  <select value={form.preferred_language} onChange={(e) => set('preferred_language', e.target.value)} className={selectCls}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Time Format</label>
                  <select value={form.time_format} onChange={(e) => set('time_format', e.target.value)} className={selectCls}>
                    {TIME_FORMATS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Date Format</label>
                  <select value={form.date_format} onChange={(e) => set('date_format', e.target.value)} className={selectCls}>
                    {DATE_FORMATS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Employment */}
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">Employment</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Employee Type</label>
                  <select value={form.employee_type} onChange={(e) => set('employee_type', e.target.value)} className={selectCls}>
                    {EMPLOYEE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Company</label>
                  <select value={form.company} onChange={(e) => set('company', e.target.value)} className={selectCls}>
                    <option value="">-- None --</option>
                    {companies.filter((c) => c.is_active).map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Start Date</label>
                  <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Last Working Date</label>
                  <input type="date" value={form.last_working_date} onChange={(e) => set('last_working_date', e.target.value)} className={inputCls} />
                </div>
              </div>
            </fieldset>

            {/* Organization */}
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">Organization</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Manager</label>
                  <select value={form.manager_id} onChange={(e) => set('manager_id', e.target.value)} className={selectCls}>
                    <option value="">-- None --</option>
                    {managerOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Department</label>
                  <select value={form.department_id} onChange={(e) => set('department_id', e.target.value)} className={selectCls}>
                    <option value="">-- None --</option>
                    {departments.filter((d) => d.is_active).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Cost Center</label>
                  <select value={form.cost_center_id} onChange={(e) => set('cost_center_id', e.target.value)} className={selectCls}>
                    <option value="">-- None --</option>
                    {costCenters.filter((cc) => cc.is_active).map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} -- {cc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Roles */}
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">Roles</legend>
              <div className="flex flex-wrap gap-2">
                {roles.filter((r) => r.is_active).map((role) => {
                  const selected = form.role_ids.includes(role.id);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {selected && <span className="mr-1">&#10003;</span>}
                      {role.name}
                      {role.description && (
                        <span className={`ml-1 ${selected ? 'text-indigo-200' : 'text-gray-400'}`}>
                          -- {role.description}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {form.role_ids.length === 0 && (
                <p className="mt-2 text-xs text-amber-600">No roles selected. User will have no permissions.</p>
              )}
            </fieldset>

            {/* Account Status (edit only) */}
            {!isNew && (
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">Account Status</legend>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => set('is_active', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                  </div>
                  <span className="text-sm text-gray-700">
                    {form.is_active ? 'Active -- user can log in' : 'Inactive -- user cannot log in'}
                  </span>
                </label>
              </fieldset>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center gap-3">
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : isNew ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
