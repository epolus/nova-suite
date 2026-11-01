/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { admin, catalog, cmdb } from '../../api/client';
import type { AssignmentGroupItem, CIClass, FulfillmentModel, FulfillmentModelConfig } from '../../api/client';
import { fulfillmentGroupTasks } from '../../api/types/catalog';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import { controlClass } from './serviceItemFormModel';

const CI_STATUSES = ['installed', 'in_stock', 'maintenance', 'retired', 'planned'] as const;

type TaskDraft = {
  name: string;
  instructions: string;
  assigned_group_id: string;
  sla_hours: string;
};

type FormState = {
  name: string;
  description: string;
  is_active: boolean;
  tasks: TaskDraft[];
  ci_enabled: boolean;
  class_id: string;
  ci_name_template: string;
  ci_display_name_template: string;
  ci_status: (typeof CI_STATUSES)[number];
  asset_enabled: boolean;
  asset_category: string;
  asset_name_template: string;
  asset_tag_template: string;
};

function emptyTask(name = ''): TaskDraft {
  return { name, instructions: '', assigned_group_id: '', sla_hours: '' };
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    is_active: true,
    tasks: [emptyTask('Fulfill request')],
    ci_enabled: true,
    class_id: '',
    ci_name_template: '{{item.name}} {{request.number}}',
    ci_display_name_template: '{{item.name}} {{request.number}}',
    ci_status: 'installed',
    asset_enabled: false,
    asset_category: 'hardware',
    asset_name_template: '{{item.name}} {{request.number}}',
    asset_tag_template: '{{request.number}}',
  };
}

function formFromModel(model: FulfillmentModel): FormState {
  const config = model.config;
  return {
    name: model.name,
    description: model.description || '',
    is_active: model.is_active,
    tasks: fulfillmentGroupTasks(config).map((task) => ({
      name: task.name || '',
      instructions: task.instructions || '',
      assigned_group_id: task.assigned_group_id || '',
      sla_hours: task.sla_hours ? String(task.sla_hours) : '',
    })),
    ci_enabled: config.ci.enabled,
    class_id: config.ci.class_id || '',
    ci_name_template: config.ci.name_template,
    ci_display_name_template: config.ci.display_name_template,
    ci_status: config.ci.status || 'installed',
    asset_enabled: config.asset.enabled,
    asset_category: config.asset.category || 'hardware',
    asset_name_template: config.asset.name_template,
    asset_tag_template: config.asset.asset_tag_template,
  };
}

function configFromForm(form: FormState): FulfillmentModelConfig {
  return {
    tasks: form.tasks.map((task) => {
      const sla = task.sla_hours.trim() ? Number(task.sla_hours) : null;
      return {
        name: task.name.trim(),
        instructions: task.instructions.trim() || null,
        assigned_group_id: task.assigned_group_id || null,
        sla_hours: sla && Number.isInteger(sla) ? sla : null,
      };
    }),
    ci: {
      enabled: form.ci_enabled,
      class_id: form.class_id || null,
      name_template: form.ci_name_template.trim(),
      display_name_template: form.ci_display_name_template.trim(),
      status: form.ci_status,
    },
    asset: {
      enabled: form.asset_enabled,
      category: form.asset_category.trim() || 'hardware',
      name_template: form.asset_name_template.trim(),
      asset_tag_template: form.asset_tag_template.trim(),
    },
  };
}

