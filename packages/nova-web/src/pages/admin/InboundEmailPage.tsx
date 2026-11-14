/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  admin,
  inboundEmail as inboundEmailApi,
  type AssignmentGroupItem,
  type InboundEmailRule,
  type MailboxItem,
} from '@/api/client';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import { INBOUND_EMAIL_QUERY_KEY } from './inboundEmailForms';
import InboundEmailMailboxesPanel from './InboundEmailMailboxesPanel';
import InboundEmailRulesPanel from './InboundEmailRulesPanel';

type Tab = 'mailboxes' | 'rules';

type InboundEmailData = {
  mailboxes: MailboxItem[];
  rules: InboundEmailRule[];
  groups: AssignmentGroupItem[];
};

const EMPTY: InboundEmailData = { mailboxes: [], rules: [], groups: [] };

export default function InboundEmailPage() {
  const t = useTranslations('pages.admin.inboundEmail');
  const [tab, setTab] = useState<Tab>('mailboxes');
  const [actionError, setActionError] = useState('');

  const query = useQuery({
    queryKey: INBOUND_EMAIL_QUERY_KEY,
    queryFn: async (): Promise<InboundEmailData> => {
      const [mb, rl, ag] = await Promise.all([
        inboundEmailApi.mailboxes(),
        inboundEmailApi.rules(),
        admin.assignmentGroups(),
      ]);
      return {
        mailboxes: mb.mailboxes,
        rules: rl.inbound_email_rules,
        groups: ag.assignment_groups,
      };
    },
  });

  const data = query.data ?? EMPTY;
  const loadError = query.error instanceof Error ? query.error.message : query.error ? t('loadFailed') : '';
  const error = actionError || loadError;

  if (query.isLoading) return <Spinner />;

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

      {tab === 'mailboxes' ? (
        <InboundEmailMailboxesPanel
          mailboxes={data.mailboxes}
          groups={data.groups}
          onError={setActionError}
        />
      ) : (
        <InboundEmailRulesPanel
          rules={data.rules}
          mailboxes={data.mailboxes}
          onError={setActionError}
        />
      )}
    </>
  );
}
