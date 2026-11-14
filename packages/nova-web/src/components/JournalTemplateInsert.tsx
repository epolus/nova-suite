/* SPDX-License-Identifier: AGPL-3.0-only */
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { emailSignatures, emailTemplates } from '@/api/client';

type Props = {
  content: string;
  onContentChange: (value: string) => void;
};

function appendBlock(current: string, block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return current;
  if (!current.trim()) return trimmed;
  return `${current.replace(/\s+$/, '')}\n\n${trimmed}`;
}

/** Insert reply template / append personal signature into a journal compose field. */
export default function JournalTemplateInsert({ content, onContentChange }: Props) {
  const t = useTranslations('pages.incidents.journalForm');
  const locale = useLocale();

  const templatesQuery = useQuery({
    queryKey: ['email-templates', locale || 'all'],
    queryFn: () => emailTemplates.list(locale).then((r) => r.email_templates),
  });

  const signatureQuery = useQuery({
    queryKey: ['email-signature', 'me'],
    queryFn: () => emailSignatures.me().then((r) => r.signature),
  });

  const templates = templatesQuery.data ?? [];
  const signatureBody = signatureQuery.data?.body?.trim() || '';

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <label className="sr-only" htmlFor="journal-insert-template">{t('insertTemplate')}</label>
      <select
        id="journal-insert-template"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          e.target.value = '';
          const tpl = templates.find((row) => row.id === id);
          if (!tpl) return;
          const parts = [tpl.subject?.trim() ? `${tpl.subject.trim()}\n` : '', tpl.body || ''].join('');
          onContentChange(appendBlock(content, parts));
        }}
        className="px-2 py-1 border border-gray-200 rounded-sm text-xs max-w-[12rem]"
        disabled={templates.length === 0}
      >
        <option value="">{templates.length === 0 ? t('noTemplates') : t('insertTemplate')}</option>
        {templates.map((tpl) => (
          <option key={tpl.id} value={tpl.id}>
            {tpl.name}{tpl.locale ? ` (${tpl.locale})` : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!signatureBody}
        title={!signatureBody ? t('noSignature') : undefined}
        onClick={() => onContentChange(appendBlock(content, signatureBody))}
        className="px-2 py-1 border border-gray-200 rounded-sm text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        {t('appendSignature')}
      </button>
    </div>
  );
}
