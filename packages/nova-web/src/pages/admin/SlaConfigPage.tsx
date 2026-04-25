/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { admin as adminApi, incidents as incidentsApi } from '../../api/client';
import type { SlaDefinition, ServiceListItem } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';

const PROCESS_TYPES = [
  { value: 'incident', label: 'Incident' },
  { value: 'request', label: 'Request' },
  { value: 'task', label: 'Task' },
];

const PROCESS_COLORS: Record<string, string> = {
  incident: 'bg-red-100 text-red-700',
  request: 'bg-blue-100 text-blue-700',
  task: 'bg-purple-100 text-purple-700',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1 – Critical',
  2: 'P2 – High',
  3: 'P3 – Medium',
  4: 'P4 – Low',
  5: 'P5 – Planning',
};

const ALL_WARNING_ACTIONS = [
  { id: 'notify_assignee', label: 'Notify Assignee', description: 'Send notification to the assigned person' },
  { id: 'notify_group_manager', label: 'Notify Group Manager', description: 'Alert the assignment group manager' },
  { id: 'auto_assign', label: 'Auto-Assign', description: 'Automatically assign to an available agent if unassigned' },
];

const ALL_BREACH_ACTIONS = [
  { id: 'escalate_priority', label: 'Escalate Priority', description: 'Increase priority by one level (e.g. P3 → P2)' },
  { id: 'notify_assignee', label: 'Notify Assignee', description: 'Send breach notification to the assigned person' },
  { id: 'notify_group_manager', label: 'Notify Group Manager', description: 'Alert the assignment group manager about the breach' },
  { id: 'reassign', label: 'Reassign', description: 'Reassign to a different agent or group' },
  { id: 'notify_requester', label: 'Notify Requester', description: 'Inform the requester about the SLA breach' },
];

const EMPTY_FORM: Partial<SlaDefinition> = {
  name: '',
  description: '',
  process_type: 'incident',
  condition_priority: null,
  condition_impact: null,
  condition_urgency: null,
  condition_category: null,
  condition_service_id: null,
  resolution_hours: 24,
  response_hours: null,
  auto_close_days: 7,
  warning_pct: 80,
  on_warning: [],
  on_breach: [],
  sort_order: 100,
};

