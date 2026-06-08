/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { admin as adminApi, incidents as incidentsApi } from '../../api/client';
import type { SlaDefinition, ServiceListItem } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Spinner from '../../components/Spinner';
import { EMPTY_FORM } from './sla/constants';
import SlaForm from './sla/SlaForm';
import SlaList from './sla/SlaList';

export default function SlaConfigPage() {
  const t = useTranslations('pages.admin.slaConfig');

  const processTypes = useMemo(
    () => [
      { value: 'incident', label: t('processTypes.incident') },
      { value: 'request', label: t('processTypes.request') },
      { value: 'task', label: t('processTypes.task') },
    ],
    [t],
  );

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
    if (!confirm(t('form.confirmDeleteNamed', { name: def.name }))) return;
    await adminApi.deleteSlaDefinition(def.id);
    setLoading(true);
    load();
  };

  if (loading) return <Spinner />;

  const isFormOpen = creating || editing !== null;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          !isFormOpen ? (
            <button
              onClick={startCreate}
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              {t('newSla')}
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      {!isFormOpen && (
        <div className="flex gap-2 mb-6 flex-wrap items-center">
          <span className="text-sm text-gray-500 mr-1">{t('processFilter')}</span>
          <button
            onClick={() => setFilterProcess('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterProcess === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('allCount', { count: definitions.length })}
          </button>
          {processTypes.map((pt) => {
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
        <SlaForm
          form={form}
          setForm={setForm}
          creating={creating}
          saving={saving}
          services={services}
          onSave={handleSave}
          onCancel={cancelEdit}
        />
      )}

      {/* SLA Definitions List */}
      {!isFormOpen && (
        <SlaList
          definitions={filtered}
          onEdit={startEdit}
          onToggleActive={handleToggleActive}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
