/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  admin,
  type AdminUser,
  type RoleItem,
  type DepartmentItem,
  type CostCenterItem,
  type CompanyItem,
} from '../../api/client';
import { useInvalidateReferenceData } from '../../hooks/queries';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import UserDetailForm from './UserDetailForm';
import {
  buildDisplayName,
  validateE164PhoneField,
  getSortValue,
  compareValues,
  EMPTY_USER_FORM,
  userToForm,
} from './userFormHelpers';

export default function UserDetailPage() {
  const t = useTranslations('pages.admin.userDetail');
  const tFields = useTranslations('common.fields');

  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const invalidateReference = useInvalidateReferenceData();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> } | null)?.listParams || {},
    [location.state],
  );

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

  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew || !currentUser) {
      setForm(EMPTY_USER_FORM);
      setDisplayNameTouched(false);
      return;
    }
    setForm(userToForm(currentUser));
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
    const phoneError = validateE164PhoneField(form.phone, tFields('phone'));
    if (phoneError) {
      setError(t('validation.phoneInvalid', { field: tFields('phone') }));
      return;
    }
    const mobileError = validateE164PhoneField(form.mobile, t('fields.mobile'));
    if (mobileError) {
      setError(t('validation.phoneInvalid', { field: t('fields.mobile') }));
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        if (!form.password) {
          setError(t('passwordRequired'));
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
        invalidateReference.users();
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
        invalidateReference.users();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errorOccurred'));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!currentUser) return;
    if (!confirm(t('confirmDeleteNamed', { name: currentUser.display_name }))) return;
    setDeleting(true);
    setError('');
    try {
      await admin.deleteUser(currentUser.id);
      invalidateReference.users();
      navigate('/admin/users');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errorOccurred'));
      setDeleting(false);
    }
  };

  if (loading) return <Spinner />;
  if (!isNew && !currentUser) return <Navigate to="/admin/users" replace />;

  return (
    <>
      <PageHeader
        title={isNew ? t('createTitle') : t('editTitle')}
        description={
          !isNew && (navInfo.prev || navInfo.next)
            ? t('navigateRecords')
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
                  title={t('previousUser')}
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
                  title={t('nextUser')}
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
              {t('backToList')}
            </button>
          </div>
        }
      />

      <UserDetailForm
        form={form}
        set={set}
        displayNameTouched={displayNameTouched}
        setDisplayNameTouched={setDisplayNameTouched}
        isNew={isNew}
        currentUser={currentUser}
        companies={companies}
        departments={departments}
        costCenters={costCenters}
        roles={roles}
        managerOptions={managerOptions}
        toggleRole={toggleRole}
        saving={saving}
        deleting={deleting}
        error={error}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onCancel={() => navigate('/admin/users')}
      />
    </>
  );
}