function ActionCheckboxes({
  label,
  available,
  selected,
  onChange,
}: {
  label: string;
  available: { id: string; label: string; description: string }[];
  selected: string[];
  onChange: (actions: string[]) => void;
}) {
  const toggle = (actionId: string) => {
    if (selected.includes(actionId)) {
      onChange(selected.filter((a) => a !== actionId));
    } else {
      onChange([...selected, actionId]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="space-y-2">
        {available.map((action) => (
          <label
            key={action.id}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selected.includes(action.id)
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(action.id)}
              onChange={() => toggle(action.id)}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900">{action.label}</span>
              <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function SlaConfigPage() {
  const [definitions, setDefinitions] = useState<SlaDefinition[]>([]);
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<SlaDefinition>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterProcess, setFilterProcess] = useState<string>('all');

  const load = () => {
    Promise.all([
      adminApi.slaDefinitions(),
      incidentsApi.services().catch(() => ({ services: [] })),
    ]).then(([slaRes, svcRes]) => {
      setDefinitions(slaRes.sla_definitions);
      setServices(svcRes.services);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const filtered = filterProcess === 'all'
    ? definitions
    : definitions.filter((d) => d.process_type === filterProcess);

  const startCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setCreating(true);
  };

  const startEdit = (def: SlaDefinition) => {
    setCreating(false);
    setEditing(def.id);
    setForm({
      name: def.name,
      description: def.description || '',
      process_type: def.process_type,
      condition_priority: def.condition_priority,
      condition_impact: def.condition_impact,
      condition_urgency: def.condition_urgency,
      condition_category: def.condition_category,
      condition_service_id: def.condition_service_id,
      resolution_hours: def.resolution_hours,
      response_hours: def.response_hours,
      auto_close_days: def.auto_close_days ?? 7,
      warning_pct: def.warning_pct,
      on_warning: Array.isArray(def.on_warning) ? def.on_warning : [],
      on_breach: Array.isArray(def.on_breach) ? def.on_breach : [],
      sort_order: def.sort_order,
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) {
        await adminApi.createSlaDefinition(form);
      } else if (editing) {
        await adminApi.updateSlaDefinition(editing, form);
      }
      setEditing(null);
      setCreating(false);
      setLoading(true);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (def: SlaDefinition) => {
    await adminApi.updateSlaDefinition(def.id, { is_active: !def.is_active });
    setLoading(true);
    load();
  };

  const handleDelete = async (def: SlaDefinition) => {
    if (!confirm(`Delete SLA definition "${def.name}"?`)) return;
    await adminApi.deleteSlaDefinition(def.id);
    setLoading(true);
    load();
  };

  if (loading) return <Spinner />;

  const isFormOpen = creating || editing !== null;

  return (
    <>
      <PageHeader
        title="SLA Configuration"
        description="Define service level agreements, trigger conditions, and breach actions."
        action={
          !isFormOpen ? (
            <button
              onClick={startCreate}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + New SLA Definition
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      {!isFormOpen && (
        <div className="flex gap-2 mb-6 flex-wrap items-center">
          <span className="text-sm text-gray-500 mr-1">Process:</span>
          <button
            onClick={() => setFilterProcess('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterProcess === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({definitions.length})
          </button>
          {PROCESS_TYPES.map((pt) => {
            const count = definitions.filter((d) => d.process_type === pt.value).length;
            return (
              <button
                key={pt.value}
                onClick={() => setFilterProcess(pt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filterProcess === pt.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {pt.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Create / Edit Form */}
      {isFormOpen && (
        <Card className="mb-6">
          <h3 className="font-semibold text-gray-900 text-lg mb-4">
            {creating ? 'New SLA Definition' : 'Edit SLA Definition'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="e.g. P1 Critical Incident SLA"
              />
            </div>

            {/* Process type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Process Type</label>
              <select
                value={form.process_type || 'incident'}
                onChange={(e) => setForm({ ...form, process_type: e.target.value as SlaDefinition['process_type'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {PROCESS_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                placeholder="When and how this SLA applies..."
              />
            </div>
          </div>

          {/* Trigger Conditions */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              When to Trigger (Conditions)
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Define when this SLA applies. Leave fields blank for &quot;any&quot;. Multiple conditions are combined with AND.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={form.condition_priority ?? ''}
                  onChange={(e) => setForm({ ...form, condition_priority: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Any priority</option>
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impact</label>
                <select
                  value={form.condition_impact || ''}
                  onChange={(e) => setForm({ ...form, condition_impact: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Any impact</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
                <select
                  value={form.condition_urgency || ''}
                  onChange={(e) => setForm({ ...form, condition_urgency: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Any urgency</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
                <select
                  value={form.condition_service_id || ''}
                  onChange={(e) => setForm({ ...form, condition_service_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Any service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={form.condition_category || ''}
                  onChange={(e) => setForm({ ...form, condition_category: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Any category"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
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
              SLA Timing
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Time (hours) *</label>
                <input
                  type="number"
                  min={1}
                  value={form.resolution_hours ?? 24}
                  onChange={(e) => setForm({ ...form, resolution_hours: parseInt(e.target.value) || 24 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Max time to fully resolve</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Response Time (hours)</label>
                <input
                  type="number"
                  min={1}
                  value={form.response_hours ?? ''}
                  onChange={(e) => setForm({ ...form, response_hours: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Optional"
                />
                <p className="text-xs text-gray-400 mt-1">Max time to first response</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warning Threshold (%)</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={form.warning_pct ?? 80}
                  onChange={(e) => setForm({ ...form, warning_pct: parseInt(e.target.value) || 80 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Trigger warning at this % of resolution time</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auto-Close After Resolved (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.auto_close_days ?? 7}
                  onChange={(e) => setForm({ ...form, auto_close_days: parseInt(e.target.value) || 7 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">If still resolved, close automatically after N days</p>
              </div>
            </div>
          </div>

          {/* Warning Actions */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              On Warning (at {form.warning_pct ?? 80}% of resolution time)
            </h4>
            <ActionCheckboxes
              label=""
              available={ALL_WARNING_ACTIONS}
              selected={form.on_warning || []}
              onChange={(actions) => setForm({ ...form, on_warning: actions })}
            />
          </div>

          {/* Breach Actions */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              On Breach (when resolution time exceeded)
            </h4>
            <ActionCheckboxes
              label=""
              available={ALL_BREACH_ACTIONS}
              selected={form.on_breach || []}
              onChange={(actions) => setForm({ ...form, on_breach: actions })}
            />
          </div>

          {/* Form Actions */}
          <div className="mt-6 flex gap-3 pt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : creating ? 'Create Definition' : 'Update Definition'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* SLA Definitions List */}
      {!isFormOpen && (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No SLA definitions found. Click &quot;+ New SLA Definition&quot; to create one.
            </div>
          ) : (
            filtered.map((def) => (
              <Card
                key={def.id}
                className={`transition-opacity ${!def.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{def.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROCESS_COLORS[def.process_type]}`}>
                        {def.process_type}
                      </span>
                      {!def.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </div>
                    {def.description && (
                      <p className="text-sm text-gray-500 mt-1">{def.description}</p>
                    )}

                    {/* Conditions */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {def.condition_priority && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                          Priority: {PRIORITY_LABELS[def.condition_priority]}
                        </span>
                      )}
                      {def.condition_impact && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                          Impact: {def.condition_impact}
                        </span>
                      )}
                      {def.condition_urgency && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                          Urgency: {def.condition_urgency}
                        </span>
                      )}
                      {def.condition_service_name && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                          Service: {def.condition_service_name}
                        </span>
                      )}
                      {def.condition_category && (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                          Category: {def.condition_category}
                        </span>
                      )}
                    </div>

                    {/* Timing */}
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Resolution: <strong>{def.resolution_hours}h</strong>
                      </span>
                      {def.response_hours && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Response: <strong>{def.response_hours}h</strong>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        Warning at <strong>{def.warning_pct}%</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z" />
                        </svg>
                        Auto-close after <strong>{def.auto_close_days ?? 7}d</strong>
                      </span>
                    </div>

                    {/* Actions summary */}
                    <div className="flex flex-wrap gap-3 mt-3">
                      {Array.isArray(def.on_warning) && def.on_warning.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-yellow-700">On Warning:</span>
                          {def.on_warning.map((a) => (
                            <span key={a} className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">
                              {a.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                      {Array.isArray(def.on_breach) && def.on_breach.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-red-700">On Breach:</span>
                          {def.on_breach.map((a) => (
                            <span key={a} className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                              {a.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(def)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleActive(def)}
                      className={`p-2 rounded-lg transition-colors ${
                        def.is_active
                          ? 'text-green-500 hover:text-red-500 hover:bg-red-50'
                          : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
                      }`}
                      title={def.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {def.is_active ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(def)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </>
  );
}
