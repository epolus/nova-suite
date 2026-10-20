/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { alerts as alertsApi } from '@/api/client';
import type { AlertDefinition, AssignmentGroupItem } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';

const emptyForm = {
  name: '',
  source: '',
  severity: 'critical',
  action: 'incident' as AlertDefinition['action'],
  impact: 'high',
  urgency: 'high',
  assignment_group_id: '',
};

export default function AlertDefinitionsPage() {
  const t = useTranslations('pages.alerts');
  const tActions = useTranslations('common.actions');
  const [items, setItems] = useState<AlertDefinition[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    Promise.all([alertsApi.definitions(), alertsApi.assignmentGroups()])
      .then(([defs, groupRes]) => {
        setItems(defs.alert_definitions);
        setGroups(groupRes.assignment_groups);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('loadFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([alertsApi.definitions(), alertsApi.assignmentGroups()])
      .then(([defs, groupRes]) => {
        if (cancelled) return;
        setItems(defs.alert_definitions);
        setGroups(groupRes.assignment_groups);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await alertsApi.createDefinition({
        name: form.name.trim(),
        source: form.source.trim() || null,
        severity: form.severity || null,
        action: form.action,
        impact: form.action === 'incident' ? form.impact : null,
        urgency: form.action === 'incident' ? form.urgency : null,
        assignment_group_id: form.assignment_group_id || null,
      });
      setForm(emptyForm);
      setOpen(false);
      load(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('definitionsTitle')}
        description={t('definitionsDescription')}
        action={!open ? (
          <button type="button" onClick={() => setOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            {t('newDefinition')}
          </button>
        ) : undefined}
      />
      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {open && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('name')}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('source')}</span>
              <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder={t('sourcePlaceholder')} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('severityMatch')}</span>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">{t('anySeverity')}</option>
                <option value="critical">critical</option>
                <option value="warning">warning</option>
                <option value="info">info</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('action')}</span>
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as AlertDefinition['action'] })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="incident">{t('actionIncident')}</option>
                <option value="workflow">{t('actionWorkflow')}</option>
                <option value="none">{t('actionNone')}</option>
              </select>
            </label>
            {form.action === 'incident' && (
              <>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('group')}</span>
                  <select value={form.assignment_group_id} onChange={(e) => setForm({ ...form, assignment_group_id: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{t('groupFromCi')}</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('impact')}</span>
                  <select value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => void submit()} disabled={saving || !form.name.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? tActions('saving') : t('createDefinition')}
            </button>
            <button type="button" onClick={() => { setOpen(false); setForm(emptyForm); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">{tActions('cancel')}</button>
          </div>
        </Card>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className={item.is_active ? '' : 'opacity-60'}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <Badge value={item.action} />
                  {item.severity && <Badge value={item.severity} />}
                </div>
                <p className="text-xs text-gray-500 mt-1">{item.source || t('anySource')} · {item.workflow_key || item.impact || t('actionNone')}</p>
              </div>
              <button
                type="button"
                onClick={() => void alertsApi.updateDefinition(item.id, { is_active: !item.is_active }).then(() => load(true))}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                {item.is_active ? t('deactivate') : t('activate')}
              </button>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400">{t('noDefinitions')}</p>}
      </div>
    </>
  );
}
