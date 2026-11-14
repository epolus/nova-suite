/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { emailTemplates as emailTemplatesApi, type EmailTemplate } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';

const QUERY_KEY = ['admin', 'email-templates'] as const;

type FormState = {
  name: string;
  subject: string;
  body: string;
  locale: string;
  sort_order: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  name: '',
  subject: '',
  body: '',
  locale: 'en',
  sort_order: '100',
  is_active: true,
};

function formFromTemplate(item: EmailTemplate): FormState {
  return {
    name: item.name,
    subject: item.subject || '',
    body: item.body || '',
    locale: item.locale || 'en',
    sort_order: String(item.sort_order ?? 100),
    is_active: item.is_active,
  };
}

function nextSortOrder(items: EmailTemplate[]): string {
  const max = items.reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), 0);
  return String(max + 10);
}

export default function EmailTemplatesPage() {
  const t = useTranslations('pages.admin.emailTemplates');
  const tActions = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => emailTemplatesApi.adminList(true).then((r) => r.email_templates),
  });

  const items = query.data ?? [];
  const loadError = query.error instanceof Error ? query.error.message : query.error ? t('loadFailed') : '';
  const displayError = error || loadError;

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    const sortOrder = Number.parseInt(form.sort_order, 10);
    const payload = {
      name: form.name.trim(),
      subject: form.subject,
      body: form.body,
      locale: form.locale.trim() || 'en',
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      is_active: form.is_active,
    };
    try {
      if (editingId) await emailTemplatesApi.update(editingId, payload);
      else await emailTemplatesApi.create(payload);
      closeForm();
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={!open ? (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ ...emptyForm, sort_order: nextSortOrder(items) });
              setOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {t('newTemplate')}
          </button>
        ) : undefined}
      />

      {displayError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{displayError}</div>
      )}

      {open && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {editingId ? t('editTemplate') : t('newTemplate')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('name')}</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('locale')}</span>
              <input
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">{t('subject')}</span>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">{t('body')}</span>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={6}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('sortOrder')}</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="font-medium text-gray-700">{t('active')}</span>
            </label>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? tActions('saving') : editingId ? t('saveTemplate') : t('createTemplate')}
            </button>
            <button type="button" onClick={closeForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
              {tActions('cancel')}
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.id} className={item.is_active ? '' : 'opacity-60'}>
            <div className="flex items-start justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  setEditingId(item.id);
                  setForm(formFromTemplate(item));
                  setOpen(true);
                  setError('');
                }}
                className="text-left min-w-0 flex-1"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-500 tabular-nums">#{item.sort_order}</span>
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <Badge value={item.locale} />
                  {!item.is_active && <Badge value="inactive" />}
                </div>
                {item.subject && <p className="text-xs text-gray-500 mt-1">{item.subject}</p>}
                {item.body && (
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2 whitespace-pre-wrap">{item.body}</p>
                )}
              </button>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setForm(formFromTemplate(item));
                    setOpen(true);
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  {t('editTemplate')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void emailTemplatesApi.update(item.id, { is_active: !item.is_active })
                      .then(() => queryClient.invalidateQueries({ queryKey: QUERY_KEY }))
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('saveFailed')));
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  {item.is_active ? t('deactivate') : t('activate')}
                </button>
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="text-sm text-gray-400">{t('empty')}</p>}
      </div>
    </>
  );
}
