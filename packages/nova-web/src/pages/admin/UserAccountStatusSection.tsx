/* SPDX-License-Identifier: AGPL-3.0-only */
import { useTranslations } from 'use-intl';
import type { AdminUser } from '../../api/client';
import { formatDateTime } from '../../utils/dateTime';
import type { UserFormState } from './userFormHelpers';

function sourceLabel(
  t: ReturnType<typeof useTranslations<'pages.admin.userDetail'>>,
  source: AdminUser['source'],
): string {
  if (source === 'sso') return t('sources.sso');
  if (source === 'import') return t('sources.import');
  if (source === 'datasource') return t('sources.datasource');
  return t('sources.manual');
}

interface UserAccountStatusSectionProps {
  form: UserFormState;
  set: (field: string, value: unknown) => void;
  currentUser: AdminUser | null;
  inputCls: string;
}

export default function UserAccountStatusSection({
  form,
  set,
  currentUser,
  inputCls,
}: UserAccountStatusSectionProps) {
  const t = useTranslations('pages.admin.userDetail');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700 mb-3">{t('sections.accountStatus')}</legend>
      <label className="flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-indigo-600 transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
        </div>
        <span className="text-sm text-gray-700">
          {form.is_active ? t('activeCanLogin') : t('inactiveCannotLogin')}
        </span>
      </label>
      <label className="mt-4 flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            checked={form.locked_out}
            onChange={(e) => set('locked_out', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-gray-200 rounded-full peer-checked:bg-red-600 transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform" />
        </div>
        <span className="text-sm text-gray-700">
          {form.locked_out ? t('lockedCannotLogin') : t('unlockedCanLogin')}
        </span>
      </label>
      {form.locked_out && (
        <div className="mt-3 max-w-md">
          <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('lockReason')}</label>
          <input
            type="text"
            value={form.lock_reason}
            onChange={(e) => set('lock_reason', e.target.value)}
            placeholder={t('placeholders.lockReason')}
            maxLength={200}
            className={inputCls}
          />
          {form.lock_reason === 'failed_logins' && (
            <p className="text-xs text-gray-500 mt-1">{t('lockReasons.failed_logins')}</p>
          )}
          {form.lock_reason === 'admin' && (
            <p className="text-xs text-gray-500 mt-1">{t('lockReasons.admin')}</p>
          )}
        </div>
      )}
      {currentUser && (
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">{tFields('source')}</dt>
            <dd className="text-gray-900 mt-0.5">{sourceLabel(t, currentUser.source)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{tFields('lastLogin')}</dt>
            <dd className="text-gray-900 mt-0.5">{currentUser.last_login_at ? formatDateTime(currentUser.last_login_at) : tStates('none')}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{tFields('lockedAt')}</dt>
            <dd className="text-gray-900 mt-0.5">{currentUser.locked_at ? formatDateTime(currentUser.locked_at) : tStates('none')}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{tFields('failedLoginCount')}</dt>
            <dd className="text-gray-900 mt-0.5">{currentUser.failed_login_count}</dd>
          </div>
        </dl>
      )}
    </fieldset>
  );
}
