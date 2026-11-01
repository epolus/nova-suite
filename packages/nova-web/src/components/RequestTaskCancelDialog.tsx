/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';

export default function RequestTaskCancelDialog({
  open,
  reason,
  error,
  loading,
  onReason,
  onConfirm,
  onClose,
}: {
  open: boolean;
  reason: string;
  error: string;
  loading: boolean;
  onReason: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('pages.requests');
  const tActions = useTranslations('common.actions');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-request-title"
        className="w-full max-w-md rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl p-6"
      >
        <h2 id="cancel-request-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('cancelRequestTitle')}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('cancelRequestMessage')}</p>
        <label className="block mt-4 text-xs font-medium text-gray-500 mb-1" htmlFor="cancel-request-reason">
          {t('cancelReason')}
        </label>
        <textarea
          id="cancel-request-reason"
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          rows={3}
          maxLength={4000}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden"
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {tActions('cancel')}
          </Button>
          <Button type="button" variant="warning" onClick={onConfirm} disabled={loading}>
            {loading ? t('cancellingRequest') : t('cancelRequest')}
          </Button>
        </div>
      </div>
    </div>
  );
}
