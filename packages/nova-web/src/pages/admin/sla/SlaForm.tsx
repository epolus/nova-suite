/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { SlaDefinition, ServiceListItem } from '../../../api/client';
import Card from '../../../components/Card';
import ActionCheckboxes from './ActionCheckboxes';

interface SlaFormProps {
  form: Partial<SlaDefinition>;
  setForm: (form: Partial<SlaDefinition>) => void;
  creating: boolean;
  saving: boolean;
  services: ServiceListItem[];
  onSave: () => void;
  onCancel: () => void;
}

export default function SlaForm({ form, setForm, creating, saving, services, onSave, onCancel }: SlaFormProps) {
  const t = useTranslations('pages.admin.slaConfig');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const tImpact = useTranslations('impact');
  const tUrgency = useTranslations('urgency');

  const processTypes = useMemo(
    () => [
      { value: 'incident', label: t('processTypes.incident') },
      { value: 'request', label: t('processTypes.request') },
      { value: 'task', label: t('processTypes.task') },
    ],
    [t],
  );

  const warningActions = useMemo(
    () => [
      { id: 'notify_assignee', label: t('warningActions.notifyAssignee.label'), description: t('warningActions.notifyAssignee.description') },
      { id: 'notify_group_manager', label: t('warningActions.notifyGroupManager.label'), description: t('warningActions.notifyGroupManager.description') },
      { id: 'auto_assign', label: t('warningActions.autoAssign.label'), description: t('warningActions.autoAssign.description') },
    ],
    [t],
  );

  const breachActions = useMemo(
    () => [
      { id: 'escalate_priority', label: t('breachActions.escalatePriority.label'), description: t('breachActions.escalatePriority.description') },
      { id: 'notify_assignee', label: t('breachActions.notifyAssignee.label'), description: t('breachActions.notifyAssignee.description') },
      { id: 'notify_group_manager', label: t('breachActions.notifyGroupManager.label'), description: t('breachActions.notifyGroupManager.description') },
      { id: 'reassign', label: t('breachActions.reassign.label'), description: t('breachActions.reassign.description') },
      { id: 'notify_requester', label: t('breachActions.notifyRequester.label'), description: t('breachActions.notifyRequester.description') },
    ],
    [t],
  );

  const priorityLabel = useCallback(
    (p: number) => t(`priorities.p${p}` as 'priorities.p1'),
    [t],
  );

  return (
    <Card className="mb-6">
      <h3 className="font-semibold text-gray-900 text-lg mb-4">
        {creating ? t('form.newTitle') : t('form.editTitle')}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('name')} *</label>
          <input
            type="text"
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            placeholder={t('form.namePlaceholder')}
          />
        </div>

        {/* Process type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.processType')}</label>
          <select
            value={form.process_type || 'incident'}
            onChange={(e) => setForm({ ...form, process_type: e.target.value as SlaDefinition['process_type'] })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          >
            {processTypes.map((pt) => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('description')}</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            placeholder={t('form.descriptionPlaceholder')}
          />
        </div>
      </div>

      {/* Trigger Conditions */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
          {t('form.triggerConditions')}
        </h4>
        <p className="text-xs text-gray-500 mb-3">
          {t('form.triggerConditionsHint')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('priority')}</label>
            <select
              value={form.condition_priority ?? ''}
              onChange={(e) => setForm({ ...form, condition_priority: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">{t('form.anyPriority')}</option>
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>{priorityLabel(p)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('impact')}</label>
            <select
              value={form.condition_impact || ''}
              onChange={(e) => setForm({ ...form, condition_impact: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">{t('form.anyImpact')}</option>
              <option value="high">{tImpact('high')}</option>
              <option value="medium">{tImpact('medium')}</option>
              <option value="low">{tImpact('low')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('urgency')}</label>
            <select
              value={form.condition_urgency || ''}
              onChange={(e) => setForm({ ...form, condition_urgency: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">{t('form.anyUrgency')}</option>
              <option value="high">{tUrgency('high')}</option>
              <option value="medium">{tUrgency('medium')}</option>
              <option value="low">{tUrgency('low')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('service')}</label>
            <select
              value={form.condition_service_id || ''}
              onChange={(e) => setForm({ ...form, condition_service_id: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">{t('form.anyService')}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('category')}</label>
            <input
              type="text"
              value={form.condition_category || ''}
              onChange={(e) => setForm({ ...form, condition_category: e.target.value || null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder={t('form.anyCategory')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.sortOrder')}</label>
            <input
              type="number"
              value={form.sort_order ?? 100}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 100 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="100"
            />
          </div>
        </div>
      </div>

      {/* SLA Timing */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
          {t('form.slaTiming')}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.resolutionHours')}</label>
            <input
              type="number"
              min={1}
              value={form.resolution_hours ?? 24}
              onChange={(e) => setForm({ ...form, resolution_hours: parseInt(e.target.value) || 24 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t('form.resolutionHoursHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.responseHours')}</label>
            <input
              type="number"
              min={1}
              value={form.response_hours ?? ''}
              onChange={(e) => setForm({ ...form, response_hours: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder={tStates('optional')}
            />
            <p className="text-xs text-gray-400 mt-1">{t('form.responseHoursHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.warningPct')}</label>
            <input
              type="number"
              min={1}
              max={99}
              value={form.warning_pct ?? 80}
              onChange={(e) => setForm({ ...form, warning_pct: parseInt(e.target.value) || 80 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t('form.warningPctHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('form.autoCloseDays')}</label>
            <input
              type="number"
              min={1}
              max={365}
              value={form.auto_close_days ?? 7}
              onChange={(e) => setForm({ ...form, auto_close_days: parseInt(e.target.value) || 7 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">{t('form.autoCloseDaysHint')}</p>
          </div>
        </div>
      </div>

      {/* Warning Actions */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
          {t('form.onWarningAt', { pct: form.warning_pct ?? 80 })}
        </h4>
        <ActionCheckboxes
          label=""
          available={warningActions}
          selected={form.on_warning || []}
          onChange={(actions) => setForm({ ...form, on_warning: actions })}
        />
      </div>

      {/* Breach Actions */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
          {t('form.onBreachWhen')}
        </h4>
        <ActionCheckboxes
          label=""
          available={breachActions}
          selected={form.on_breach || []}
          onChange={(actions) => setForm({ ...form, on_breach: actions })}
        />
      </div>

      {/* Form Actions */}
      <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onSave}
          disabled={saving || !form.name}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? tActions('saving') : creating ? t('form.createDefinition') : t('form.updateDefinition')}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {tActions('cancel')}
        </button>
      </div>
    </Card>
  );
}