export default function FulfillmentModelsPage() {
  const t = useTranslations('pages.admin.fulfillmentModels');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const [models, setModels] = useState<FulfillmentModel[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [classes, setClasses] = useState<CIClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FulfillmentModel | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      catalog.fulfillmentModels(),
      admin.assignmentGroups().catch(() => ({ assignment_groups: [] as AssignmentGroupItem[] })),
      cmdb.classes().catch(() => ({ classes: [] as CIClass[] })),
    ]).then(([modelRes, groupRes, classRes]) => {
      setModels(modelRes.fulfillment_models);
      setGroups(groupRes.assignment_groups);
      setClasses(classRes.classes);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    }).finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { load(); }, [load]);

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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateTask = (index: number, patch: Partial<TaskDraft>) => {
    setForm((current) => ({
      ...current,
      tasks: current.tasks.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)),
    }));
  };

  const moveTask = (index: number, direction: -1 | 1) => {
    setForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.tasks.length) return current;
      const tasks = [...current.tasks];
      const moved = tasks[index];
      if (!moved) return current;
      tasks.splice(index, 1);
      tasks.splice(target, 0, moved);
      return { ...current, tasks };
    });
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
      load();
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
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    }
  };

  const showForm = creating || editing;

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
        <Card>
          <h3 className="font-semibold text-gray-900 mb-1">{editing ? t('editModel', { name: editing.name }) : t('newModel')}</h3>
          <p className="text-sm text-gray-500 mb-4">{t('sequenceHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('name')} *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} className={controlClass(false)} maxLength={255} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('description')}</label>
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} className={controlClass(false)} rows={2} maxLength={2000} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
              {tStates('active')}
            </label>
          </div>

          <fieldset className="mt-6 space-y-3">
            <legend className="text-sm font-semibold text-gray-900">{t('groupTask')}</legend>
            {form.tasks.map((task, index) => (
              <div key={index} className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-500">{t('taskNumber', { number: index + 1 })}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => moveTask(index, -1)} disabled={index === 0} className="text-xs text-gray-600 hover:underline disabled:opacity-40">{t('moveTaskUp')}</button>
                    <button type="button" onClick={() => moveTask(index, 1)} disabled={index === form.tasks.length - 1} className="text-xs text-gray-600 hover:underline disabled:opacity-40">{t('moveTaskDown')}</button>
                    <button type="button" onClick={() => set('tasks', form.tasks.filter((_, taskIndex) => taskIndex !== index))} className="text-xs text-red-600 hover:underline">{t('removeTask')}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('taskName')}</label>
                    <input value={task.name} onChange={(e) => updateTask(index, { name: e.target.value })} className={controlClass(false)} maxLength={200} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('assignmentGroup')}</label>
                    <select value={task.assigned_group_id} onChange={(e) => updateTask(index, { assigned_group_id: e.target.value })} className={controlClass(false)}>
                      <option value="">{t('selectGroup')}</option>
                      {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('instructions')}</label>
                    <textarea value={task.instructions} onChange={(e) => updateTask(index, { instructions: e.target.value })} className={controlClass(false)} rows={2} maxLength={4000} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{t('slaHours')}</label>
                    <input value={task.sla_hours} onChange={(e) => updateTask(index, { sla_hours: e.target.value })} className={controlClass(false)} inputMode="numeric" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => set('tasks', [...form.tasks, emptyTask()])} className="text-sm text-indigo-700 hover:underline">
              {t('addTask')}
            </button>
          </fieldset>

          <fieldset className="mt-6 space-y-3">
            <legend className="text-sm font-semibold text-gray-900">{t('configurationItem')}</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.ci_enabled} onChange={(e) => set('ci_enabled', e.target.checked)} />
              {t('enableCi')}
            </label>
            {form.ci_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('ciClass')}</label>
                  <select value={form.class_id} onChange={(e) => set('class_id', e.target.value)} className={controlClass(false)}>
                    <option value="">{t('selectClass')}</option>
                    {classes.map((ciClass) => <option key={ciClass.id} value={ciClass.id}>{ciClass.display_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('status')}</label>
                  <select value={form.ci_status} onChange={(e) => set('ci_status', e.target.value as FormState['ci_status'])} className={controlClass(false)}>
                    {CI_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('nameTemplate')}</label>
                  <input value={form.ci_name_template} onChange={(e) => set('ci_name_template', e.target.value)} className={controlClass(false)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('displayNameTemplate')}</label>
                  <input value={form.ci_display_name_template} onChange={(e) => set('ci_display_name_template', e.target.value)} className={controlClass(false)} />
                </div>
              </div>
            )}
          </fieldset>

          <fieldset className="mt-6 space-y-3">
            <legend className="text-sm font-semibold text-gray-900">{t('asset')}</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.asset_enabled} onChange={(e) => set('asset_enabled', e.target.checked)} />
              {t('enableAsset')}
            </label>
            {form.asset_enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('assetCategory')}</label>
                  <input value={form.asset_category} onChange={(e) => set('asset_category', e.target.value)} className={controlClass(false)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('assetTagTemplate')}</label>
                  <input value={form.asset_tag_template} onChange={(e) => set('asset_tag_template', e.target.value)} className={controlClass(false)} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('nameTemplate')}</label>
                  <input value={form.asset_name_template} onChange={(e) => set('asset_name_template', e.target.value)} className={controlClass(false)} />
                </div>
              </div>
            )}
          </fieldset>
          <p className="text-xs text-gray-500 mt-4">{t('templateHint')}</p>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={closeForm} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700">{tActions('cancel')}</button>
            <button type="button" onClick={save} disabled={saving} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? tActions('saving') : tActions('save')}
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          {models.length === 0 ? (
            <p className="text-sm text-gray-500">{t('empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">{tFields('name')}</th>
                  <th className="py-2 pr-3 font-medium">{t('does')}</th>
                  <th className="py-2 pr-3 font-medium">{t('items')}</th>
                  <th className="py-2 font-medium">{tFields('status')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.id} className="border-b border-gray-50">
                    <td className="py-2 pr-3">
                      <button type="button" onClick={() => openEdit(model)} className="font-medium text-indigo-700 hover:underline">
                        {model.name}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{summary(model, t)}</td>
                    <td className="py-2 pr-3 text-gray-600">{model.item_count ?? 0}</td>
                    <td className="py-2 text-gray-600">
                      {model.is_active ? tStates('active') : tStates('inactive')}
                      <button type="button" onClick={() => remove(model)} className="ml-3 text-red-600 hover:underline">{tActions('delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </>
  );
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
