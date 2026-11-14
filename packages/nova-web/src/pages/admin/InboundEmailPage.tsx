/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import {
  admin,
  inboundEmail as inboundEmailApi,
  type AssignmentGroupItem,
  type InboundEmailAction,
  type InboundEmailRule,
  type InboundJournalEntryType,
  type MailboxItem,
} from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import Spinner from '@/components/Spinner';
import { formatDateTime } from '@/utils/dateTime';

type Tab = 'mailboxes' | 'rules';

type MailboxForm = {
  name: string;
  address: string;
  credential_slug: string;
  host: string;
  port: string;
  folder: string;
  assignment_group_id: string;
  poll_interval_seconds: string;
  is_active: boolean;
};

type RuleForm = {
  name: string;
  mailbox_id: string;
  sort_order: string;
  stop_on_match: boolean;
  is_active: boolean;
  match_from_contains: string;
  match_subject_contains: string;
  match_body_contains: string;
  match_has_ticket_ref: boolean;
  match_in_reply_to_known: boolean;
  action: InboundEmailAction;
  require_open_incident: boolean;
  journal_entry_type: InboundJournalEntryType;
};

const emptyMailbox: MailboxForm = {
  name: '',
  address: '',
  credential_slug: '',
  host: '',
  port: '993',
  folder: 'INBOX',
  assignment_group_id: '',
  poll_interval_seconds: '60',
  is_active: true,
};

const emptyRule: RuleForm = {
  name: '',
  mailbox_id: '',
  sort_order: '100',
  stop_on_match: true,
  is_active: true,
  match_from_contains: '',
  match_subject_contains: '',
  match_body_contains: '',
  match_has_ticket_ref: false,
  match_in_reply_to_known: false,
  action: 'update_incident',
  require_open_incident: true,
  journal_entry_type: 'comment',
};

function mailboxToForm(item: MailboxItem): MailboxForm {
  const cfg = item.config && typeof item.config === 'object' ? item.config : {};
  return {
    name: item.name,
    address: item.address,
    credential_slug: item.credential_slug,
    host: String(cfg.host || cfg.imap_host || ''),
    port: String(cfg.port || cfg.imap_port || 993),
    folder: String(cfg.mailbox || cfg.folder || 'INBOX'),
    assignment_group_id: item.assignment_group_id || '',
    poll_interval_seconds: String(item.poll_interval_seconds || 60),
    is_active: item.is_active,
  };
}

function ruleToForm(item: InboundEmailRule): RuleForm {
  return {
    name: item.name,
    mailbox_id: item.mailbox_id || '',
    sort_order: String(item.sort_order ?? 100),
    stop_on_match: item.stop_on_match,
    is_active: item.is_active,
    match_from_contains: item.match_from_contains || '',
    match_subject_contains: item.match_subject_contains || '',
    match_body_contains: item.match_body_contains || '',
    match_has_ticket_ref: item.match_has_ticket_ref,
    match_in_reply_to_known: item.match_in_reply_to_known,
    action: item.action,
    require_open_incident: item.require_open_incident,
    journal_entry_type: item.journal_entry_type,
  };
}

function nextSortOrder(items: InboundEmailRule[]): string {
  const max = items.reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), 0);
  return String(max + 10);
}

