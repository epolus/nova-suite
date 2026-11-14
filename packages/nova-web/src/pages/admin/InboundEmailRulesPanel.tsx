/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  inboundEmail as inboundEmailApi,
  type InboundEmailAction,
  type InboundEmailRule,
  type InboundJournalEntryType,
  type MailboxItem,
} from '@/api/client';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import {
  emptyRule,
  INBOUND_EMAIL_QUERY_KEY,
  nextSortOrder,
  ruleToForm,
  type RuleForm,
} from './inboundEmailForms';

type Props = {
  rules: InboundEmailRule[];
  mailboxes: MailboxItem[];
  onError: (message: string) => void;
};

export default function InboundEmailRulesPanel({ rules, mailboxes, onError }: Props) {
  const t = useTranslations('pages.admin.inboundEmail');
  const tActions = useTranslations('common.actions');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRule);
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: INBOUND_EMAIL_QUERY_KEY });

  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptyRule);
  };

  const mailboxName = (id: string | null) => {
    if (!id) return t('allMailboxes');
    return mailboxes.find((m) => m.id === id)?.name || id;
  };

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    onError('');
    const sortOrder = Number.parseInt(form.sort_order, 10);
    const payload = {
      name: form.name.trim(),
      mailbox_id: form.mailbox_id || null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      stop_on_match: form.stop_on_match,
      is_active: form.is_active,
      match_from_contains: form.match_from_contains.trim() || null,
      match_subject_contains: form.match_subject_contains.trim() || null,
      match_body_contains: form.match_body_contains.trim() || null,
      match_has_ticket_ref: form.match_has_ticket_ref,
      match_in_reply_to_known: form.match_in_reply_to_known,
      action: form.action,
      require_open_incident: form.require_open_incident,
      journal_entry_type: form.journal_entry_type,
    };
    try {
      if (editingId) await inboundEmailApi.updateRule(editingId, payload);
      else await inboundEmailApi.createRule(payload);
      closeForm();
      await refresh();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: InboundEmailRule) => {
    setEditingId(item.id);
    setForm(ruleToForm(item));
    setOpen(true);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        {!open && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ ...emptyRule, sort_order: nextSortOrder(rules) });
              setOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            {t('newRule')}
          </button>
        )}
      </div>

      {open && (
        <Card className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {editingId ? t('editRule') : t('newRule')}
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
              <span className="font-medium text-gray-700">{t('mailbox')}</span>
              <select
                value={form.mailbox_id}
                onChange={(e) => setForm({ ...form, mailbox_id: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">{t('allMailboxes')}</option>
                {mailboxes.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('sortOrder')}</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="mt-1 block text-xs text-gray-500">{t('sortOrderHint')}</span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('action')}</span>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value as InboundEmailAction })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="update_incident">{t('actionUpdate')}</option>
                <option value="create_incident">{t('actionCreate')}</option>
                <option value="ignore">{t('actionIgnore')}</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('matchFrom')}</span>
              <input
                value={form.match_from_contains}
                onChange={(e) => setForm({ ...form, match_from_contains: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('matchSubject')}</span>
              <input
                value={form.match_subject_contains}
                onChange={(e) => setForm({ ...form, match_subject_contains: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium text-gray-700">{t('matchBody')}</span>
              <input
                value={form.match_body_contains}
                onChange={(e) => setForm({ ...form, match_body_contains: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">{t('journalType')}</span>
              <select
                value={form.journal_entry_type}
                onChange={(e) => setForm({ ...form, journal_entry_type: e.target.value as InboundJournalEntryType })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="comment">{t('journalComment')}</option>
                <option value="work_note">{t('journalWorkNote')}</option>
              </select>
            </label>
            <div className="flex flex-col gap-2 text-sm justify-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.match_has_ticket_ref}
                  onChange={(e) => setForm({ ...form, match_has_ticket_ref: e.target.checked })}
                />
                <span>{t('matchTicketRef')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.match_in_reply_to_known}
                  onChange={(e) => setForm({ ...form, match_in_reply_to_known: e.target.checked })}
                />
                <span>{t('matchInReply')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.stop_on_match}
                  onChange={(e) => setForm({ ...form, stop_on_match: e.target.checked })}
                />
                <span>{t('stopOnMatch')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.require_open_incident}
                  onChange={(e) => setForm({ ...form, require_open_incident: e.target.checked })}
                />
                <span>{t('requireOpen')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                <span>{t('active')}</span>
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? tActions('saving') : editingId ? t('saveRule') : t('createRule')}
            </button>
            <button type="button" onClick={closeForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
              {tActions('cancel')}
            </button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {rules.map((item) => (
          <Card key={item.id} className={item.is_active ? '' : 'opacity-60'}>
            <div className="flex items-start justify-between gap-4">
              <button type="button" onClick={() => startEdit(item)} className="text-left min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-500 tabular-nums">
                    {t('orderLabel', { order: item.sort_order })}
                  </span>
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <Badge value={item.action} />
                  {item.stop_on_match ? <Badge value="stop" /> : <Badge value="continue" />}
                  {!item.is_active && <Badge value="inactive" />}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {mailboxName(item.mailbox_id)}
                  {item.match_has_ticket_ref && ` · ${t('matchTicketRef')}`}
                  {item.require_open_incident && item.action === 'update_incident' && ` · ${t('requireOpen')}`}
                </p>
              </button>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <button type="button" onClick={() => startEdit(item)} className="text-sm text-indigo-600 hover:text-indigo-800">
                  {t('editRule')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void inboundEmailApi.updateRule(item.id, { is_active: !item.is_active })
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
        {rules.length === 0 && <p className="text-sm text-gray-400">{t('noRules')}</p>}
      </div>
    </>
  );
}
