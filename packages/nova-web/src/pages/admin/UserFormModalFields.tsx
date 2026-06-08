/* SPDX-License-Identifier: AGPL-3.0-only */
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type {
  RoleItem,
  DepartmentItem,
  CostCenterItem,
  CompanyItem,
  AdminUser,
} from '../../api/client';
import UserDateInput from '../../components/UserDateInput';
import type { UserFormState } from './userFormHelpers';

interface UserFormModalFieldsProps {
  form: UserFormState;
  set: (field: string, value: unknown) => void;
  displayNameTouched: boolean;
  setDisplayNameTouched: (value: boolean) => void;
  isNew: boolean;
  companies: CompanyItem[];
  departments: DepartmentItem[];
  costCenters: CostCenterItem[];
  roles: RoleItem[];
  managerOptions: AdminUser[];
  toggleRole: (roleId: string) => void;
  error: string;
}

export default function UserFormModalFields({
  form,
  set,
  displayNameTouched,
  setDisplayNameTouched,
  isNew,
  companies,
  departments,
  costCenters,
  roles,
  managerOptions,
  toggleRole,
  error,
}: UserFormModalFieldsProps) {
  const t = useTranslations('pages.admin.userDetail');
  const tFields = useTranslations('common.fields');
  const tLang = useTranslations('common.language');

  const employeeTypes = useMemo(
    () => [
      { value: 'employee', label: t('employeeTypes.employee') },
      { value: 'contractor', label: t('employeeTypes.contractor') },
      { value: 'vendor', label: t('employeeTypes.vendor') },
      { value: 'intern', label: t('employeeTypes.intern') },
    ],
    [t],
  );

  const languages = useMemo(
    () => [
      { value: 'en', label: tLang('en') },
      { value: 'de', label: tLang('de') },
      { value: 'de-ch', label: tLang('de-ch') },
      { value: 'fr', label: tLang('fr') },
      { value: 'it', label: tLang('it') },
    ],
    [tLang],
  );

  const timeFormats = useMemo(
    () => [
      { value: '24h', label: t('timeFormats.24h') },
      { value: '12h', label: t('timeFormats.12h') },
    ],
    [t],
  );

  const dateFormats = useMemo(
    () => [
      { value: 'YYYY-MM-DD', label: t('dateFormats.iso') },
      { value: 'DD.MM.YYYY', label: t('dateFormats.eu') },
      { value: 'MM/DD/YYYY', label: t('dateFormats.us') },
    ],
    [t],
  );

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = `${inputCls} bg-white`;

  return (
    <div className="px-6 py-5 space-y-6">
      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Identity */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-3">{t('sections.identity')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.firstName')}</label>
            <input type="text" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.lastName')}</label>
            <input type="text" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.employeeId')}</label>
            <input type="text" value={form.user_id} onChange={(e) => set('user_id', e.target.value)} placeholder={t('placeholders.employeeId')} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.displayNameRequired')}</label>
            <input
              required
              type="text"
              value={form.display_name}
              onChange={(e) => { set('display_name', e.target.value); setDisplayNameTouched(true); }}
              placeholder={t('placeholders.displayNameAuto')}
              className={inputCls}
            />
            {!displayNameTouched && (
              <p className="text-xs text-gray-400 mt-1">{t('autoCalculatedHint')}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('jobTitle')}</label>
            <input type="text" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={t('placeholders.jobTitle')} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('email')} *</label>
            <input required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              {isNew ? t('fields.passwordRequired') : t('fields.passwordNew')}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={isNew ? '' : t('placeholders.passwordKeep')}
              className={inputCls}
            />
          </div>
        </div>
      </fieldset>

      {/* Contact */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-3">{t('sections.contact')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('phone')}</label>
            <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('placeholders.phone')} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.mobile')}</label>
            <input type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder={t('placeholders.mobile')} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.locationOffice')}</label>
            <input type="text" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder={t('placeholders.location')} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.timezone')}</label>
            <input type="text" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder={t('placeholders.timezone')} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.preferredLanguage')}</label>
            <select value={form.preferred_language} onChange={(e) => set('preferred_language', e.target.value)} className={selectCls}>
              {languages.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.timeFormat')}</label>
            <select value={form.time_format} onChange={(e) => set('time_format', e.target.value)} className={selectCls}>
              {timeFormats.map((tf) => (
                <option key={tf.value} value={tf.value}>{tf.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.dateFormat')}</label>
            <select value={form.date_format} onChange={(e) => set('date_format', e.target.value)} className={selectCls}>
              {dateFormats.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Employment */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-3">{t('sections.employment')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.employeeType')}</label>
            <select value={form.employee_type} onChange={(e) => set('employee_type', e.target.value)} className={selectCls}>
              {employeeTypes.map((et) => (
                <option key={et.value} value={et.value}>{et.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('company')}</label>
            <select value={form.company} onChange={(e) => set('company', e.target.value)} className={selectCls}>
              <option value="">{t('fields.noneOption')}</option>
              {companies.filter((c) => c.is_active).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.startDate')}</label>
            <UserDateInput value={form.start_date} onChange={(value) => set('start_date', value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{t('fields.lastWorkingDate')}</label>
            <UserDateInput value={form.last_working_date} onChange={(value) => set('last_working_date', value)} className={inputCls} />
          </div>
        </div>
      </fieldset>

      {/* Organization */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-3">{t('sections.organization')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('manager')}</label>
            <select value={form.manager_id} onChange={(e) => set('manager_id', e.target.value)} className={selectCls}>
              <option value="">{t('fields.noneOption')}</option>
              {managerOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('department')}</label>
            <select value={form.department_id} onChange={(e) => set('department_id', e.target.value)} className={selectCls}>
              <option value="">{t('fields.noneOption')}</option>
              {departments.filter((d) => d.is_active).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">{tFields('costCenter')}</label>
            <select value={form.cost_center_id} onChange={(e) => set('cost_center_id', e.target.value)} className={selectCls}>
              <option value="">{t('fields.noneOption')}</option>
              {costCenters.filter((cc) => cc.is_active).map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.code} -- {cc.name}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {/* Roles */}
      <fieldset>
        <legend className="text-sm font-semibold text-gray-700 mb-3">{t('sections.roles')}</legend>
        <div className="flex flex-wrap gap-2">
          {roles.filter((r) => r.is_active).map((role) => {
            const selected = form.role_ids.includes(role.id);
            return (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  selected
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {selected && <span className="mr-1">&#10003;</span>}
                {role.name}
                {role.description && (
                  <span className={`ml-1 ${selected ? 'text-indigo-200' : 'text-gray-400'}`}>
                    -- {role.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {form.role_ids.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">{t('noRolesSelected')}</p>
        )}
      </fieldset>

      {/* Account Status (edit only) */}
      {!isNew && (
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
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
            </div>
            <span className="text-sm text-gray-700">
              {form.is_active ? t('activeCanLogin') : t('inactiveCannotLogin')}
            </span>
          </label>
        </fieldset>
      )}
    </div>
  );
}
