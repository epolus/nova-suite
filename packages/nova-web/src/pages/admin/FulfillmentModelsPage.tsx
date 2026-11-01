/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin, catalog, cmdb } from '../../api/client';
import type { AssignmentGroupItem, CIClass, FulfillmentModel } from '../../api/client';
import { fulfillmentGroupTasks } from '../../api/types/catalog';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import DataTable, { type DataColumnDef } from '../../components/DataTable';
import { useListParams } from '../../hooks/useListParams';
import FulfillmentModelForm from './FulfillmentModelForm';
import { configFromForm, emptyForm, formFromModel, type FormState } from './fulfillmentModelForm';

const DEFAULT_COLS = ['name', 'fulfillment', 'item_count', '_status'];

export default function FulfillmentModelsPage() {
  const t = useTranslations('pages.admin.fulfillmentModels');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const tTable = useTranslations('common.table');
  const { params, setSearch, setSort, setCols, setFilter, setColumnFilter } = useListParams({
    defaultCols: DEFAULT_COLS,
    filterKeys: ['active'],
    storageKey: 'admin_fulfillment_models',
  });
  const [models, setModels] = useState<FulfillmentModel[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [classes, setClasses] = useState<CIClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FulfillmentModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [modelRes, groupRes, classRes] = await Promise.all([
          catalog.fulfillmentModels(),
          admin.assignmentGroups().catch(() => ({ assignment_groups: [] as AssignmentGroupItem[] })),
          cmdb.classes().catch(() => ({ classes: [] as CIClass[] })),
        ]);
        if (!alive) return;
        setModels(modelRes.fulfillment_models);
        setGroups(groupRes.assignment_groups);
        setClasses(classRes.classes);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [t, refreshKey]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm(emptyForm());
    setError(null);
  };

  const openEdit = (model: FulfillmentModel) => {
    setCreating(false);
    setEditing(model);
    setForm(formFromModel(model));
    setError(null);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      is_active: form.is_active,
      config: configFromForm(form),
    };
    try {
      if (editing) await catalog.updateFulfillmentModel(editing.id, payload);
      else await catalog.createFulfillmentModel(payload);
      closeForm();
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (model: FulfillmentModel) => {
    if (!window.confirm(t('confirmDelete', { name: model.name }))) return;
    setError(null);
    try {
      await catalog.deleteFulfillmentModel(model.id);
      if (editing?.id === model.id) closeForm();
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    }
  };

  const showForm = creating || editing;
  const activeFilter = params.filters.active || 'all';

  const filtered = useMemo(() => {
    let list = models;
    if (activeFilter === 'active') list = list.filter((model) => model.is_active);
    else if (activeFilter === 'inactive') list = list.filter((model) => !model.is_active);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((model) => (
        model.name.toLowerCase().includes(q)
        || (model.description || '').toLowerCase().includes(q)
        || (model.ci_class_name || '').toLowerCase().includes(q)
        || summary(model, t).toLowerCase().includes(q)
      ));
    }
    for (const [col, val] of Object.entries(params.columnFilters)) {
      if (!val) continue;
      const lower = val.toLowerCase();
      list = list.filter((model) => String(modelColumnValue(model, col, t)).toLowerCase().startsWith(lower));
    }
    return list;
  }, [models, activeFilter, params.search, params.columnFilters, t]);

  const sorted = useMemo(() => {
    if (!params.sort) return filtered;
    return [...filtered].sort((a, b) => {
      const cmp = compareValues(modelColumnValue(a, params.sort, t), modelColumnValue(b, params.sort, t));
      return params.dir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, params.sort, params.dir, t]);

  const columns = useMemo((): DataColumnDef<FulfillmentModel>[] => [
    {
      key: 'name',
      label: tFields('name'),
      sortable: true,
      render: (model) => <span className="font-medium text-indigo-700">{model.name}</span>,
    },
    {
      key: 'description',
      label: tFields('description'),
      sortable: true,
      defaultVisible: false,
      className: 'max-w-xs truncate',
      render: (model) => <span className="text-gray-500">{model.description || tTable('emDash')}</span>,
    },
    {
      key: 'fulfillment',
      label: t('does'),
      sortable: true,
      render: (model) => <span className="text-gray-600">{summary(model, t)}</span>,
    },
    {
      key: 'ci_class_name',
      label: t('ciClass'),
      sortable: true,
      defaultVisible: false,
      render: (model) => <span className="text-gray-600">{model.ci_class_name || tTable('emDash')}</span>,
    },
    {
      key: 'item_count',
      label: t('items'),
      sortable: true,
      render: (model) => <span className="text-gray-600">{model.item_count ?? 0}</span>,
    },
    {
      key: '_status',
      label: tFields('status'),
      sortable: true,
      render: (model) => (
        <span className="text-gray-600">{model.is_active ? tStates('active') : tStates('inactive')}</span>
      ),
    },
  ], [t, tFields, tStates, tTable]);

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={!showForm ? (
          <button type="button" onClick={openCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            {t('newModel')}
          </button>
        ) : undefined}
      />
      {error && (
        <div role="alert" className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}
      {loading ? <Spinner /> : showForm ? (
        <FulfillmentModelForm
          title={editing ? t('editModel', { name: editing.name }) : t('newModel')}
          form={form}
          setForm={setForm}
          groups={groups}
          classes={classes}
          saving={saving}
          onClose={closeForm}
          onSave={() => { void save(); }}
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="w-full sm:w-80">
              <SearchBar value={params.search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
            </div>
            <div className="flex gap-2 items-center">
              {(['all', 'active', 'inactive'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setFilter('active', filter === 'all' ? '' : filter)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    (activeFilter === filter || (filter === 'all' && !params.filters.active))
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {filter === 'all' ? tStates('all') : filter === 'active' ? tStates('active') : tStates('inactive')}
                </button>
              ))}
            </div>
            <div className="ml-auto text-sm text-gray-500 self-center">
              {t('count', { count: sorted.length })}
            </div>
          </div>
          <DataTable
            columns={columns}
            data={sorted}
            visibleColumns={params.cols}
            onColumnsChange={setCols}
            sortKey={params.sort}
            sortDir={params.dir}
            onSort={setSort}
            columnFilters={params.columnFilters}
            onColumnFilter={setColumnFilter}
            emptyMessage={params.search ? t('emptySearch', { query: params.search }) : t('empty')}
            onRowClick={openEdit}
            rowActions={(model) => (
              <button type="button" onClick={() => remove(model)} className="text-xs text-red-600 hover:underline">
                {tActions('delete')}
              </button>
            )}
          />
        </>
      )}
    </>
  );
}

function modelColumnValue(
  model: FulfillmentModel,
  key: string,
  t: (key: 'summaryTask' | 'summaryCi' | 'summaryAsset', values?: Record<string, string>) => string,
): string | number {
  if (key === '_status') return model.is_active ? 'active' : 'inactive';
  if (key === 'fulfillment') return summary(model, t);
  if (key === 'item_count') return model.item_count ?? 0;
  const raw = (model as unknown as Record<string, unknown>)[key];
  return raw == null ? '' : String(raw);
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

function summary(
  model: FulfillmentModel,
  t: (key: 'summaryTask' | 'summaryCi' | 'summaryAsset', values?: Record<string, string>) => string,
): string {
  const parts: string[] = [];
  for (const [index, task] of fulfillmentGroupTasks(model.config).entries()) {
    const group = model.task_group_names?.[index] || '';
    parts.push(group ? t('summaryTask', { name: task.name, group }) : task.name);
  }
  if (model.config.ci?.enabled) parts.push(t('summaryCi'));
  if (model.config.asset?.enabled) parts.push(t('summaryAsset'));
  return parts.join(' · ');
}
