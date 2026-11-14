/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  checklists as checklistsApi,
  type ChecklistEntityType,
  type ChecklistTemplate,
} from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const QUERY_KEY = ['admin', 'checklist-templates'] as const;

type ItemDraft = { label: string; required: boolean };

type FormState = {
  name: string;
  entity_type: ChecklistEntityType;
  description: string;
  is_active: boolean;
  items: ItemDraft[];
};

const emptyForm: FormState = {
  name: '',
  entity_type: 'incident',
  description: '',
  is_active: true,
  items: [{ label: '', required: true }],
};

function formFromTemplate(tpl: ChecklistTemplate): FormState {
  return {
    name: tpl.name,
    entity_type: tpl.entity_type,
    description: tpl.description || '',
    is_active: tpl.is_active,
    items: tpl.items.length > 0
      ? tpl.items.map((i) => ({ label: i.label, required: i.required }))
      : [{ label: '', required: false }],
  };
}

export default function ChecklistsPage() {
  const t = useTranslations('pages.admin.checklists');
  const tActions = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => checklistsApi.adminList(true).then((r) => r.checklist_templates),
  });

  const items = query.data ?? [];
  const loadError = query.error instanceof Error ? query.error.message : query.error ? t('loadFailed') : '';
  const displayError = error || loadError;

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (tpl: ChecklistTemplate) => {
    setEditingId(tpl.id);
    setForm(formFromTemplate(tpl));
    setOpen(true);
  };

  const submit = async () => {
    const cleanedItems = form.items
      .map((item, index) => ({
        label: item.label.trim(),
        required: item.required,
        sort_order: index * 10,
      }))
      .filter((item) => item.label.length > 0);
    if (!form.name.trim() || cleanedItems.length === 0) {
      setError(t('validation'));
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      entity_type: form.entity_type,
      description: form.description.trim() || null,
      is_active: form.is_active,
      items: cleanedItems,
    };
    try {
      if (editingId) {
        await checklistsApi.adminUpdate(editingId, payload);
      } else {
        await checklistsApi.adminCreate(payload);
      }
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (tpl: ChecklistTemplate) => {
    if (!window.confirm(t('deactivateConfirm', { name: tpl.name }))) return;
    setError('');
    try {
      await checklistsApi.adminDelete(tpl.id);
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    }
  };

  if (query.isLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={<Button type="button" onClick={openCreate}>{t('add')}</Button>}
      />

      {displayError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {displayError}
        </div>
      )}

      {open && (
        <Card className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {editingId ? t('editTitle') : t('createTitle')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-800">
              {t('name')}
              <input
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-gray-800">
              {t('entityType')}
              <select
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                value={form.entity_type}
                disabled={Boolean(editingId)}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  entity_type: e.target.value as ChecklistEntityType,
                }))}
              >
                <option value="incident">{t('entityIncident')}</option>
                <option value="change">{t('entityChange')}</option>
              </select>
            </label>
            <label className="md:col-span-2 text-sm font-medium text-gray-800">
              {t('description')}
              <textarea
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, is_active: checked === true }))}
              />
              {t('active')}
            </label>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">{t('items')}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((p) => ({
                  ...p,
                  items: [...p.items, { label: '', required: false }],
                }))}
              >
                {t('addItem')}
              </Button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={index} className="flex flex-wrap items-center gap-3">
                  <input
                    className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder={t('itemLabel')}
                    value={item.label}
                    onChange={(e) => setForm((p) => ({
                      ...p,
                      items: p.items.map((row, i) => (
                        i === index ? { ...row, label: e.target.value } : row
                      )),
                    }))}
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <Checkbox
                      checked={item.required}
                      onCheckedChange={(checked) => setForm((p) => ({
                        ...p,
                        items: p.items.map((row, i) => (
                          i === index ? { ...row, required: checked === true } : row
                        )),
                      }))}
                    />
                    {t('required')}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm((p) => ({
                      ...p,
                      items: p.items.filter((_, i) => i !== index),
                    }))}
                    disabled={form.items.length <= 1}
                  >
                    {tActions('delete')}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? t('saving') : tActions('save')}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>{tActions('cancel')}</Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        {items.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((tpl) => (
              <li key={tpl.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{tpl.name}</p>
                    <Badge value={tpl.is_active ? 'active' : 'inactive'} />
                    <Badge value={tpl.entity_type} />
                  </div>
                  {tpl.description && (
                    <p className="mt-1 text-sm text-gray-600">{tpl.description}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500">
                    {t('itemCount', {
                      count: tpl.items.length,
                      required: tpl.items.filter((i) => i.required).length,
                    })}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {tpl.items.map((item) => (
                      <li key={item.id} className="text-sm text-gray-700">
                        • {item.label}
                        {item.required && (
                          <span className="ml-1 text-xs text-amber-700">{t('required')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(tpl)}>
                    {tActions('edit')}
                  </Button>
                  {tpl.is_active && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => deactivate(tpl)}>
                      {t('deactivate')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
