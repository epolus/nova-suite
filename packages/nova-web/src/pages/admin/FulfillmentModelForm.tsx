/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'use-intl';
import type { AssignmentGroupItem, CIClass } from '../../api/client';
import Card from '../../components/Card';
import { controlClass } from './serviceItemFormModel';
import { CI_STATUSES, emptyTask, type FormState, type TaskDraft } from './fulfillmentModelForm';

type Props = {
  title: string;
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  groups: AssignmentGroupItem[];
  classes: CIClass[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
};

export default function FulfillmentModelForm({ title, form, setForm, groups, classes, saving, onClose, onSave }: Props) {
  const t = useTranslations('pages.admin.fulfillmentModels');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');

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

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
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
        <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700">{tActions('cancel')}</button>
        <button type="button" onClick={onSave} disabled={saving} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? tActions('saving') : tActions('save')}
        </button>
      </div>
    </Card>
  );
}
