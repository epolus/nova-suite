/* SPDX-License-Identifier: AGPL-3.0-only */
import type {
  UserListItem,
  CI,
  ServiceListItem,
  Problem,
} from '../../api/client';
import Card from '../../components/Card';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { useFieldLabel, useImpactUrgencyLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import type { useNewIncident } from './useNewIncident';

type NewIncidentState = ReturnType<typeof useNewIncident>;

export function NewIncidentForm({ state }: { state: NewIncidentState }) {
  const tIncidents = useTranslations('pages.incidents');
  const fieldLabel = useFieldLabel();
  const { impact: impactLabel, urgency: urgencyLabel } = useImpactUrgencyLabel();
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = inputCls;

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-6 lg:col-start-1">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('callerProfile')}</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('caller')}</label>
              <SearchableDropdown<UserListItem>
                items={state.users}
                selectedId={state.callerId}
                onSelect={state.setCallerId}
                onClear={() => state.setCallerId('')}
                getItemId={(u) => u.id}
                getDisplayText={(u) => u.display_name}
                filterFn={(u, q) => {
                  const s = q.toLowerCase();
                  return u.display_name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
                }}
                placeholder={tIncidents('searchUser')}
                renderItem={(u) => (
                  <>
                    <span className="font-medium">{u.display_name}</span>
                    <span className="text-gray-400 ml-2">{u.email}</span>
                  </>
                )}
              />
            </div>
            {state.selectedCaller?.email && (
              <div>
                <dt className="text-xs text-gray-500">{fieldLabel('email')}</dt>
                <dd className="text-sm text-gray-900 mt-0.5">
                  <a href={`mailto:${state.selectedCaller.email}`} className="text-indigo-600 hover:text-indigo-800">
                    {state.selectedCaller.email}
                  </a>
                </dd>
              </div>
            )}
            {(state.selectedCaller?.phone || state.selectedCaller?.mobile) && (
              <div>
                <dt className="text-xs text-gray-500">{fieldLabel('phone')}</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{state.selectedCaller.phone || state.selectedCaller.mobile}</dd>
              </div>
            )}
            {state.isEss && (
              <div>
                <dt className="text-xs text-gray-500">{tIncidents('assignment')}</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{tIncidents('serviceDesk')}</dd>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('contactInfo')}</label>
              <input
                type="text"
                value={state.contactInfo}
                onChange={(e) => state.setContactInfo(e.target.value)}
                placeholder={tIncidents('contactInfoPlaceholder')}
                className={inputCls}
              />
            </div>
          </div>
        </Card>

        {!state.isEss && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('summary')}</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {fieldLabel('assignmentGroup')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={state.assignmentGroupId}
                  onChange={(e) => { state.setAssignmentGroupId(e.target.value); state.setAssignedTo(''); }}
                  className={selectCls}
                >
                  <option value="">{tIncidents('noneOption')}</option>
                  {state.assignmentGroups.filter((ag) => ag.is_active).map((ag) => (
                    <option key={ag.id} value={ag.id}>{ag.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('assignedTo')}</label>
                <select value={state.assignedTo} onChange={(e) => state.setAssignedTo(e.target.value)} className={selectCls}>
                  <option value="">{tIncidents('unassignedOption')}</option>
                  {state.groupMembers.map((u) => (
                    <option key={u.id} value={u.id}>{u.display_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        )}

        {!state.isEss && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('serviceCiContext')}</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('service')}</label>
                <SearchableDropdown<ServiceListItem>
                  items={state.services}
                  selectedId={state.serviceId}
                  onSelect={state.setServiceId}
                  onClear={() => state.setServiceId('')}
                  getItemId={(s) => s.id}
                  getDisplayText={(s) => s.name}
                  placeholder={tIncidents('searchService')}
                  renderItem={(s) => s.name}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('configurationItem')}</label>
                <SearchableDropdown<CI>
                  items={state.cis}
                  selectedId={state.configItemId}
                  onSelect={state.setConfigItemId}
                  onClear={() => state.setConfigItemId('')}
                  getItemId={(ci) => ci.id}
                  getDisplayText={(ci) => ci.display_name || ci.name}
                  placeholder={tIncidents('searchCi')}
                  renderItem={(ci) => ci.display_name || ci.name}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('category')}</label>
                <input
                  type="text"
                  value={state.category}
                  onChange={(e) => state.setCategory(e.target.value)}
                  placeholder={fieldLabel('category')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('subcategory')}</label>
                <input
                  type="text"
                  value={state.subcategory}
                  onChange={(e) => state.setSubcategory(e.target.value)}
                  placeholder={fieldLabel('subcategory')}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('relatedProblem')}</label>
                <SearchableDropdown<Problem>
                  items={state.problems}
                  selectedId={state.relatedProblemId}
                  onSelect={state.setRelatedProblemId}
                  onClear={() => state.setRelatedProblemId('')}
                  getItemId={(p) => p.id}
                  getDisplayText={(p) => `${p.number} - ${p.title}`}
                  placeholder={tIncidents('searchProblem')}
                  renderItem={(p) => `${p.number} - ${p.title}`}
                />
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="min-w-0 lg:col-start-2">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('incidentDetails')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {fieldLabel('title')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={state.title}
                onChange={(e) => state.setTitle(e.target.value)}
                placeholder={tIncidents('briefSummary')}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('description')}</label>
              <textarea
                value={state.description}
                onChange={(e) => state.setDescription(e.target.value)}
                rows={8}
                className={`${inputCls} resize-none`}
                placeholder={tIncidents('describeIncident')}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('impact')}</label>
                <select value={state.impact} onChange={(e) => state.setImpact(e.target.value)} className={selectCls}>
                  {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{impactLabel(v)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('urgency')}</label>
                <select value={state.urgency} onChange={(e) => state.setUrgency(e.target.value)} className={selectCls}>
                  {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{urgencyLabel(v)}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
