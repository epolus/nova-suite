/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useRegisterAiAutomationApply,
  useSetAiContext,
} from '../../components/ai/aiAssistantContext';
import { admin as adminApi, catalog, credentials as credentialsApi } from '../../api/client';
import type { AllCatalogTask, AssignmentGroupItem, CatalogTask, ServiceItem, TenantCredentialListItem } from '../../api/client';
import { validateAutomationConfig } from '@nova-suite/shared';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import ServiceItemCombobox from '../../components/ServiceItemCombobox';
import AutomationConfigField from './catalog-tasks/AutomationConfigField';
import { catalogTasksReturnState, TASK_TYPE_VALUES } from './catalog-tasks/automationSnippets';

export default function CatalogTaskDetailPage() {
  const t = useTranslations('pages.admin.catalogTasks.detail');
  const tCatalog = useTranslations('pages.admin.catalogTasks');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const navigate = useNavigate();
  const { serviceItemId = '', taskId = '' } = useParams();
  const isNew = !taskId || taskId === 'new';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showVisualBuilder, setShowVisualBuilder] = useState(false);
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [allCatalogTasks, setAllCatalogTasks] = useState<AllCatalogTask[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const automationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [vaultCreds, setVaultCreds] = useState<TenantCredentialListItem[]>([]);
  const [form, setForm] = useState({
    service_item_id: serviceItemId,
    name: '',
    description: '',
    instructions: '',
    task_type: 'manual',
    task_order: 1,
    assigned_group_id: '',
    sla_hours: '',
    automation_config_json: '{\n  \n}',
  });

  const aiPageContext = useMemo(
    () =>
      !isNew && taskId
        ? { catalogTaskId: taskId, serviceItemId: serviceItemId || form.service_item_id }
        : undefined,
    [isNew, taskId, serviceItemId, form.service_item_id],
  );
  useSetAiContext(aiPageContext);

  const applyAutomationFromAi = useCallback((cfg: Record<string, unknown>) => {
    setForm((prev) => ({
      ...prev,
      automation_config_json: JSON.stringify(cfg, null, 2),
    }));
    setShowVisualBuilder(true);
  }, []);

  useRegisterAiAutomationApply(applyAutomationFromAi);

  useEffect(() => {
    let active = true;
    Promise.all([
      catalog.allItems(),
      catalog.allTasks(),
      adminApi.assignmentGroups().catch(() => ({ assignment_groups: [] })),
      credentialsApi.list().catch(() => ({ credentials: [] as TenantCredentialListItem[] })),
    ]).then(async ([itemsRes, tasksRes, groupsRes, vaultRes]) => {
      if (!active) return;
      const sorted = [...itemsRes.items].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        const c = (a.category_name || '').localeCompare(b.category_name || '');
        if (c !== 0) return c;
        return (a.name || '').localeCompare(b.name || '');
      });
      setItems(sorted);
      setAllCatalogTasks(tasksRes.tasks);
      setGroups(groupsRes.assignment_groups);
      setVaultCreds(vaultRes.credentials);

      const effectiveItemId = serviceItemId || sorted[0]?.id || '';
      if (isNew) {
        setForm((prev) => ({ ...prev, service_item_id: effectiveItemId }));
        setLoading(false);
        return;
      }

      if (!effectiveItemId || !taskId) {
        setError(t('invalidUrl'));
        setLoading(false);
        return;
      }

      const taskRes = await catalog.itemTasks(effectiveItemId);
      const task = taskRes.tasks.find((t) => t.id === taskId);
      if (!task) {
        setError(t('notFound'));
        setLoading(false);
        return;
      }
      setForm({
        service_item_id: effectiveItemId,
        name: task.name,
        description: task.description || '',
        instructions: task.instructions || '',
        task_type: task.task_type,
        task_order: task.task_order,
        assigned_group_id: task.assigned_group_id || '',
        sla_hours: task.sla_hours ? String(task.sla_hours) : '',
        automation_config_json: JSON.stringify(task.automation_config && Object.keys(task.automation_config).length > 0
          ? task.automation_config
          : {}, null, 2),
      });
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError(t('loadFailed'));
      setLoading(false);
    });

    return () => { active = false; };
  }, [serviceItemId, taskId, isNew, t]);

  const selectedItemName = useMemo(
    () => items.find((i) => i.id === form.service_item_id)?.name || t('fallbackTitle'),
    [items, form.service_item_id, t],
  );

  const insertAtCursor = (snippet: string) => {
    const el = automationTextareaRef.current;
    const cur = el?.value ?? form.automation_config_json;
    if (!el) {
      setForm((prev) => ({ ...prev, automation_config_json: `${prev.automation_config_json}${snippet}` }));
      return;
    }
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const next = `${cur.slice(0, start)}${snippet}${cur.slice(end)}`;
    const caret = start + snippet.length;
    setForm((prev) => ({ ...prev, automation_config_json: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const replaceAutomationJson = (json: string) => {
    setForm((prev) => ({ ...prev, automation_config_json: json }));
    requestAnimationFrame(() => {
      const el = automationTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(0, json.length);
      }
    });
  };

  const taskCountsByItemId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of allCatalogTasks) {
      m[t.service_item_id] = (m[t.service_item_id] || 0) + 1;
    }
    return m;
  }, [allCatalogTasks]);

  const handleSave = async () => {
    if (!form.service_item_id || !form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      let automation_config: Record<string, unknown> = {};
      if (form.task_type === 'automated') {
        try {
          const parsed = JSON.parse(form.automation_config_json || '{}') as unknown;
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            setError(t('automationMustBeObject'));
            setSaving(false);
            return;
          }
          automation_config = parsed as Record<string, unknown>;
          const validationErrors = validateAutomationConfig(automation_config);
          if (validationErrors.length > 0) {
            setError(t('automationInvalid', { errors: validationErrors.join('; ') }));
            setSaving(false);
            return;
          }
        } catch {
          setError(t('automationNotJson'));
          setSaving(false);
          return;
        }
      }

      const payload: Partial<CatalogTask> = {
        name: form.name.trim(),
        description: form.description || null,
        instructions: form.instructions || null,
        task_type: form.task_type as CatalogTask['task_type'],
        task_order: form.task_order,
        assigned_group_id: form.assigned_group_id || null,
        sla_hours: form.sla_hours ? parseInt(form.sla_hours, 10) : null,
        automation_config,
      };
      if (isNew) {
        await catalog.createItemTask(form.service_item_id, payload);
      } else {
        await catalog.updateItemTask(form.service_item_id, taskId, payload);
      }
      navigate('/admin/catalog-tasks', {
        state: catalogTasksReturnState(form.service_item_id),
      });
    } catch {
      setError(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const returnListState = catalogTasksReturnState(form.service_item_id || serviceItemId);

  return (
    <>
      <PageHeader
        title={isNew ? t('newTitle') : t('editTitle')}
        description={t('description', { action: isNew ? t('create') : t('update'), item: selectedItemName })}
        action={
          <Link
            to="/admin/catalog-tasks"
            state={returnListState}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {t('backToList')}
          </Link>
        }
      />

      <Card>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('serviceItem')}</label>
            <ServiceItemCombobox
              items={items}
              value={form.service_item_id}
              onChange={(id) => setForm({ ...form, service_item_id: id })}
              taskCounts={taskCountsByItemId}
              disabled={!isNew}
              placeholder={tCatalog('serviceItemPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('taskType')}</label>
            <select
              value={form.task_type}
              onChange={(e) => setForm((prev) => ({ ...prev, task_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TASK_TYPE_VALUES.map((type) => <option key={type} value={type}>{tCatalog(`filters.types.${type}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('name')}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('orderGroup')}</label>
            <input
              type="number"
              min={1}
              value={form.task_order}
              onChange={(e) => setForm({ ...form, task_order: parseInt(e.target.value, 10) || 1 })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('assignedGroup')}</label>
            <select
              value={form.assigned_group_id}
              onChange={(e) => setForm({ ...form, assigned_group_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t('noneOption')}</option>
              {groups.filter((g) => g.is_active).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('slaHours')}</label>
            <input
              type="number"
              min={0}
              value={form.sla_hours}
              onChange={(e) => setForm({ ...form, sla_hours: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={tStates('optional')}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('description')}</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('instructions')}</label>
            <textarea
              rows={4}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          {form.task_type === 'automated' && (
            <AutomationConfigField
              value={form.automation_config_json}
              onChange={(json) => setForm({ ...form, automation_config_json: json })}
              textareaRef={automationTextareaRef}
              onInsertAtCursor={insertAtCursor}
              onReplaceJson={replaceAutomationJson}
              showVisualBuilder={showVisualBuilder}
              onToggleVisualBuilder={() => setShowVisualBuilder((v) => !v)}
              onApplyVisualBuilder={(cfg) =>
                setForm((prev) => ({
                  ...prev,
                  automation_config_json: JSON.stringify(cfg, null, 2),
                }))
              }
              vaultCreds={vaultCreds}
            />
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!form.service_item_id || !form.name.trim() || saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? tActions('saving') : (isNew ? t('createTask') : t('saveChanges'))}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/catalog-tasks', { state: returnListState })}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            {tActions('cancel')}
          </button>
        </div>
      </Card>
    </>
  );
}
