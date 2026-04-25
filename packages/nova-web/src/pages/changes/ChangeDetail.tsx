/* SPDX-License-Identifier: AGPL-3.0-only */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { changes, cmdb, incidents, problems } from '../../api/client';
import type { AssignmentGroupItem, Change, ChangeApproval, ChangeConflict, ChangeDetail, ChangeType, CI, Incident, Problem, StandardChangeTemplate } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../../utils/dateTime';

type FormState = {
  change_type_id: string;
  standard_change_id: string;
  category: string;
  title: string;
  description: string;
  reason_for_change: string;
  risk_level: Change['risk_level'];
  impact: string;
  impact_description: string;
  implementation_plan: string;
  backout_plan: string;
  test_plan: string;
  assigned_to: string;
  assignment_group_id: string;
  scheduled_start: string;
  scheduled_end: string;
  maintenance_window: string;
  downtime_required: boolean;
  related_problem_id: string;
  related_incident_id: string;
  priority: Change['priority'];
  business_justification: string;
  estimated_cost: string;
  review_notes: string;
  affected_cis: string[];
};

const EMPTY_FORM: FormState = {
  change_type_id: '',
  standard_change_id: '',
  category: '',
  title: '',
  description: '',
  reason_for_change: '',
  risk_level: 'medium',
  impact: 'medium',
  impact_description: '',
  implementation_plan: '',
  backout_plan: '',
  test_plan: '',
  assigned_to: '',
  assignment_group_id: '',
  scheduled_start: '',
  scheduled_end: '',
  maintenance_window: '',
  downtime_required: false,
  related_problem_id: '',
  related_incident_id: '',
  priority: 'medium',
  business_justification: '',
  estimated_cost: '',
  review_notes: '',
  affected_cis: [],
};

