/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  admin,
  type AdminUser,
  type RoleItem,
  type DepartmentItem,
  type CostCenterItem,
  type CompanyItem,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import UserDateInput from '../../components/UserDateInput';

const EMPLOYEE_TYPES = [
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'intern', label: 'Intern' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'de-ch', label: 'German Switzerland' },
  { value: 'fr', label: 'French' },
  { value: 'it', label: 'Italian' },
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

function toDateOnly(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? raw;
}

function normalizePhoneForValidation(value: string): string {
  return value.trim().replace(/[()\-\s]/g, '');
}

function validateE164PhoneField(value: string, fieldLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = normalizePhoneForValidation(trimmed);
  if (!/^\+[1-9]\d{1,14}$/.test(normalized)) {
    return `${fieldLabel} must be a valid E.164 number (example: +41791234567).`;
  }
  return null;
}

function getSortValue(user: AdminUser, key: string): unknown {
  if (key === 'user') return user.display_name;
  if (key === '_status') return user.is_active ? 0 : 1;
  return (user as unknown as Record<string, unknown>)[key];
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const listParams =
    (location.state as { listParams?: Record<string, string> } | null)?.listParams || {};

  const activeFilter = listParams.active || 'all';
  const sortBy = listParams.sort_by || '';
  const sortDir = listParams.sort_dir === 'asc' ? 'asc' : 'desc';
  const searchText = (listParams.search || '').toLowerCase();
  const colFilters = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [key, val] of Object.entries(listParams)) {
      if (key.startsWith('cf.') && val) map[key.slice(3)] = val;
    }
    return map;
  }, [listParams]);

  const loadData = useCallback(async (): Promise<AdminUser[]> => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, deptRes, ccRes, companiesRes] = await Promise.all([
        admin.users(),
        admin.roles(),
        admin.departments(),
        admin.costCenters(),
        admin.companies(),
      ]);
      setUsers(usersRes.users);
      setRoles(rolesRes.roles);
      setDepartments(deptRes.departments);
      setCostCenters(ccRes.cost_centers);
      setCompanies(companiesRes.companies);
      return usersRes.users;
    } catch (err) {
      console.error('Failed to load user admin data:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSortedUsers = useMemo(() => {
    let list = users;
    if (activeFilter === 'active') list = list.filter((u) => u.is_active);
    else if (activeFilter === 'inactive') list = list.filter((u) => !u.is_active);
    if (searchText) {
      list = list.filter(
        (u) =>
          u.display_name.toLowerCase().includes(searchText) ||
          u.email.toLowerCase().includes(searchText) ||
          (u.first_name && u.first_name.toLowerCase().includes(searchText)) ||
          (u.last_name && u.last_name.toLowerCase().includes(searchText)) ||
          (u.user_id && u.user_id.toLowerCase().includes(searchText)) ||
          (u.title && u.title.toLowerCase().includes(searchText)) ||
          (u.location && u.location.toLowerCase().includes(searchText)) ||
          u.roles.some((r) => r.toLowerCase().includes(searchText)) ||
          (u.department_name && u.department_name.toLowerCase().includes(searchText)),
      );
    }
    for (const [col, val] of Object.entries(colFilters)) {
      const lower = val.toLowerCase();
      list = list.filter((u) => {
        if (col === '_status') return (u.is_active ? 'active' : 'inactive').startsWith(lower);
        if (col === 'user') return u.display_name.toLowerCase().startsWith(lower) || u.email.toLowerCase().startsWith(lower);
        if (col === 'roles') return u.roles.some((r) => r.toLowerCase().startsWith(lower));
        const raw = (u as unknown as Record<string, unknown>)[col];
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    if (!sortBy) return list;
    return [...list].sort((a, b) => {
      const aVal = getSortValue(a, sortBy);
      const bVal = getSortValue(b, sortBy);
      const cmp = compareValues(aVal, bVal);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [users, activeFilter, searchText, colFilters, sortBy, sortDir]);

  const currentUser = useMemo(() => {
    if (isNew || !id) return null;
    return users.find((u) => u.id === id) || null;
  }, [isNew, id, users]);

  const navInfo = useMemo(() => {
    if (isNew || !currentUser) return { prev: null, next: null };
    const idx = filteredSortedUsers.findIndex((u) => u.id === currentUser.id);
    return {
      prev: idx > 0 ? filteredSortedUsers[idx - 1]!.id : null,
      next: idx >= 0 && idx < filteredSortedUsers.length - 1 ? filteredSortedUsers[idx + 1]!.id : null,
    };
  }, [isNew, currentUser, filteredSortedUsers]);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    display_name: '',
    email: '',
    user_id: '',
    password: '',
    title: '',
    phone: '+41',
    mobile: '',
    location: 'Zurich',
    timezone: 'UTC',
    time_format: '24h',
    date_format: 'YYYY-MM-DD',
    employee_type: 'employee',
    company: '',
    preferred_language: 'en',
    start_date: '',
    last_working_date: '',
    manager_id: '',
    department_id: '',
    cost_center_id: '',
    is_active: true,
    role_ids: [] as string[],
  });
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew || !currentUser) {
      setForm({
        first_name: '',
        last_name: '',
        display_name: '',
        email: '',
        user_id: '',
        password: '',
        title: '',
        phone: '+41',
        mobile: '',
        location: 'Zurich',
        timezone: 'UTC',
        time_format: '24h',
        date_format: 'YYYY-MM-DD',
        employee_type: 'employee',
        company: '',
        preferred_language: 'en',
        start_date: '',
        last_working_date: '',
        manager_id: '',
        department_id: '',
        cost_center_id: '',
        is_active: true,
        role_ids: [],
      });
      setDisplayNameTouched(false);
      return;
    }
    setForm({
      first_name: currentUser.first_name ?? '',
      last_name: currentUser.last_name ?? '',
      display_name: currentUser.display_name ?? '',
      email: currentUser.email ?? '',
      user_id: currentUser.user_id ?? '',
      password: '',
      title: currentUser.title ?? '',
      phone: currentUser.phone ?? '',
      mobile: currentUser.mobile ?? '',
      location: currentUser.location ?? '',
      timezone: currentUser.timezone ?? 'UTC',
      time_format: currentUser.time_format ?? '24h',
      date_format: currentUser.date_format ?? 'YYYY-MM-DD',
      employee_type: currentUser.employee_type ?? 'employee',
      company: currentUser.company ?? '',
      preferred_language: currentUser.preferred_language ?? 'en',
      start_date: toDateOnly(currentUser.start_date),
      last_working_date: toDateOnly(currentUser.last_working_date),
      manager_id: currentUser.manager_id ?? '',
      department_id: currentUser.department_id ?? '',
      cost_center_id: currentUser.cost_center_id ?? '',
      is_active: currentUser.is_active ?? true,
      role_ids: currentUser.role_details?.map((r) => r.id) ?? [],
    });
    setDisplayNameTouched(true);
  }, [isNew, currentUser]);

  useEffect(() => {
    if (!displayNameTouched) {
      const auto = buildDisplayName(form.first_name, form.last_name, form.user_id);
      if (auto) setForm((prev) => ({ ...prev, display_name: auto }));
    }
  }, [form.first_name, form.last_name, form.user_id, displayNameTouched]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && navInfo.prev) navigate(`/admin/users/${navInfo.prev}`, { state: location.state });
      if (e.key === 'ArrowRight' && navInfo.next) navigate(`/admin/users/${navInfo.next}`, { state: location.state });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, navInfo.prev, navInfo.next, navigate, location.state]);

  useEffect(() => {
    if (!loading && !isNew && id && !currentUser) {
      navigate('/admin/users', { replace: true });
    }
  }, [loading, isNew, id, currentUser, navigate]);

  const set = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  const toggleRole = (roleId: string) => {
    setForm((prev) => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter((id) => id !== roleId)
        : [...prev.role_ids, roleId],
    }));
  };

  const managerOptions = users.filter((u) => u.is_active && u.id !== currentUser?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const phoneError = validateE164PhoneField(form.phone, 'Phone');
    if (phoneError) {
      setError(phoneError);
      return;
    }
    const mobileError = validateE164PhoneField(form.mobile, 'Mobile');
    if (mobileError) {
      setError(mobileError);
      return;
    }
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
        await loadData();
        navigate('/admin/users');
      } else if (currentUser) {
        await admin.updateUser(currentUser.id, {
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
        await loadData();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    if (!confirm(`Delete user "${currentUser.display_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError('');
    try {
      await admin.deleteUser(currentUser.id);
      navigate('/admin/users');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setDeleting(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = `${inputCls} bg-white`;

  if (loading) return <Spinner />;
  if (!isNew && !currentUser) return <Navigate to="/admin/users" replace />;

  return (
    <>
      <PageHeader
        title={isNew ? 'Create User' : 'Edit User'}
        description={
          !isNew && (navInfo.prev || navInfo.next)
            ? 'Use \u2190 / \u2192 to navigate records'
            : undefined
        }
        action={
          <div className="flex items-center gap-2">
            {!isNew && (
              <>
                <button
                  type="button"
                  disabled={!navInfo.prev}
                  onClick={() => navInfo.prev && navigate(`/admin/users/${navInfo.prev}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous user (Left Arrow)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={!navInfo.next}
                  onClick={() => navInfo.next && navigate(`/admin/users/${navInfo.next}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next user (Right Arrow)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              &larr; Back to List
            </button>
          </div>
        }
      />

      <Card className="max-w-5xl">
        {!isNew && currentUser && (
          <p className="text-sm text-gray-500 mb-4">{currentUser.display_name} &middot; {currentUser.email}</p>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

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
                <UserDateInput value={form.start_date} onChange={(value) => set('start_date', value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Last Working Date</label>
                <UserDateInput value={form.last_working_date} onChange={(value) => set('last_working_date', value)} className={inputCls} />
              </div>
            </div>
          </fieldset>

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
            {!isNew && currentUser && (
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 min-w-32">Direct roles:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentUser.roles.length > 0 ? currentUser.roles.map((name) => (
                      <span
                        key={`direct-${name}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                      >
                        {name}
                      </span>
                    )) : (
                      <span className="text-gray-400">None</span>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 min-w-32">Inherited roles:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentUser.inherited_roles.length > 0 ? currentUser.inherited_roles.map((name) => (
                      <span
                        key={`inherited-${name}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"
                      >
                        {name}
                      </span>
                    )) : (
                      <span className="text-gray-400">None</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {form.role_ids.length === 0 && (isNew || !currentUser || currentUser.inherited_roles.length === 0) && (
              <p className="mt-2 text-xs text-amber-600">No roles selected. User will have no permissions.</p>
            )}
          </fieldset>

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

          <div className="flex items-center gap-3 pt-2">
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
              onClick={() => navigate('/admin/users')}
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
      </Card>
    </>
  );
}
