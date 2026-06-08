/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  incidents as incidentsApi,
  knowledge as knowledgeApi,
  problems as problemsApi,
} from '../../api/client';
import { admin as adminApi, cmdb as cmdbApi } from '../../api/client';
import type {
  UserListItem,
  AssignmentGroupItem,
  CI,
  ServiceListItem,
  Problem,
} from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { Button } from '../../components/ui/button';
import { useAuth } from '../../context/AuthContext';
import { isAgentRole } from '../../utils/roles';
import { useFieldLabel, useImpactUrgencyLabel } from '@/i18n/hooks';
import { useTranslations } from 'use-intl';
import { NewIncidentSidebar } from './NewIncidentSidebar';

export default function NewIncident() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEss = !isAgentRole(user?.roles);
  const tIncidents = useTranslations('pages.incidents');
  const tActions = useTranslations('common.actions');
  const fieldLabel = useFieldLabel();
  const { impact: impactLabel, urgency: urgencyLabel } = useImpactUrgencyLabel();

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('medium');
  const [urgency, setUrgency] = useState('medium');
  const [callerId, setCallerId] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [configItemId, setConfigItemId] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [relatedProblemId, setRelatedProblemId] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sidebar intelligence
  const [similarIncidents, setSimilarIncidents] = useState<import('../../api/client').SimilarIncident[]>([]);
  const [kbSuggestions, setKbSuggestions] = useState<import('../../api/client').KnowledgeSuggestion[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroupItem[]>([]);
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [cis, setCis] = useState<CI[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);

  useEffect(() => {
    if (!user) return;
    incidentsApi.callers().then((res) => setUsers(res.users)).catch(() => {
      setUsers([{
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        user_id: null,
        roles: user.roles || [],
      }]);
    });
    if (!isEss) {
      adminApi.assignmentGroups().then((res) => setAssignmentGroups(res.assignment_groups)).catch(() => {});
      incidentsApi.services().then((res) => setServices(res.services)).catch(() => {});
      cmdbApi.items({ status: 'active' }, 1, 100).then((res) => setCis(res.items)).catch(() => {});
      problemsApi.list({}, 1, 100).then((res) => setProblems(res.problems)).catch(() => {});
    }
  }, [user, isEss]);

  useEffect(() => {
    if (!user || callerId) return;
    setCallerId(user.id);
  }, [user, callerId]);

  const selectedCaller = users.find((u) => u.id === callerId);
  const groupMembers = useMemo(() => {
    if (!assignmentGroupId) return users;
    const group = assignmentGroups.find((g) => g.id === assignmentGroupId);
    if (!group || !group.members.length) return users;
    const memberIds = new Set(group.members.map((m) => m.id));
    return users.filter((u) => memberIds.has(u.id));
  }, [assignmentGroupId, assignmentGroups, users]);

  // Trigger sidebar search when title or description changes (debounced), only if sidebar is open
  useEffect(() => {
    if (!sidebarOpen) return;
    const text = (title + ' ' + description).trim();
    if (!text) { setSimilarIncidents([]); setKbSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingSidebar(true);
      try {
        const [simRes, kbRes] = await Promise.all([
          incidentsApi.similarByText({ title, description, limit: 6 }),
          knowledgeApi.suggestionsByText({ title, description, category: isEss ? undefined : category, limit: 6 }),
        ]);
        setSimilarIncidents(simRes.incidents);
        setKbSuggestions(kbRes.articles);
      } catch {
        // silently ignore
      } finally {
        setLoadingSidebar(false);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [title, description, sidebarOpen, category, isEss]);

  const handleSubmit = async () => {
    setError('');
    if (!user) { setError(tIncidents('mustBeSignedIn')); return; }
    if (!title.trim()) { setError(tIncidents('titleRequired')); return; }
    if (!isEss && !assignmentGroupId) { setError(tIncidents('assignmentGroupRequired')); return; }
    setSubmitting(true);
    try {
      const createPayload = {
        title,
        description: description || undefined,
        impact: impact as any,
        urgency: urgency as any,
        caller_id: callerId || user.id,
        contact_info: contactInfo || undefined,
        ...(isEss
          ? {}
          : {
            assignment_group_id: assignmentGroupId || undefined,
            assigned_to: assignedTo || undefined,
            service_id: serviceId || undefined,
            configuration_item_id: configItemId || undefined,
            category: category || undefined,
            subcategory: subcategory || undefined,
          }),
      } as any;
      const res = isEss
        ? await incidentsApi.createEss(createPayload)
        : await incidentsApi.create(createPayload);
      if (!isEss && relatedProblemId) {
        await incidentsApi.relateProblem(res.id, relatedProblemId, 'related_to');
      }
      navigate(`/incidents/${res.id}`);
    } catch (err: any) {
      setError(err.message || tIncidents('createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = inputCls;

  return (
    <>
      <PageHeader
        title={tIncidents('newIncident')}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? tIncidents('creating') : tIncidents('createIncident')}
            </Button>
            <Button variant="outline" onClick={() => setSidebarOpen((p) => !p)}>
              {sidebarOpen ? tIncidents('hideInsights') : tIncidents('showInsights')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/incidents')}>{tActions('cancel')}</Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      <div className={sidebarOpen ? 'xl:flex xl:items-start xl:gap-6' : ''}>
        <div className="min-w-0 flex-1">

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">

            {/* ── Left pane ── */}
            <div className="space-y-6 lg:col-start-1">

              {/* Caller Profile */}
              <Card>
                <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('callerProfile')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('caller')}</label>
                    <SearchableDropdown<UserListItem>
                      items={users}
                      selectedId={callerId}
                      onSelect={setCallerId}
                      onClear={() => setCallerId('')}
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
                  {selectedCaller?.email && (
                    <div>
                      <dt className="text-xs text-gray-500">{fieldLabel('email')}</dt>
                      <dd className="text-sm text-gray-900 mt-0.5">
                        <a href={`mailto:${selectedCaller.email}`} className="text-indigo-600 hover:text-indigo-800">
                          {selectedCaller.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  {(selectedCaller?.phone || selectedCaller?.mobile) && (
                    <div>
                      <dt className="text-xs text-gray-500">{fieldLabel('phone')}</dt>
                      <dd className="text-sm text-gray-900 mt-0.5">{selectedCaller.phone || selectedCaller.mobile}</dd>
                    </div>
                  )}
                  {isEss && (
                    <div>
                      <dt className="text-xs text-gray-500">{tIncidents('assignment')}</dt>
                      <dd className="text-sm text-gray-900 mt-0.5">{tIncidents('serviceDesk')}</dd>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('contactInfo')}</label>
                    <input
                      type="text"
                      value={contactInfo}
                      onChange={(e) => setContactInfo(e.target.value)}
                      placeholder={tIncidents('contactInfoPlaceholder')}
                      className={inputCls}
                    />
                  </div>
                </div>
              </Card>

              {!isEss && (
                <Card>
                  <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('summary')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {fieldLabel('assignmentGroup')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={assignmentGroupId}
                        onChange={(e) => { setAssignmentGroupId(e.target.value); setAssignedTo(''); }}
                        className={selectCls}
                      >
                        <option value="">{tIncidents('noneOption')}</option>
                        {assignmentGroups.filter((ag) => ag.is_active).map((ag) => (
                          <option key={ag.id} value={ag.id}>{ag.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('assignedTo')}</label>
                      <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={selectCls}>
                        <option value="">{tIncidents('unassignedOption')}</option>
                        {groupMembers.map((u) => (
                          <option key={u.id} value={u.id}>{u.display_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </Card>
              )}

              {!isEss && (
                <Card>
                  <h3 className="font-semibold text-gray-900 mb-4">{tIncidents('serviceCiContext')}</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('service')}</label>
                      <SearchableDropdown<ServiceListItem>
                        items={services}
                        selectedId={serviceId}
                        onSelect={setServiceId}
                        onClear={() => setServiceId('')}
                        getItemId={(s) => s.id}
                        getDisplayText={(s) => s.name}
                        placeholder={tIncidents('searchService')}
                        renderItem={(s) => s.name}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('configurationItem')}</label>
                      <SearchableDropdown<CI>
                        items={cis}
                        selectedId={configItemId}
                        onSelect={setConfigItemId}
                        onClear={() => setConfigItemId('')}
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
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder={fieldLabel('category')}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('subcategory')}</label>
                      <input
                        type="text"
                        value={subcategory}
                        onChange={(e) => setSubcategory(e.target.value)}
                        placeholder={fieldLabel('subcategory')}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{tIncidents('relatedProblem')}</label>
                      <SearchableDropdown<Problem>
                        items={problems}
                        selectedId={relatedProblemId}
                        onSelect={setRelatedProblemId}
                        onClear={() => setRelatedProblemId('')}
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

            {/* ── Center pane ── */}
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
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={tIncidents('briefSummary')}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('description')}</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={8}
                      className={`${inputCls} resize-none`}
                      placeholder={tIncidents('describeIncident')}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('impact')}</label>
                      <select value={impact} onChange={(e) => setImpact(e.target.value)} className={selectCls}>
                        {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{impactLabel(v)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">{fieldLabel('urgency')}</label>
                      <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className={selectCls}>
                        {['low', 'medium', 'high'].map((v) => <option key={v} value={v}>{urgencyLabel(v)}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Intelligence Sidebar ── */}
        {sidebarOpen && (
          <NewIncidentSidebar
            similarIncidents={similarIncidents}
            kbSuggestions={kbSuggestions}
            loadingSidebar={loadingSidebar}
            navigate={navigate}
          />
        )}
      </div>
    </>
  );
}