export default function ChangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const listParams: Record<string, string> = (location.state as { listParams?: Record<string, string> })?.listParams || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [change, setChange] = useState<ChangeDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [types, setTypes] = useState<ChangeType[]>([]);
  const [templates, setTemplates] = useState<StandardChangeTemplate[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [cis, setCis] = useState<CI[]>([]);
  const [incidentsList, setIncidentsList] = useState<Incident[]>([]);
  const [problemsList, setProblemsList] = useState<Problem[]>([]);
  const [approvals, setApprovals] = useState<ChangeApproval[]>([]);
  const [conflicts, setConflicts] = useState<ChangeConflict[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'planning' | 'implementation' | 'review'>('overview');
  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [typesRes, templatesRes, groupsRes, ciRes, incRes, prbRes] = await Promise.all([
        changes.types(),
        changes.standardTemplates(),
        changes.assignmentGroups(),
        cmdb.items({ status: 'active' }, 1, 100),
        incidents.list({ status: 'new' }, 1, 100),
        problems.list({}, 1, 100),
      ]);
      setTypes(typesRes.change_types);
      setTemplates(templatesRes.templates);
      setGroups(groupsRes.assignment_groups);
      setCis(ciRes.items);
      setIncidentsList(incRes.incidents);
      setProblemsList(prbRes.problems);

      if (isNew) {
        setChange(null);
        setForm({
          ...EMPTY_FORM,
          change_type_id: typesRes.change_types[0]?.id || '',
        });
        setApprovals([]);
        setConflicts([]);
        setPrevId(null);
        setNextId(null);
      } else if (id) {
        const [detail, nav, conflictRes] = await Promise.all([
          changes.get(id),
          changes.nav(id, listParams),
          changes.conflicts(id),
        ]);
        setChange(detail);
        setApprovals(detail.approvals || []);
        setConflicts(conflictRes.conflicts || detail.conflicts || []);
        setForm({
          change_type_id: detail.change_type_id,
          standard_change_id: detail.standard_change_id || '',
          category: detail.category || '',
          title: detail.title,
          description: detail.description,
          reason_for_change: detail.reason_for_change,
          risk_level: detail.risk_level,
          impact: detail.impact,
          impact_description: detail.impact_description || '',
          implementation_plan: detail.implementation_plan,
          backout_plan: detail.backout_plan,
          test_plan: detail.test_plan || '',
          assigned_to: detail.assigned_to || '',
          assignment_group_id: detail.assignment_group_id || '',
          scheduled_start: detail.scheduled_start ? detail.scheduled_start.slice(0, 16) : '',
          scheduled_end: detail.scheduled_end ? detail.scheduled_end.slice(0, 16) : '',
          maintenance_window: detail.maintenance_window || '',
          downtime_required: detail.downtime_required,
          related_problem_id: detail.related_problem_id || '',
          related_incident_id: detail.related_incident_id || '',
          priority: detail.priority,
          business_justification: detail.business_justification || '',
          estimated_cost: detail.estimated_cost != null ? String(detail.estimated_cost) : '',
          review_notes: detail.review_notes || '',
          affected_cis: (detail.affected_cis || []).map((x) => x.ci_id),
        });
        setPrevId(nav.prev_id);
        setNextId(nav.next_id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load change');
    } finally {
      setLoading(false);
    }
  }, [id, isNew, JSON.stringify(listParams)]);

  useEffect(() => {
    load();
  }, [load]);

  const goTo = useCallback((targetId: string) => {
    navigate(`/changes/${targetId}`, { state: { listParams }, replace: true });
  }, [navigate, listParams]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId);
      if (e.key === 'ArrowRight' && nextId) goTo(nextId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, goTo]);

  const templateOptions = useMemo(
    () => templates.filter((t) => t.change_type_id === form.change_type_id && t.is_active),
    [templates, form.change_type_id],
  );
  const hasRequiredFields =
    !!form.change_type_id &&
    !!form.title.trim();

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setForm((p) => ({
      ...p,
      standard_change_id: tpl.id,
      category: tpl.category || p.category,
      implementation_plan: tpl.implementation_plan_template || p.implementation_plan,
      backout_plan: tpl.backout_plan_template || p.backout_plan,
      test_plan: tpl.test_plan_template || p.test_plan,
      risk_level: tpl.pre_assessed_risk,
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        change_type_id: form.change_type_id,
        standard_change_id: form.standard_change_id || null,
        category: form.category || undefined,
        title: form.title,
        description: form.description,
        reason_for_change: form.reason_for_change,
        risk_level: form.risk_level,
        impact: form.impact,
        impact_description: form.impact_description || undefined,
        implementation_plan: form.implementation_plan,
        backout_plan: form.backout_plan,
        test_plan: form.test_plan || undefined,
        assigned_to: form.assigned_to || null,
        assignment_group_id: form.assignment_group_id || null,
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
        maintenance_window: form.maintenance_window || undefined,
        downtime_required: form.downtime_required,
        related_problem_id: form.related_problem_id || null,
        related_incident_id: form.related_incident_id || null,
        priority: form.priority,
        business_justification: form.business_justification || undefined,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
        review_notes: form.review_notes || undefined,
        affected_cis: form.affected_cis,
      };
      if (isNew || !id) {
        const created = await changes.create(payload);
        navigate(`/changes/${created.id}`, { state: { listParams }, replace: true });
      } else {
        await changes.update(id, payload);
        await load();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save change');
    } finally {
      setSaving(false);
    }
  };

  const runTransition = async (action: string) => {
    if (!id || isNew) return;
    try {
      await changes.transition(id, {
        action,
        scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
        scheduled_end: form.scheduled_end ? new Date(form.scheduled_end).toISOString() : null,
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transition failed');
    }
  };

  const decideApproval = async (approvalId: string, decision: 'approved' | 'rejected' | 'waived') => {
    if (!id || isNew) return;
    try {
      await changes.decideApproval(id, approvalId, decision);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save approval decision');
    }
  };

  if (loading) return <Spinner />;

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none';
  const selectCls = `${inputCls} bg-white`;
  const textareaCls = `${inputCls} resize-none`;

  const tabs = [
    { key: 'overview' as const, label: 'Assessment' },
    { key: 'approvals' as const, label: `Approvals${approvals.length ? ` (${approvals.length})` : ''}` },
    { key: 'planning' as const, label: 'Planning' },
    { key: 'implementation' as const, label: 'Implementation' },
    { key: 'review' as const, label: 'Review' },
  ];

  return (
    <>
      <PageHeader
        title={isNew ? 'New Change' : `${change?.number} — ${form.title}`}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving || !hasRequiredFields}>
              {saving ? 'Saving...' : isNew ? 'Create Change' : 'Save Changes'}
            </Button>
            <Button variant="outline" size="icon" onClick={() => prevId && goTo(prevId)} disabled={!prevId} title="Previous (Left Arrow)">&#8592;</Button>
            <Button variant="outline" size="icon" onClick={() => nextId && goTo(nextId)} disabled={!nextId} title="Next (Right Arrow)">&#8594;</Button>
            <Button variant="outline" onClick={() => navigate('/changes')}>Back to list</Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>
      )}

      {/* ── Summary ── */}
      <Card className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Summary</h3>
        {change && (
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 flex-wrap">
            <Badge value={change.status} />
            <Badge value={change.stage} />
            {change.change_type_name && <span className="text-sm text-gray-600">{change.change_type_name}</span>}
            <span className="text-xs text-gray-400 ml-auto">Updated {formatDateTime(change.updated_at)}</span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Change Type <span className="text-red-500">*</span></label>
            <select value={form.change_type_id} onChange={(e) => setForm((p) => ({ ...p, change_type_id: e.target.value, standard_change_id: '' }))} className={selectCls}>
              <option value="">Select type</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Standard Template</label>
            <select value={form.standard_change_id} onChange={(e) => applyTemplate(e.target.value)} className={selectCls}>
              <option value="">No template</option>
              {templateOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Risk</label>
            <select value={form.risk_level} onChange={(e) => setForm((p) => ({ ...p, risk_level: e.target.value as Change['risk_level'] }))} className={selectCls}>
              {['low', 'medium', 'high', 'very_high'].map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as Change['priority'] }))} className={selectCls}>
              {['low', 'medium', 'high', 'critical'].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assignment Group</label>
            <select value={form.assignment_group_id} onChange={(e) => setForm((p) => ({ ...p, assignment_group_id: e.target.value }))} className={selectCls}>
              <option value="">— Unassigned —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className={inputCls} placeholder="Category" />
          </div>
        </div>
      </Card>

      {/* ── Tab navigation (existing changes only) ── */}
      {!isNew && (
        <div className="flex flex-wrap gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeTab === t.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Assessment / main form ── */}
      {(isNew || activeTab === 'overview') && (
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Left pane */}
          <div className="space-y-6">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Scheduling</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Scheduled Start</label>
                  <input type="datetime-local" value={form.scheduled_start} onChange={(e) => setForm((p) => ({ ...p, scheduled_start: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Scheduled End</label>
                  <input type="datetime-local" value={form.scheduled_end} onChange={(e) => setForm((p) => ({ ...p, scheduled_end: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Maintenance Window</label>
                  <input value={form.maintenance_window} onChange={(e) => setForm((p) => ({ ...p, maintenance_window: e.target.value }))} className={inputCls} placeholder="e.g. Saturdays 02:00–04:00" />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={form.downtime_required} onChange={(e) => setForm((p) => ({ ...p, downtime_required: e.target.checked }))} className="rounded" />
                    Downtime Required
                  </label>
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Relationships</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Related Incident</label>
                  <select value={form.related_incident_id} onChange={(e) => setForm((p) => ({ ...p, related_incident_id: e.target.value }))} className={selectCls}>
                    <option value="">None</option>
                    {incidentsList.map((i) => <option key={i.id} value={i.id}>{i.number} — {i.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Related Problem</label>
                  <select value={form.related_problem_id} onChange={(e) => setForm((p) => ({ ...p, related_problem_id: e.target.value }))} className={selectCls}>
                    <option value="">None</option>
                    {problemsList.map((p) => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Estimated Cost</label>
                  <input type="number" value={form.estimated_cost} onChange={(e) => setForm((p) => ({ ...p, estimated_cost: e.target.value }))} className={inputCls} placeholder="0.00" />
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="font-semibold text-gray-900 mb-3">Affected CIs</h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {cis.map((ci) => (
                  <label key={ci.id} className="flex items-center gap-2 text-sm text-gray-700 py-0.5 cursor-pointer hover:text-gray-900">
                    <input
                      type="checkbox"
                      checked={form.affected_cis.includes(ci.id)}
                      onChange={(e) => setForm((p) => ({
                        ...p,
                        affected_cis: e.target.checked ? [...p.affected_cis, ci.id] : p.affected_cis.filter((id) => id !== ci.id),
                      }))}
                      className="rounded"
                    />
                    {ci.display_name || ci.name}
                  </label>
                ))}
              </div>
            </Card>
          </div>

          {/* Center pane */}
          <div className="space-y-6 min-w-0">
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Change Details</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Title <span className="text-red-500">*</span></label>
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Change title" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={textareaCls} placeholder="Describe the change..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Reason for Change</label>
                  <textarea rows={3} value={form.reason_for_change} onChange={(e) => setForm((p) => ({ ...p, reason_for_change: e.target.value }))} className={textareaCls} placeholder="Why is this change needed?" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Business Justification</label>
                  <textarea rows={2} value={form.business_justification} onChange={(e) => setForm((p) => ({ ...p, business_justification: e.target.value }))} className={textareaCls} placeholder="Business justification..." />
                </div>
              </div>
            </Card>
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Plans</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Implementation Plan</label>
                  <textarea rows={4} value={form.implementation_plan} onChange={(e) => setForm((p) => ({ ...p, implementation_plan: e.target.value }))} className={textareaCls} placeholder="Step-by-step implementation plan..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Backout Plan</label>
                  <textarea rows={3} value={form.backout_plan} onChange={(e) => setForm((p) => ({ ...p, backout_plan: e.target.value }))} className={textareaCls} placeholder="How to roll back if needed..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Test Plan</label>
                  <textarea rows={2} value={form.test_plan} onChange={(e) => setForm((p) => ({ ...p, test_plan: e.target.value }))} className={textareaCls} placeholder="How will success be verified?" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Approvals tab ── */}
      {!isNew && activeTab === 'approvals' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Approvals</h3>
          <div className="space-y-3">
            {approvals.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 capitalize">{a.approval_type} approval</p>
                  <p className="text-xs text-gray-500">{a.approver_name || a.approver_group_name || 'Unassigned approver'}</p>
                </div>
                <Badge value={a.status} />
                {a.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" onClick={() => decideApproval(a.id, 'approved')} className="bg-green-600 hover:bg-green-500 text-white">Approve</Button>
                    <Button size="sm" variant="warning" onClick={() => decideApproval(a.id, 'rejected')}>Reject</Button>
                    <Button size="sm" variant="outline" onClick={() => decideApproval(a.id, 'waived')}>Waive</Button>
                  </div>
                )}
              </div>
            ))}
            {approvals.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No approval records.</p>}
          </div>
        </Card>
      )}

      {/* ── Planning tab ── */}
      {!isNew && activeTab === 'planning' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Conflicts &amp; Scheduling</h3>
          <div className="space-y-2">
            {conflicts.map((c) => (
              <div key={c.id} className={`p-3 rounded-lg border ${c.severity === 'blocking' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className="text-sm font-medium capitalize">{c.conflict_type.replace('_', ' ')}</p>
                <p className="text-xs text-gray-600 mt-0.5">{c.details || 'Conflict detected'}</p>
              </div>
            ))}
            {conflicts.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No conflicts detected.</p>}
          </div>
        </Card>
      )}

      {/* ── Implementation tab ── */}
      {!isNew && activeTab === 'implementation' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Implementation Plans</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Implementation Plan</label>
              <textarea rows={5} value={form.implementation_plan} onChange={(e) => setForm((p) => ({ ...p, implementation_plan: e.target.value }))} className={textareaCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Backout Plan</label>
              <textarea rows={4} value={form.backout_plan} onChange={(e) => setForm((p) => ({ ...p, backout_plan: e.target.value }))} className={textareaCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Test Plan</label>
              <textarea rows={3} value={form.test_plan} onChange={(e) => setForm((p) => ({ ...p, test_plan: e.target.value }))} className={textareaCls} />
            </div>
          </div>
        </Card>
      )}

      {/* ── Review tab ── */}
      {!isNew && activeTab === 'review' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Post-Implementation Review</h3>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Review Notes (PIR)</label>
            <textarea rows={6} value={form.review_notes} onChange={(e) => setForm((p) => ({ ...p, review_notes: e.target.value }))} className={textareaCls} placeholder="Post-implementation review notes..." />
          </div>
        </Card>
      )}

      {/* ── Workflow transitions ── */}
      {!isNew && (
        <Card className="mt-6">
          <h3 className="font-semibold text-gray-900 mb-3">Workflow Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => runTransition('submit_assessment')}>Submit Assessment</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('request_approval')}>Request Approval</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('approve')}>Approve</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('schedule')}>Schedule</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('start_implementation')}>Start Implementation</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('mark_implemented')}>Mark Implemented</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('start_review')}>Start Review</Button>
            <Button variant="outline" size="sm" onClick={() => runTransition('close')}>Close</Button>
            <Button variant="warning" size="sm" onClick={() => runTransition('cancel')}>Cancel</Button>
          </div>
        </Card>
      )}
    </>
  );
}
