/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  inboundEmail as inboundEmailApi,
  type AssignmentGroupItem,
  type MailboxItem,
} from '@/api/client';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { formatDateTime } from '@/utils/dateTime';
import {
  emptyMailbox,
  INBOUND_EMAIL_QUERY_KEY,
  mailboxToForm,
  type MailboxForm,
} from './inboundEmailForms';

type Props = {
  mailboxes: MailboxItem[];
  groups: AssignmentGroupItem[];
  onError: (message: string) => void;
};

export default function InboundEmailMailboxesPanel({ mailboxes, groups, onError }: Props) {
  const t = useTranslations('pages.admin.inboundEmail');
  const tActions = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MailboxForm>(emptyMailbox);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: INBOUND_EMAIL_QUERY_KEY });

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyMailbox);
  };

  const submit = async () => {
    if (!form.name.trim() || !form.address.trim() || !form.credential_slug.trim()) return;
    if (!form.host.trim()) {
      onError(t('hostRequired'));
      return;
    }
    setSaving(true);
    onError('');
    const port = Number.parseInt(form.port, 10);
    const poll = Number.parseInt(form.poll_interval_seconds, 10);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      credential_slug: form.credential_slug.trim(),
      config: {
        host: form.host.trim(),
        port: Number.isFinite(port) ? port : 993,
        secure: true,
        mailbox: form.folder.trim() || 'INBOX',
      },
      assignment_group_id: form.assignment_group_id || null,
      poll_interval_seconds: Number.isFinite(poll) ? poll : 60,
      is_active: form.is_active,
    };
    try {
      if (editingId) await inboundEmailApi.updateMailbox(editingId, payload);
      else await inboundEmailApi.createMailbox(payload);
      closeForm();
      await refresh();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        {!open && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm(emptyMailbox);
              setOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {t('newMailbox')}
          </button>
        )}
      </div>

      {open && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {editingId ? t('editMailbox') : t('newMailbox')}
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
              <span className="font-medium text-gray-700">{t('address')}</span>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="support@example.com"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('credentialSlug')}</span>
              <input
                value={form.credential_slug}
                onChange={(e) => setForm({ ...form, credential_slug: e.target.value })}
                placeholder="imap-support"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">{t('credentialHint')}</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('assignmentGroup')}</span>
              <select
                value={form.assignment_group_id}
                onChange={(e) => setForm({ ...form, assignment_group_id: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">{t('defaultServiceDesk')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('imapHost')}</span>
              <input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="imap.example.com"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('imapPort')}</span>
              <input
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('folder')}</span>
              <input
                value={form.folder}
                onChange={(e) => setForm({ ...form, folder: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('pollInterval')}</span>
              <input
                type="number"
                min={30}
                max={86400}
                value={form.poll_interval_seconds}
                onChange={(e) => setForm({ ...form, poll_interval_seconds: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2 mt-1">
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
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? tActions('saving') : editingId ? t('saveMailbox') : t('createMailbox')}
            </button>
            <button type="button" onClick={closeForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
              {tActions('cancel')}
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {mailboxes.map((item) => (
          <Card key={item.id} className={item.is_active ? '' : 'opacity-60'}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <Badge value={item.address} />
                  {!item.is_active && <Badge value="inactive" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t('credentialSlug')}: {item.credential_slug}
                  {' · '}
                  {t('pollInterval')}: {item.poll_interval_seconds}s
                  {item.last_polled_at && (
                    <>
                      {' · '}
                      {t('lastPolled')}: {formatDateTime(item.last_polled_at)}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setForm(mailboxToForm(item));
                    setOpen(true);
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  {t('editMailbox')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void inboundEmailApi.updateMailbox(item.id, { is_active: !item.is_active })
                      .then(() => refresh())
                      .catch((err: unknown) => onError(err instanceof Error ? err.message : t('saveFailed')));
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  {item.is_active ? t('deactivate') : t('activate')}
                </button>
              </div>
            </div>
          </Card>
        ))}
        {mailboxes.length === 0 && <p className="text-sm text-gray-400">{t('noMailboxes')}</p>}
      </div>
    </>
  );
}
