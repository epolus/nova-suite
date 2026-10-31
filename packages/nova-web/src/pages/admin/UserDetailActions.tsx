/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';

export function UserDetailActions({
  isNew,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onDelete,
  onCancel,
  deleting,
  saving,
}: {
  isNew: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onDelete: () => void;
  onCancel: () => void;
  deleting: boolean;
  saving: boolean;
}) {
  const t = useTranslations('pages.admin.userDetail');
  const tActions = useTranslations('common.actions');

  return (
    <div className="flex items-center gap-2">
      {!isNew && (
        <>
          <button
            type="button"
            disabled={!hasPrev}
            onClick={onPrev}
            className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('previousUser')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={onNext}
            className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            title={t('nextUser')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      {!isNew && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting || saving}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {deleting ? t('deleting') : tActions('delete')}
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {tActions('cancel')}
      </button>
      <button
        type="submit"
        form="user-detail-form"
        disabled={saving || deleting}
        className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {saving ? tActions('saving') : isNew ? t('createUser') : t('saveChanges')}
      </button>
    </div>
  );
}
