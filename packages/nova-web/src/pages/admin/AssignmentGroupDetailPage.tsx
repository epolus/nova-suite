/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  admin,
  auth,
  type AssignmentGroupItem,
  type CostCenterItem,
  type ProcessItem,
  type RoleItem,
  type UserListItem,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import ChecklistFieldset from './assignment-groups/ChecklistFieldset';
import { sortAssignmentGroups } from './assignment-groups/groupListSort';

export default function AssignmentGroupDetailPage() {
  const t = useTranslations('pages.admin.assignmentGroupDetail');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const noneOption = `— ${tStates('none')} —`;
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const location = useLocation();

  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([]);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> } | null)?.listParams || {},
    [location.state],
  );
  const activeFilter = listParams.active || 'all';
  const sortBy = listParams.sort_by || '';
  const sortDir = listParams.sort_dir === 'asc' ? 'asc' : 'desc';
  const search = (listParams.search || '').toLowerCase();
  const colFilters = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [key, val] of Object.entries(listParams)) {
      if (key.startsWith('cf.') && val) map[key.slice(3)] = val;
    }
    return map;
  }, [listParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [agRes, uRes, ccRes, pRes, rolesRes] = await Promise.allSettled([
        admin.assignmentGroups(),
        auth.users(),
        admin.costCenters(),
        admin.processes(),
        admin.roles(),
      ]);

      if (agRes.status === 'fulfilled') {
        setGroups(agRes.value.assignment_groups);
      } else {
        setGroups([]);
        setLoadError(agRes.reason instanceof Error ? agRes.reason.message : t('loadFailed'));
      }

      if (uRes.status === 'fulfilled') setUsers(uRes.value.users);
      else setUsers([]);

      if (ccRes.status === 'fulfilled') setCostCenters(ccRes.value.cost_centers);
      else setCostCenters([]);

      if (pRes.status === 'fulfilled') setProcesses(pRes.value.processes);
      else setProcesses([]);

      if (rolesRes.status === 'fulfilled') setRoles(rolesRes.value.roles);
      else setRoles([]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('loadDataFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => sortAssignmentGroups(groups, { activeFilter, search, colFilters, sortBy, sortDir }),
    [groups, activeFilter, search, colFilters, sortBy, sortDir],
  );

  const currentGroup = useMemo(() => {
    if (isNew || !id) return null;
    return groups.find((g) => g.id === id) || null;
  }, [isNew, id, groups]);

  const navInfo = useMemo(() => {
    if (isNew || !currentGroup) return { prev: null, next: null };
    const idx = sorted.findIndex((g) => g.id === currentGroup.id);
    return {
      prev: idx > 0 ? sorted[idx - 1]!.id : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
    };
  }, [isNew, currentGroup, sorted]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [parentGroupId, setParentGroupId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [processIds, setProcessIds] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew || !currentGroup) {
      setName('');
      setDescription('');
      setManagerId('');
      setCostCenterId('');
      setParentGroupId('');
      setIsActive(true);
      setMemberIds([]);
      setProcessIds([]);
      setRoleIds([]);
      return;
    }
    setName(currentGroup.name ?? '');
    setDescription(currentGroup.description ?? '');
    setManagerId(currentGroup.manager_id ?? '');
    setCostCenterId(currentGroup.cost_center_id ?? '');
    setParentGroupId(currentGroup.parent_group_id ?? '');
    setIsActive(currentGroup.is_active ?? true);
    setMemberIds(currentGroup.members?.map((m) => m.id) ?? []);
    setProcessIds(currentGroup.processes?.map((p) => p.id) ?? []);
    setRoleIds(currentGroup.roles?.map((r) => r.id) ?? []);
  }, [isNew, currentGroup]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && navInfo.prev) navigate(`/admin/assignment-groups/${navInfo.prev}`, { state: location.state });
      if (e.key === 'ArrowRight' && navInfo.next) navigate(`/admin/assignment-groups/${navInfo.next}`, { state: location.state });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, navInfo.prev, navInfo.next, navigate, location.state]);

  const toggleMember = (uid: string) => {
    setMemberIds((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  const toggleProcess = (pid: string) => {
    setProcessIds((prev) => (prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]));
  };

  const toggleRole = (rid: string) => {
    setRoleIds((prev) => (prev.includes(rid) ? prev.filter((id) => id !== rid) : [...prev, rid]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name,
        description: description || undefined,
        manager_id: managerId || null,
        cost_center_id: costCenterId || null,
        parent_group_id: parentGroupId || null,
        member_ids: memberIds,
        process_ids: processIds,
        role_ids: roleIds,
        ...(isNew ? {} : { is_active: isActive }),
      };
      if (isNew) {
        const created = await admin.createAssignmentGroup(payload);
        await load();
        navigate(`/admin/assignment-groups/${created.id}`, { replace: true, state: location.state });
      } else if (currentGroup) {
        await admin.updateAssignmentGroup(currentGroup.id, payload);
        await load();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errorOccurred'));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  if (loading) return <Spinner />;
  if (loadError) {
    return (
      <>
        <PageHeader title={t('title')} />
        <Card>
          <p className="text-sm text-red-700">{loadError}</p>
        </Card>
      </>
    );
  }
  if (!isNew && !currentGroup) {
    return (
      <>
        <PageHeader title={t('notFoundTitle')} />
        <Card>
          <p className="text-sm text-gray-600">{t('notFoundMessage')}</p>
        </Card>
      </>
    );
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = inputCls;
  const otherGroups = groups.filter((g) => g.id !== currentGroup?.id);

  return (
    <>
      <PageHeader
        title={isNew ? t('createTitle') : t('editTitle')}
        description={!isNew && (navInfo.prev || navInfo.next) ? t('navigateRecords') : undefined}
        action={
          <div className="flex items-center gap-2">
            {!isNew && (
              <>
                <button
                  type="button"
                  disabled={!navInfo.prev}
                  onClick={() => navInfo.prev && navigate(`/admin/assignment-groups/${navInfo.prev}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('previousGroup')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={!navInfo.next}
                  onClick={() => navInfo.next && navigate(`/admin/assignment-groups/${navInfo.next}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('nextGroup')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => navigate('/admin/assignment-groups')}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('backToList')}
            </button>
          </div>
        }
      />

      <Card className="max-w-5xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-gray-700 mb-3">{t('general')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('name')} *</label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('placeholderName')} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('description')}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t('placeholderDescription')} className={inputCls + ' resize-none'} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-gray-700 mb-3">{t('organization')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('manager')}</label>
                <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={selectCls}>
                  <option value="">{noneOption}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('costCenter')}</label>
                <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className={selectCls}>
                  <option value="">{noneOption}</option>
                  {costCenters.filter((cc) => cc.is_active).map((cc) => (
                    <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('parentGroup')}</label>
                <select value={parentGroupId} onChange={(e) => setParentGroupId(e.target.value)} className={selectCls}>
                  <option value="">{noneOption}</option>
                  {otherGroups.filter((g) => g.is_active).map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          <ChecklistFieldset
            legend={t('members', { count: memberIds.length })}
            options={users.map((u) => ({ id: u.id, label: u.display_name, secondary: u.email }))}
            selectedIds={memberIds}
            onToggle={toggleMember}
          />

          <ChecklistFieldset
            legend={t('processes', { count: processIds.length })}
            options={processes.filter((p) => p.is_active).map((p) => ({ id: p.id, label: p.name }))}
            selectedIds={processIds}
            onToggle={toggleProcess}
            emptyMessage={t('noProcesses')}
          />

          <ChecklistFieldset
            legend={t('roles', { count: roleIds.length })}
            options={roles.filter((r) => r.is_active).map((r) => ({ id: r.id, label: r.name }))}
            selectedIds={roleIds}
            onToggle={toggleRole}
            emptyMessage={t('noRoles')}
          />

          {!isNew && (
            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">{tFields('status')}</legend>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="sr-only peer" />
                  <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                </div>
                <span className="text-sm text-gray-700">{isActive ? tStates('active') : tStates('inactive')}</span>
              </label>
            </fieldset>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/admin/assignment-groups')}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              {tActions('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isNew ? t('createGroup') : t('saveChanges')}
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
