/* SPDX-License-Identifier: AGPL-3.0-only */
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { formatDateTime } from '../../utils/dateTime';
import type { UserListItem, ServiceListItem, CI, Problem } from '../../api/client';
import { useFieldLabel, useImpactUrgencyLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { getInputCls, type IncidentDetailState } from './incidentDetailShared';

export function IncidentSummaryCard({ d }: { d: IncidentDetailState }) {
  const { inc, readonly, fields, setField, requiredFieldMissing, assignmentGroups, groupMembers } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  const { impact: impactLabel, urgency: urgencyLabel } = useImpactUrgencyLabel();
  if (!inc) return null;
  const selectCls = getInputCls(readonly);
  return (
    <Card className="mb-6">
      <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('summary')}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.assignment_group ? 'text-red-600' : 'text-gray-500'}`}>
            {fieldLabel('assignmentGroup')} <span className="text-red-500">*</span>
          </label>
          {readonly ? (
            <p className="text-sm text-gray-900 mt-0.5">{inc.assignment_group_name || tTable('emDash')}</p>
          ) : (
            <select
              value={fields.assignmentGroupId}
              onChange={(e) => { setField('assignmentGroupId', e.target.value); setField('assignedTo', ''); }}
              className={selectCls}
            >
              <option value="">{tIncidents('noneOption')}</option>
              {assignmentGroups.filter((ag) => ag.is_active).map((ag) => (
                <option key={ag.id} value={ag.id}>{ag.name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('assignedTo')}</label>
          {readonly ? (
            <p className="text-sm text-gray-900 mt-0.5">{inc.assigned_to_name || tIncidents('unassigned')}</p>
          ) : (
            <select value={fields.assignedTo} onChange={(e) => setField('assignedTo', e.target.value)} className={selectCls}>
              <option value="">{tIncidents('unassignedOption')}</option>
              {groupMembers.map((u) => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.impact ? 'text-red-600' : 'text-gray-500'}`}>
            {fieldLabel('impact')} <span className="text-red-500">*</span>
          </label>
          {readonly ? (
            <Badge value={inc.impact} />
          ) : (
            <select value={fields.impact} onChange={(e) => setField('impact', e.target.value)} className={selectCls}>
              {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{impactLabel(v)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.urgency ? 'text-red-600' : 'text-gray-500'}`}>
            {fieldLabel('urgency')} <span className="text-red-500">*</span>
          </label>
          {readonly ? (
            <Badge value={inc.urgency} />
          ) : (
            <select value={fields.urgency} onChange={(e) => setField('urgency', e.target.value)} className={selectCls}>
              {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{urgencyLabel(v)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('openTime')}</label>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-900 mt-0.5">{formatDateTime(inc.created_at)}</p>
            <Badge value={inc.status} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('slaDueDate')}</label>
          <p className="text-sm text-gray-900 mt-0.5">{inc.sla_due_at ? formatDateTime(inc.sla_due_at) : tTable('emDash')}</p>
        </div>
        {(fields.status === 'pending' || inc.status === 'pending') && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              {tIncidents('pendingReason')} <span className="text-red-500">*</span>
            </label>
            {readonly ? (
              <p className="text-sm text-gray-900 mt-0.5">{inc.resolution_code || tTable('emDash')}</p>
            ) : (
              <select value={fields.pendingReason} onChange={(e) => setField('pendingReason', e.target.value)} className={selectCls}>
                <option value="">{tIncidents('selectReason')}</option>
                <option value="waiting_for_caller">{tIncidents('pendingReasons.waitingForCaller')}</option>
                <option value="waiting_for_vendor">{tIncidents('pendingReasons.waitingForVendor')}</option>
                <option value="waiting_for_change_window">{tIncidents('pendingReasons.waitingForChangeWindow')}</option>
                <option value="waiting_for_approval">{tIncidents('pendingReasons.waitingForApproval')}</option>
                <option value="waiting_for_dependency">{tIncidents('pendingReasons.waitingForDependency')}</option>
              </select>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export function IncidentCallerCard({ d }: { d: IncidentDetailState }) {
  const { inc, readonly, fields, setField, requiredFieldMissing, users, callerInfo } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  if (!inc) return null;
  const inputCls = getInputCls(readonly);
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('callerProfile')}</h3>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className={`block text-xs font-medium mb-1 ${requiredFieldMissing.caller ? 'text-red-600' : 'text-gray-500'}`}>
            {fieldLabel('caller')} <span className="text-red-500">*</span>
          </label>
          {readonly ? (
            <p className="text-sm font-medium text-gray-900">{inc.caller_name || tTable('emDash')}</p>
          ) : (
            <SearchableDropdown<UserListItem>
              items={users}
              selectedId={fields.callerId}
              onSelect={(id) => setField('callerId', id)}
              onClear={() => setField('callerId', '')}
              getItemId={(u) => u.id}
              getDisplayText={(u) => u.display_name}
              filterFn={(u, q) => {
                const s = q.toLowerCase();
                return u.display_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
              }}
              fallbackDisplayText={inc.caller_name || ''}
              placeholder={tIncidents('searchUser')}
              renderItem={(u) => (
                <>
                  <span className="font-medium">{u.display_name}</span>
                  <span className="text-gray-400 ml-2">{u.email}</span>
                </>
              )}
            />
          )}
        </div>
        {callerInfo?.email && (
          <div>
            <dt className="text-xs text-gray-500">{fieldLabel('email')}</dt>
            <dd className="text-sm text-gray-900 mt-0.5">
              <a href={`mailto:${callerInfo.email}`} className="text-indigo-600 hover:text-indigo-800">{callerInfo.email}</a>
            </dd>
          </div>
        )}
        {(callerInfo?.phone || callerInfo?.mobile) && (
          <div>
            <dt className="text-xs text-gray-500">{fieldLabel('phone')}</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{callerInfo.phone || callerInfo.mobile}</dd>
          </div>
        )}
        {callerInfo?.department && (
          <div>
            <dt className="text-xs text-gray-500">{fieldLabel('department')}</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{callerInfo.department}</dd>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('contactInfo')}</label>
          {readonly ? (
            <p className="text-sm text-gray-900">{inc.contact_info || tTable('emDash')}</p>
          ) : (
            <input type="text" value={fields.contactInfo} onChange={(e) => setField('contactInfo', e.target.value)} placeholder={tIncidents('additionalContactInfo')} className={inputCls} />
          )}
        </div>
      </div>
    </Card>
  );
}

export function IncidentServiceContextCard({ d }: { d: IncidentDetailState }) {
  const { inc, readonly, fields, setField, requiredFieldMissing, services, ciOptions, problemOptions, selectedProblem } = d;
  const tIncidents = useTranslations('pages.incidents');
  const tTable = useTranslations('common.table');
  const fieldLabel = useFieldLabel();
  if (!inc) return null;
  const inputCls = getInputCls(readonly);
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('serviceCiContext')}</h3>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className={`mb-1 ${requiredFieldMissing.service_or_ci ? 'text-red-600' : 'text-gray-500'}`}>
            {fieldLabel('service')} <span className="text-red-500">*</span>
          </dt>
          <dd className="text-gray-900 mt-0.5">
            {readonly ? (
              inc.service_name || tTable('emDash')
            ) : (
              <SearchableDropdown<ServiceListItem>
                items={services}
                selectedId={fields.serviceId}
                onSelect={(id) => setField('serviceId', id)}
                onClear={() => setField('serviceId', '')}
                getItemId={(s) => s.id}
                getDisplayText={(s) => s.name}
                fallbackDisplayText={inc.service_name || ''}
                placeholder={tIncidents('searchService')}
                renderItem={(s) => s.name}
              />
            )}
          </dd>
        </div>
        <div>
          <dt className={`mb-1 ${requiredFieldMissing.service_or_ci ? 'text-red-600' : 'text-gray-500'}`}>
            {tIncidents('configurationItem')} <span className="text-red-500">*</span>
          </dt>
          <dd className="mt-0.5">
            {readonly ? (
              (inc.ci_display_name || inc.ci_name) ? (
                <a href={`/cmdb/${inc.configuration_item_id}`} className="text-indigo-600 font-medium hover:text-indigo-800">
                  {inc.ci_display_name || inc.ci_name}
                </a>
              ) : tTable('emDash')
            ) : (
              <SearchableDropdown<CI>
                items={ciOptions}
                selectedId={fields.configurationItemId}
                onSelect={(id) => setField('configurationItemId', id)}
                onClear={() => setField('configurationItemId', '')}
                getItemId={(ci) => ci.id}
                getDisplayText={(ci) => ci.display_name || ci.name}
                fallbackDisplayText={inc.ci_display_name || inc.ci_name || ''}
                placeholder={tIncidents('searchCi')}
                renderItem={(ci) => ci.display_name || ci.name}
              />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">{fieldLabel('category')}</dt>
          <dd className="text-gray-900 mt-0.5">
            {readonly ? (
              inc.category || tTable('emDash')
            ) : (
              <input type="text" value={fields.category} onChange={(e) => setField('category', e.target.value)} placeholder={fieldLabel('category')} className={inputCls} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">{fieldLabel('subcategory')}</dt>
          <dd className="text-gray-900 mt-0.5">
            {readonly ? (
              inc.subcategory || tTable('emDash')
            ) : (
              <input type="text" value={fields.subcategory} onChange={(e) => setField('subcategory', e.target.value)} placeholder={fieldLabel('subcategory')} className={inputCls} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 mb-1">{tIncidents('relatedProblem')}</dt>
          <dd className="mt-0.5">
            {readonly ? (
              selectedProblem ? (
                <a href={`/problems/${selectedProblem.id}`} className="text-indigo-600 font-medium hover:text-indigo-800">
                  {selectedProblem.number} - {selectedProblem.title}
                </a>
              ) : tTable('emDash')
            ) : (
              <SearchableDropdown<Problem>
                items={problemOptions}
                selectedId={fields.relatedProblemId}
                onSelect={(id) => setField('relatedProblemId', id)}
                onClear={() => setField('relatedProblemId', '')}
                getItemId={(p) => p.id}
                getDisplayText={(p) => `${p.number} - ${p.title}`}
                placeholder={tIncidents('searchProblem')}
                renderItem={(p) => `${p.number} - ${p.title}`}
              />
            )}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
