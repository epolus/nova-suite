/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CatalogTasksListLocationState } from './CatalogTasksPage';
import { admin as adminApi, catalog, credentials as credentialsApi } from '../../api/client';
import type { AllCatalogTask, AssignmentGroupItem, CatalogTask, ServiceItem, TenantCredentialListItem } from '../../api/client';
import { validateAutomationConfig } from '@nova-suite/shared';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import ServiceItemCombobox from '../../components/ServiceItemCombobox';
import UnifiedAutomationDesigner from '../../components/workflow/UnifiedAutomationDesigner';

const TASK_TYPES = [
  { value: 'approval', label: 'Approval' },
  { value: 'manual', label: 'Manual' },
  { value: 'automated', label: 'Automated' },
] as const;

function catalogTasksReturnState(serviceItemId: string | undefined): CatalogTasksListLocationState | undefined {
  if (!serviceItemId) return undefined;
  return { catalogTasksTab: 'by-item', focusServiceItemId: serviceItemId };
}

/** Full automation_config examples (replace editor). */
const AUTOMATION_SNIPPETS: { id: string; label: string; json: string }[] = [
  {
    id: 'state_basic',
    label: 'State machine: single HTTP step',
    json: JSON.stringify(
      {
        kind: 'state_machine',
        startAt: 'check',
        states: [
          {
            id: 'check',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.org/status/200',
            retryAttempts: 2,
            retryBackoffSec: 2,
            transitions: [{ to: 'done', when: 'success' }, { to: 'failed', when: 'failure' }],
            onSuccess: { mergeFormData: { rest_ok: 'true' } },
          },
          { id: 'done', type: 'end', result: 'success' },
          { id: 'failed', type: 'end', result: 'failure', onFailure: { skipTaskOrders: [], rejectRequest: false } },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'state_decision',
    label: 'State machine: decision + delay',
    json: JSON.stringify(
      {
        kind: 'state_machine',
        startAt: 'probe',
        states: [
          {
            id: 'probe',
            type: 'activity',
            method: 'GET',
            url: 'https://httpbin.org/json',
            transitions: [{ to: 'branch' }],
          },
          {
            id: 'branch',
            type: 'decision',
            condition: '{{response.status}}',
            transitions: [{ to: 'pause', when: 'true' }, { to: 'rejected', when: 'false' }],
          },
          { id: 'pause', type: 'delay', delaySeconds: 5, transitions: [{ to: 'approved' }] },
          { id: 'approved', type: 'end', result: 'success' },
          { id: 'rejected', type: 'end', result: 'failure', onFailure: { rejectRequest: true } },
        ],
      },
      null,
      2,
    ),
  },
];

function isEmptyAutomationJson(s: string): boolean {
  try {
    const o = JSON.parse(s || '{}') as unknown;
    return typeof o === 'object' && o !== null && !Array.isArray(o) && Object.keys(o as object).length === 0;
  } catch {
    return false;
  }
}

const TEMPLATE_TOKENS: { label: string; token: string }[] = [
  { label: 'request.number', token: '{{request.number}}' },
  { label: 'request.id', token: '{{request.id}}' },
  { label: 'request.form_data…', token: '{{request.form_data.FIELD}}' },
  { label: 'response.body…', token: '{{response.body}}' },
  { label: 'env var', token: '{{env.VAR_NAME}}' },
  { label: 'vault credential', token: '{{cred.slug}}' },
];

export default function CatalogTaskDetailPage() {
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
        setError('Invalid catalog task URL.');
        setLoading(false);
        return;
      }

      const taskRes = await catalog.itemTasks(effectiveItemId);
      const task = taskRes.tasks.find((t) => t.id === taskId);
      if (!task) {
        setError('Catalog task not found.');
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
      setError('Failed to load catalog task details.');
      setLoading(false);
    });

    return () => { active = false; };
  }, [serviceItemId, taskId, isNew]);

  const selectedItemName = useMemo(
    () => items.find((i) => i.id === form.service_item_id)?.name || 'Catalog Task',
    [items, form.service_item_id],
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
            setError('Automation config must be a JSON object.');
            setSaving(false);
            return;
          }
          automation_config = parsed as Record<string, unknown>;
          const validationErrors = validateAutomationConfig(automation_config);
          if (validationErrors.length > 0) {
            setError(`Automation config is invalid: ${validationErrors.join('; ')}`);
            setSaving(false);
            return;
          }
        } catch {
          setError('Automation config is not valid JSON.');
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
      setError('Failed to save catalog task.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const returnListState = catalogTasksReturnState(form.service_item_id || serviceItemId);

  return (
    <>
      <PageHeader
        title={isNew ? 'New Catalog Task' : 'Catalog Task Detail'}
        description={`${isNew ? 'Create' : 'Update'} task for ${selectedItemName}.`}
        action={
          <Link
            to="/admin/catalog-tasks"
            state={returnListState}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Back to list
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
            <label className="block text-xs font-medium text-gray-500 mb-1">Service item *</label>
            <ServiceItemCombobox
              items={items}
              value={form.service_item_id}
              onChange={(id) => setForm({ ...form, service_item_id: id })}
              taskCounts={taskCountsByItemId}
              disabled={!isNew}
              placeholder="Search and select a service item…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Task Type *</label>
            <select
              value={form.task_type}
              onChange={(e) => setForm((prev) => ({ ...prev, task_type: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TASK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Order Group</label>
            <input
              type="number"
              min={1}
              value={form.task_order}
              onChange={(e) => setForm({ ...form, task_order: parseInt(e.target.value, 10) || 1 })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Group</label>
            <select
              value={form.assigned_group_id}
              onChange={(e) => setForm({ ...form, assigned_group_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- None --</option>
              {groups.filter((g) => g.is_active).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">SLA (hours)</label>
            <input
              type="number"
              min={0}
              value={form.sla_hours}
              onChange={(e) => setForm({ ...form, sla_hours: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">Instructions</label>
            <textarea
              rows={4}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          {form.task_type === 'automated' && (
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Automation (JSON)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Use state-machine format: <code className="bg-gray-100 px-1 rounded">kind: &quot;state_machine&quot;</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">startAt</code>, and <code className="bg-gray-100 px-1 rounded">states[]</code>. Supported state types:{' '}
                <code className="bg-gray-100 px-1 rounded">activity</code>, <code className="bg-gray-100 px-1 rounded">decision</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">delay</code>, <code className="bg-gray-100 px-1 rounded">end</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">action.rest</code>, <code className="bg-gray-100 px-1 rounded">action.ci.lookup</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">action.ci.create</code>, <code className="bg-gray-100 px-1 rounded">decision.advanced</code>.{' '}
                For secrets, use <code className="bg-gray-100 px-1 rounded">{'{{cred.slug}}'}</code> with Admin → Credentials.
              </p>
              <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1.5 mb-2">
                Task-to-task handoff: write values in Task 1 via <code className="bg-white px-1 rounded">mergeFormData</code>, then read them in Task 2 with{' '}
                <code className="bg-white px-1 rounded">{'{{request.form_data.your_key}}'}</code>. Set Task 2 to a higher{' '}
                <code className="bg-white px-1 rounded">task_order</code> so it runs after Task 1.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">Insert example</span>
                {AUTOMATION_SNIPPETS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (!isEmptyAutomationJson(form.automation_config_json)) {
                        const ok = window.confirm(
                          `Replace the current automation JSON with “${s.label}”?`,
                        );
                        if (!ok) return;
                      }
                      replaceAutomationJson(s.json);
                    }}
                    className="px-2 py-1 text-xs font-medium rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-600">Insert at cursor</span>
                <button
                  type="button"
                  onClick={() => setShowVisualBuilder((v) => !v)}
                  className="px-2 py-1 text-xs rounded-md border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
                >
                  {showVisualBuilder ? 'Hide visual builder' : 'Show visual builder'}
                </button>
                {vaultCreds.length > 0 && (
                  <select
                    className="text-xs border border-gray-200 rounded px-2 py-1 max-w-[220px] bg-white"
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) insertAtCursor(`{{cred.${v}}}`);
                      e.target.value = '';
                    }}
                    title="Insert vault credential reference"
                  >
                    <option value="">Vault credential…</option>
                    {vaultCreds.map((c) => (
                      <option key={c.id} value={c.slug}>{c.label} ({c.slug})</option>
                    ))}
                  </select>
                )}
                {TEMPLATE_TOKENS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => insertAtCursor(t.token)}
                    className="px-2 py-1 text-xs rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {showVisualBuilder && (
                <div className="mb-3">
                  <UnifiedAutomationDesigner
                    initialConfigJson={form.automation_config_json}
                    onApply={(cfg) =>
                      setForm((prev) => ({
                        ...prev,
                        automation_config_json: JSON.stringify(cfg, null, 2),
                      }))
                    }
                  />
                </div>
              )}
              <textarea
                ref={automationTextareaRef}
                rows={14}
                value={form.automation_config_json}
                onChange={(e) => setForm({ ...form, automation_config_json: e.target.value })}
                spellCheck={false}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSave}
            disabled={!form.service_item_id || !form.name.trim() || saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : (isNew ? 'Create Task' : 'Save Changes')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/catalog-tasks', { state: returnListState })}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </Card>
    </>
  );
}
