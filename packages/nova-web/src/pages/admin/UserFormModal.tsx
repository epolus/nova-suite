/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { useTranslations } from 'use-intl';
import {
  admin,
  type AdminUser,
  type RoleItem,
  type DepartmentItem,
  type CostCenterItem,
  type CompanyItem,
} from '../../api/client';
import { useInvalidateReferenceData } from '../../hooks/queries';
import UserFormModalFields from './UserFormModalFields';
import { buildDisplayName, toDateOnly } from './userFormHelpers';

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

export default function UserFormModal({
  user, allUsers, roles, departments, costCenters, companies = [],
  onClose, onSaved, onNavigate, onDelete, prevUserId, nextUserId,
}: Props) {
  const t = useTranslations('pages.admin.userDetail');
  const tActions = useTranslations('common.actions');
  const invalidateReference = useInvalidateReferenceData();

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
    start_date: toDateOnly(user?.start_date),
    last_working_date: toDateOnly(user?.last_working_date),
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
      invalidateReference.users();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errorOccurred'));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!confirm(t('confirmDeleteNamed', { name: user.display_name }))) return;
    setDeleting(true);
    setError('');
    try {
      await admin.deleteUser(user.id);
      invalidateReference.users();
      if (onDelete) {
        onDelete(user.id);
      } else {
        onSaved();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errorOccurred'));
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <form onSubmit={handleSubmit}>
          {/* Header with navigation */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl z-10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {isNew ? t('createTitle') : t('editTitle')}
              </h2>
              <div className="flex items-center gap-2">
                {!isNew && onNavigate && (
                  <>
                    <button
                      type="button"
                      disabled={!prevUserId}
                      onClick={() => prevUserId && onNavigate(prevUserId)}
                      className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t('previousUserShort')}
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
                      title={t('nextUserShort')}
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
                  <p className="text-xs text-gray-500 mt-0.5">{t('navigateRecords')}</p>
                )}
              </>
            )}
          </div>

          <UserFormModalFields
            form={form}
            set={set}
            displayNameTouched={displayNameTouched}
            setDisplayNameTouched={setDisplayNameTouched}
            isNew={isNew}
            companies={companies}
            departments={departments}
            costCenters={costCenters}
            roles={roles}
            managerOptions={managerOptions}
            toggleRole={toggleRole}
            error={error}
          />

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center gap-3">
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {deleting ? t('deleting') : tActions('delete')}
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              {tActions('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isNew ? t('createUser') : t('saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