export default function InboundEmailPage() {
  const t = useTranslations('pages.admin.inboundEmail');
  const tActions = useTranslations('common.actions');
  const [tab, setTab] = useState<Tab>('mailboxes');
  const [mailboxes, setMailboxes] = useState<MailboxItem[]>([]);
  const [rules, setRules] = useState<InboundEmailRule[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [editingMailboxId, setEditingMailboxId] = useState<string | null>(null);
  const [mailboxForm, setMailboxForm] = useState<MailboxForm>(emptyMailbox);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRule);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    Promise.all([
      inboundEmailApi.mailboxes(),
      inboundEmailApi.rules(),
      admin.assignmentGroups(),
    ])
      .then(([mb, rl, ag]) => {
        setMailboxes(mb.mailboxes);
        setRules(rl.inbound_email_rules);
        setGroups(ag.assignment_groups);
        setError('');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load(true);
  }, [load]);

  const closeMailboxForm = () => {
    setMailboxOpen(false);
    setEditingMailboxId(null);
    setMailboxForm(emptyMailbox);
  };

  const closeRuleForm = () => {
    setRuleOpen(false);
    setEditingRuleId(null);
    setRuleForm(emptyRule);
  };

  const submitMailbox = async () => {
    if (!mailboxForm.name.trim() || !mailboxForm.address.trim() || !mailboxForm.credential_slug.trim()) return;
    if (!mailboxForm.host.trim()) {
      setError(t('hostRequired'));
      return;
    }
    setSaving(true);
    setError('');
    const port = Number.parseInt(mailboxForm.port, 10);
    const poll = Number.parseInt(mailboxForm.poll_interval_seconds, 10);
    const payload = {
      name: mailboxForm.name.trim(),
      address: mailboxForm.address.trim(),
      credential_slug: mailboxForm.credential_slug.trim(),
      config: {
        host: mailboxForm.host.trim(),
        port: Number.isFinite(port) ? port : 993,
        secure: true,
        mailbox: mailboxForm.folder.trim() || 'INBOX',
      },
      assignment_group_id: mailboxForm.assignment_group_id || null,
      poll_interval_seconds: Number.isFinite(poll) ? poll : 60,
      is_active: mailboxForm.is_active,
    };
    try {
      if (editingMailboxId) {
        await inboundEmailApi.updateMailbox(editingMailboxId, payload);
      } else {
        await inboundEmailApi.createMailbox(payload);
      }
      closeMailboxForm();
      load(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const submitRule = async () => {
    if (!ruleForm.name.trim()) return;
    setSaving(true);
    setError('');
    const sortOrder = Number.parseInt(ruleForm.sort_order, 10);
    const payload = {
      name: ruleForm.name.trim(),
      mailbox_id: ruleForm.mailbox_id || null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      stop_on_match: ruleForm.stop_on_match,
      is_active: ruleForm.is_active,
      match_from_contains: ruleForm.match_from_contains.trim() || null,
      match_subject_contains: ruleForm.match_subject_contains.trim() || null,
      match_body_contains: ruleForm.match_body_contains.trim() || null,
      match_has_ticket_ref: ruleForm.match_has_ticket_ref,
      match_in_reply_to_known: ruleForm.match_in_reply_to_known,
      action: ruleForm.action,
      require_open_incident: ruleForm.require_open_incident,
      journal_entry_type: ruleForm.journal_entry_type,
    };
    try {
      if (editingRuleId) {
        await inboundEmailApi.updateRule(editingRuleId, payload);
      } else {
        await inboundEmailApi.createRule(payload);
      }
      closeRuleForm();
      load(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const mailboxName = (id: string | null) => {
    if (!id) return t('allMailboxes');
    return mailboxes.find((m) => m.id === id)?.name || id;
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex gap-2 border-b border-gray-200">
        {(['mailboxes', 'rules'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {key === 'mailboxes' ? t('tabMailboxes') : t('tabRules')}
          </button>
        ))}
      </div>

      {tab === 'mailboxes' && (
        <>
          <div className="mb-4 flex justify-end">
            {!mailboxOpen && (
              <button
                type="button"
                onClick={() => {
                  setEditingMailboxId(null);
                  setMailboxForm(emptyMailbox);
                  setMailboxOpen(true);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                {t('newMailbox')}
              </button>
            )}
          </div>

          {mailboxOpen && (
            <Card className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {editingMailboxId ? t('editMailbox') : t('newMailbox')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('name')}</span>
                  <input
                    value={mailboxForm.name}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('address')}</span>
                  <input
                    value={mailboxForm.address}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, address: e.target.value })}
                    placeholder="support@example.com"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('credentialSlug')}</span>
                  <input
                    value={mailboxForm.credential_slug}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, credential_slug: e.target.value })}
                    placeholder="imap-support"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-500">{t('credentialHint')}</span>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('assignmentGroup')}</span>
                  <select
                    value={mailboxForm.assignment_group_id}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, assignment_group_id: e.target.value })}
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
                    value={mailboxForm.host}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, host: e.target.value })}
                    placeholder="imap.example.com"
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('imapPort')}</span>
                  <input
                    value={mailboxForm.port}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, port: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('folder')}</span>
                  <input
                    value={mailboxForm.folder}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, folder: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('pollInterval')}</span>
                  <input
                    type="number"
                    min={30}
                    max={86400}
                    value={mailboxForm.poll_interval_seconds}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, poll_interval_seconds: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm md:col-span-2 mt-1">
                  <input
                    type="checkbox"
                    checked={mailboxForm.is_active}
                    onChange={(e) => setMailboxForm({ ...mailboxForm, is_active: e.target.checked })}
                  />
                  <span className="font-medium text-gray-700">{t('active')}</span>
                </label>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => void submitMailbox()}
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? tActions('saving') : editingMailboxId ? t('saveMailbox') : t('createMailbox')}
                </button>
                <button type="button" onClick={closeMailboxForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
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
                        setEditingMailboxId(item.id);
                        setMailboxForm(mailboxToForm(item));
                        setMailboxOpen(true);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      {t('editMailbox')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void inboundEmailApi.updateMailbox(item.id, { is_active: !item.is_active }).then(() => load(true))}
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
      )}

      {tab === 'rules' && (
        <>
          <div className="mb-4 flex justify-end">
            {!ruleOpen && (
              <button
                type="button"
                onClick={() => {
                  setEditingRuleId(null);
                  setRuleForm({ ...emptyRule, sort_order: nextSortOrder(rules) });
                  setRuleOpen(true);
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                {t('newRule')}
              </button>
            )}
          </div>

          {ruleOpen && (
            <Card className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {editingRuleId ? t('editRule') : t('newRule')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('name')}</span>
                  <input
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('mailbox')}</span>
                  <select
                    value={ruleForm.mailbox_id}
                    onChange={(e) => setRuleForm({ ...ruleForm, mailbox_id: e.target.value })}
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
                    value={ruleForm.sort_order}
                    onChange={(e) => setRuleForm({ ...ruleForm, sort_order: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-500">{t('sortOrderHint')}</span>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('action')}</span>
                  <select
                    value={ruleForm.action}
                    onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value as InboundEmailAction })}
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
                    value={ruleForm.match_from_contains}
                    onChange={(e) => setRuleForm({ ...ruleForm, match_from_contains: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('matchSubject')}</span>
                  <input
                    value={ruleForm.match_subject_contains}
                    onChange={(e) => setRuleForm({ ...ruleForm, match_subject_contains: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="font-medium text-gray-700">{t('matchBody')}</span>
                  <input
                    value={ruleForm.match_body_contains}
                    onChange={(e) => setRuleForm({ ...ruleForm, match_body_contains: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">{t('journalType')}</span>
                  <select
                    value={ruleForm.journal_entry_type}
                    onChange={(e) => setRuleForm({ ...ruleForm, journal_entry_type: e.target.value as InboundJournalEntryType })}
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
                      checked={ruleForm.match_has_ticket_ref}
                      onChange={(e) => setRuleForm({ ...ruleForm, match_has_ticket_ref: e.target.checked })}
                    />
                    <span>{t('matchTicketRef')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.match_in_reply_to_known}
                      onChange={(e) => setRuleForm({ ...ruleForm, match_in_reply_to_known: e.target.checked })}
                    />
                    <span>{t('matchInReply')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.stop_on_match}
                      onChange={(e) => setRuleForm({ ...ruleForm, stop_on_match: e.target.checked })}
                    />
                    <span>{t('stopOnMatch')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.require_open_incident}
                      onChange={(e) => setRuleForm({ ...ruleForm, require_open_incident: e.target.checked })}
                    />
                    <span>{t('requireOpen')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.is_active}
                      onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                    />
                    <span>{t('active')}</span>
                  </label>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => void submitRule()}
                  disabled={saving || !ruleForm.name.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50"
                >
                  {saving ? tActions('saving') : editingRuleId ? t('saveRule') : t('createRule')}
                </button>
                <button type="button" onClick={closeRuleForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                  {tActions('cancel')}
                </button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {rules.map((item) => (
              <Card key={item.id} className={item.is_active ? '' : 'opacity-60'}>
                <div className="flex items-start justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRuleId(item.id);
                      setRuleForm(ruleToForm(item));
                      setRuleOpen(true);
                    }}
                    className="text-left min-w-0 flex-1"
                  >
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
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRuleId(item.id);
                        setRuleForm(ruleToForm(item));
                        setRuleOpen(true);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      {t('editRule')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void inboundEmailApi.updateRule(item.id, { is_active: !item.is_active }).then(() => load(true))}
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
      )}
    </>
  );
}
