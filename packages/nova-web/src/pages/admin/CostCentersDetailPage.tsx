/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import {
  admin,
  type AdminUser,
  type CostCenterItem,
  type DepartmentItem,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import CostCenterRelatedLists from './cost-centers/CostCenterRelatedLists';

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export default function CostCentersDetailPage() {
  const t = useTranslations('pages.admin.costCenters');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const noneOption = `— ${tStates('none')} —`;
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const location = useLocation();

  const [costCenters, setCostCenters] = useState<CostCenterItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
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

  const fetchData = useCallback(() => {
    return Promise.allSettled([
      admin.costCenters(),
      admin.users(),
      admin.departments(),
    ]).then(([ccRes, usersRes, deptRes]) => {
      setLoadError('');
      if (ccRes.status === 'fulfilled') {
        setCostCenters(ccRes.value.cost_centers);
      } else {
        setCostCenters([]);
        setLoadError(ccRes.reason instanceof Error ? ccRes.reason.message : t('loadFailed'));
      }
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.users);
      else setUsers([]);
      if (deptRes.status === 'fulfilled') setDepartments(deptRes.value.departments);
      else setDepartments([]);
    }).catch((err) => {
      setLoadError(err instanceof Error ? err.message : t('loadDataFailed'));
    }).finally(() => {
      setLoading(false);
    });
  }, [t]);

  const load = useCallback(() => {
    setLoading(true);
    return fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const searchMatch = useCallback((item: CostCenterItem, q: string) => (
    item.code.toLowerCase().includes(q) ||
    item.name.toLowerCase().includes(q) ||
    (item.description?.toLowerCase().includes(q) ?? false) ||
    (item.responsible_user_name?.toLowerCase().includes(q) ?? false)
  ), []);

  const sorted = useMemo(() => {
    let list = costCenters;
    if (activeFilter === 'active') list = list.filter((i) => i.is_active);
    else if (activeFilter === 'inactive') list = list.filter((i) => !i.is_active);
    if (search) list = list.filter((i) => searchMatch(i, search));
    for (const [col, val] of Object.entries(colFilters)) {
      const lower = val.toLowerCase();
      list = list.filter((item) => {
        if (col === '_status') {
          const label = item.is_active ? 'active' : 'inactive';
          return label.startsWith(lower);
        }
        const raw = (item as unknown as Record<string, unknown>)[col];
        return raw != null && String(raw).toLowerCase().startsWith(lower);
      });
    }
    if (!sortBy) return list;
    return [...list].sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortBy];
      const bVal = (b as unknown as Record<string, unknown>)[sortBy];
      const cmp = compareValues(aVal, bVal);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [costCenters, activeFilter, search, searchMatch, colFilters, sortBy, sortDir]);

  const current = useMemo(() => {
    if (isNew || !id) return null;
    return costCenters.find((cc) => cc.id === id) || null;
  }, [isNew, id, costCenters]);

  const navInfo = useMemo(() => {
    if (isNew || !current) return { prev: null, next: null };
    const idx = sorted.findIndex((cc) => cc.id === current.id);
    return {
      prev: idx > 0 ? sorted[idx - 1]!.id : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
    };
  }, [isNew, current, sorted]);

  const relatedDepartments = useMemo(() => {
    if (!current) return [];
    return departments
      .filter((d) => d.cost_center_id === current.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [current, departments]);

  const relatedUsers = useMemo(() => {
    if (!current) return [];
    return users
      .filter((u) => u.cost_center_id === current.id)
      .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
  }, [current, users]);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [responsibleUserId, setResponsibleUserId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const syncKey = isNew ? 'new' : (current?.id ?? null);
  const [prevSyncKey, setPrevSyncKey] = useState<string | null | undefined>(undefined);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (isNew || !current) {
      setCode('');
      setName('');
      setDescription('');
      setResponsibleUserId('');
      setIsActive(true);
    } else {
      setCode(current.code ?? '');
      setName(current.name ?? '');
      setDescription(current.description ?? '');
      setResponsibleUserId(current.responsible_user_id ?? '');
      setIsActive(current.is_active ?? true);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && navInfo.prev) {
        navigate(`/admin/cost-centers/${navInfo.prev}`, { state: location.state });
      }
      if (e.key === 'ArrowRight' && navInfo.next) {
        navigate(`/admin/cost-centers/${navInfo.next}`, { state: location.state });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, navInfo.prev, navInfo.next, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        code,
        name,
        description: description || undefined,
        responsible_user_id: responsibleUserId || null,
        ...(isNew ? {} : { is_active: isActive }),
      };
      if (isNew) {
        const created = await admin.createCostCenter(payload);
        await load();
        navigate(`/admin/cost-centers/${created.id}`, { replace: true, state: location.state });
      } else if (current) {
        await admin.updateCostCenter(current.id, payload);
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
  if (!isNew && !current) {
    return (
      <>
        <PageHeader title={t('notFoundTitle')} />
        <Card>
          <p className="text-sm text-gray-600">{t('notFoundMessage')}</p>
        </Card>
      </>
    );
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-hidden';
  const selectCls = inputCls;
  const responsibleOptions = users
    .filter((u) => u.is_active || u.id === responsibleUserId)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));

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
                  onClick={() => navInfo.prev && navigate(`/admin/cost-centers/${navInfo.prev}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('previousRecord')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={!navInfo.next}
                  onClick={() => navInfo.next && navigate(`/admin/cost-centers/${navInfo.next}`, { state: location.state })}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('nextRecord')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => navigate('/admin/cost-centers', { state: location.state })}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {tActions('cancel')}
            </button>
            <button
              type="submit"
              form="cost-center-detail-form"
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isNew ? t('createCostCenter') : t('saveChanges')}
            </button>
          </div>
        }
      />

      <div className="space-y-4 max-w-5xl">
        <Card>
          <form id="cost-center-detail-form" onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 mb-3">{t('general')}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('code')} *</label>
                  <input
                    required
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t('placeholderCode')}
                    className={inputCls + ' font-mono'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('name')} *</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('placeholderName')}
                    className={inputCls}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('description')}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder={t('placeholderDescription')}
                    className={inputCls + ' resize-none'}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('responsiblePerson')}</label>
                  <select
                    value={responsibleUserId}
                    onChange={(e) => setResponsibleUserId(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">{noneOption}</option>
                    {responsibleOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {!isNew && (
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">{tFields('status')}</legend>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="sr-only peer" />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
                  </div>
                  <span className="text-sm text-gray-700">{isActive ? tStates('active') : tStates('inactive')}</span>
                </label>
              </fieldset>
            )}
          </form>
        </Card>

        {!isNew && current && (
          <CostCenterRelatedLists
            departments={relatedDepartments}
            users={relatedUsers}
          />
        )}
      </div>
    </>
  );
}
