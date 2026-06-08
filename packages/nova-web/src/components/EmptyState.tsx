/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';

export default function EmptyState({ message }: { message?: string }) {
  const t = useTranslations('common.table');
  const resolvedMessage = message ?? t('noData');
  return (
    <div className="text-center py-12">
      <p className="text-gray-400 text-sm">{resolvedMessage}</p>
    </div>
  );
}
