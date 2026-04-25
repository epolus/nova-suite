/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { cmdb, auth, admin, problems } from '../../api/client';
import type { CI, CIClass, CIRelationship, CIHistoryEntry, ImpactedCI, AssignmentGroupItem, Problem } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Spinner from '../../components/Spinner';
import { formatDateTime } from '../../utils/dateTime';
import { hasConfigurationRole } from '../../utils/roles';

function resolveClassAttrs(classId: string, allClasses: CIClass[]): Record<string, { type: string; reference_table?: string }> {
  const result: Record<string, { type: string; reference_table?: string }> = {};
  const visited = new Set<string>();
  let cls = allClasses.find((c) => c.id === classId);
  const chain: CIClass[] = [];
  while (cls && !visited.has(cls.id)) {
    visited.add(cls.id);
    chain.unshift(cls);
    cls = cls.parent_class ? allClasses.find((c) => c.id === cls!.parent_class) : undefined;
  }
  for (const c of chain) {
    for (const [key, val] of Object.entries(c.attributes)) {
      if (!result[key]) result[key] = val;
    }
  }
  return result;
}

const RELATIONSHIP_TYPES = [
  { value: 'depends_on', label: 'Depends On' },
  { value: 'used_by', label: 'Used By' },
  { value: 'runs_on', label: 'Runs On' },
  { value: 'connected_to', label: 'Connected To' },
  { value: 'part_of', label: 'Part Of' },
  { value: 'manages', label: 'Manages' },
];

type CIData = CI & { relationships: { outgoing: CIRelationship[]; incoming: CIRelationship[] } };

export default function CIDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const canEdit = hasConfigurationRole(user?.roles);

  const listParams: Record<string, string> = (location.state as { listParams?: Record<string, string> })?.listParams || {};

  const [ci, setCi] = useState<CIData | null>(null);
  const [classes, setClasses] = useState<CIClass[]>([]);
  const [refNames, setRefNames] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<CIHistoryEntry[]>([]);
  const [impact, setImpact] = useState<ImpactedCI[]>([]);
  const [relatedProblems, setRelatedProblems] = useState<Problem[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'relationships' | 'history' | 'impact'>('details');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  const loadCi = useCallback((ciId: string) => {
    setLoading(true);
    setLoadError('');
    Promise.all([
      cmdb.item(ciId),
      cmdb.itemHistory(ciId),
      cmdb.impact(ciId),
      cmdb.classes(),
      cmdb.nav(ciId, listParams),
      problems.byCi(ciId).catch(() => ({ problems: [] as Problem[] })),
    ]).then(async ([ciRes, histRes, impactRes, classRes, navRes, problemRes]) => {
      setPrevId(navRes.prev_id);
      setNextId(navRes.next_id);
      setCi(ciRes);
      setHistory(histRes.history);
      setImpact(impactRes.impacted_items);
      setClasses(classRes.classes);
      setRelatedProblems(problemRes.problems);

      // Resolve reference attributes to display names
      const allAttrs = resolveClassAttrs(ciRes.class_id, classRes.classes);
      const refAttrs = Object.entries(allAttrs).filter(([, v]) => v.type === 'reference' && v.reference_table);
      if (refAttrs.length > 0) {
        const neededTables = new Set(refAttrs.map(([, v]) => v.reference_table!));
        const lookups: Record<string, Record<string, string>> = {};

        if (neededTables.has('users')) {
          try {
            const res = await auth.users();
            const map: Record<string, string> = {};
            for (const u of res.users) map[u.id] = u.display_name || u.email;
            lookups.users = map;
          } catch { /* ignore */ }
        }
        if (neededTables.has('assignment_groups')) {
          try {
            const res = await admin.assignmentGroups();
            const map: Record<string, string> = {};
            for (const g of res.assignment_groups) map[g.id] = g.name;
            lookups.assignment_groups = map;
          } catch { /* ignore */ }
        }
        if (neededTables.has('departments')) {
          try {
            const res = await admin.departments();
            const map: Record<string, string> = {};
            for (const d of res.departments) map[d.id] = d.name;
            lookups.departments = map;
          } catch { /* ignore */ }
        }
        if (neededTables.has('cost_centers')) {
          try {
            const res = await admin.costCenters();
            const map: Record<string, string> = {};
            for (const c of res.cost_centers) map[c.id] = `${c.code} – ${c.name}`;
            lookups.cost_centers = map;
          } catch { /* ignore */ }
        }
        if (neededTables.has('services')) {
          try {
            const res = await admin.services();
            const map: Record<string, string> = {};
            for (const s of res.services) map[s.id] = s.name;
            lookups.services = map;
          } catch { /* ignore */ }
        }

        const names: Record<string, string> = {};
        for (const [attrKey, attrDef] of refAttrs) {
          const val = String(ciRes.attributes[attrKey] || '');
          const table = attrDef.reference_table;
          if (val && table && lookups[table]) {
            names[attrKey] = lookups[table]![val] || val;
          }
        }
        setRefNames(names);
      } else {
        setRefNames({});
      }
    })
      .catch((err: unknown) => {
        setCi(null);
        setHistory([]);
        setImpact([]);
        setClasses([]);
        setRelatedProblems([]);
        setRefNames({});
        setPrevId(null);
        setNextId(null);
        setLoadError(err instanceof Error ? err.message : 'Failed to load configuration item');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!id) return;
    loadCi(id);
  }, [id, loadCi]);

  const navigateTo = useCallback((ciId: string) => {
    navigate(`/cmdb/${ciId}`, { state: { listParams }, replace: true });
  }, [navigate, listParams]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowLeft' && prevId) navigateTo(prevId);
      if (e.key === 'ArrowRight' && nextId) navigateTo(nextId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevId, nextId, navigateTo]);

  // Relationship management
  const [showRelForm, setShowRelForm] = useState(false);
  const [relSaving, setRelSaving] = useState(false);
  const [relError, setRelError] = useState('');
  const [relForm, setRelForm] = useState({ target: '', type: 'depends_on', notes: '', direction: 'outgoing' as 'outgoing' | 'incoming' });
  const [ciSearch, setCiSearch] = useState('');
  const [ciSearchResults, setCiSearchResults] = useState<CI[]>([]);
  const [ciSearching, setCiSearching] = useState(false);

  useEffect(() => {
    if (ciSearch.length < 2) { setCiSearchResults([]); return; }
    const timer = setTimeout(() => {
      setCiSearching(true);
      cmdb.items({ search: ciSearch, context: 'picker' }, 1, 10).then((res) => {
        setCiSearchResults(res.items.filter((i) => i.id !== id));
        setCiSearching(false);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [ciSearch, id]);

  const handleAddRelationship = async () => {
    if (!relForm.target || !id) return;
    setRelSaving(true);
    setRelError('');
    try {
      const payload = relForm.direction === 'outgoing'
        ? { source_ci_id: id, target_ci_id: relForm.target, relationship_type: relForm.type, notes: relForm.notes || undefined }
        : { source_ci_id: relForm.target, target_ci_id: id, relationship_type: relForm.type, notes: relForm.notes || undefined };
      await cmdb.createRelationship(payload);
      setShowRelForm(false);
      setRelForm({ target: '', type: 'depends_on', notes: '', direction: 'outgoing' });
      setCiSearch('');
      setCiSearchResults([]);
      loadCi(id);
    } catch (err: unknown) {
      setRelError(err instanceof Error ? err.message : 'Failed to create relationship');
    } finally {
      setRelSaving(false);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    if (!confirm('Remove this relationship?')) return;
    try {
      await cmdb.deleteRelationship(relId);
      if (id) loadCi(id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (loading) return <Spinner />;
  if (!ci) {
    return (
      <>
        <PageHeader title="Configuration item" description="This record could not be opened." />
        <Card>
          <p className="text-sm text-gray-700 mb-4">
            {loadError || 'This item was not found, or you do not have permission to view it.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/cmdb')}
            className="text-indigo-600 text-sm font-medium hover:text-indigo-800"
          >
            &larr; Back to CMDB
          </button>
        </Card>
      </>
    );
  }

  const tabs = [
    { key: 'details' as const, label: 'Details' },
    { key: 'relationships' as const, label: `Relationships (${ci.relationships.outgoing.length + ci.relationships.incoming.length})` },
    { key: 'history' as const, label: `History (${history.length})` },
    { key: 'impact' as const, label: `Impact (${impact.length})` },
  ];

  const selectedTarget = ciSearchResults.find((c) => c.id === relForm.target);

  return (
    <>
      <PageHeader
        title={ci.display_name || ci.name}
        description={`${ci.class_display_name} · ${ci.name}`}
        action={
          <div className="flex gap-2 items-center">
            {(prevId || nextId) && (
              <>
                <button
                  disabled={!prevId}
                  onClick={() => prevId && navigateTo(prevId)}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous CI (Left arrow)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  disabled={!nextId}
                  onClick={() => nextId && navigateTo(nextId)}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next CI (Right arrow)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            {canEdit && (
              <button
                onClick={() => navigate(`/cmdb/${id}/edit`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Edit
              </button>
            )}
            <button onClick={() => navigate('/cmdb')} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">&larr; Back</button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">General</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Status</dt>
                <dd><Badge value={ci.status} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Environment</dt>
                <dd><Badge value={ci.environment} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Class</dt>
                <dd className="text-gray-900 font-medium">{ci.class_display_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Managed By</dt>
                <dd className="text-gray-900">{ci.managed_by_name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Assigned To</dt>
                <dd className="text-gray-900">{ci.assigned_to_name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Supported By</dt>
                <dd className="text-gray-900">{ci.supported_by_name || '—'}</dd>
              </div>
              {ci.location && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Location</dt>
                  <dd className="text-gray-900">{ci.location}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">{formatDateTime(ci.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-900">{formatDateTime(ci.updated_at)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Attributes</h3>
            <dl className="space-y-3 text-sm">
              {Object.entries(ci.attributes).map(([key, value]) => {
                const displayValue = refNames[key] || String(value);
                const isRef = !!refNames[key];
                return (
                  <div key={key} className="flex justify-between">
                    <dt className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</dt>
                    <dd className={`font-medium ${isRef ? 'text-indigo-600' : 'text-gray-900'}`}>
                      {displayValue || '—'}
                    </dd>
                  </div>
                );
              })}
              {Object.keys(ci.attributes).length === 0 && (
                <p className="text-gray-400">No attributes defined</p>
              )}
            </dl>
          </Card>

          {ci.notes && (
            <Card className="lg:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ci.notes}</p>
            </Card>
          )}

          <Card className="lg:col-span-2">
            <h3 className="font-semibold text-gray-900 mb-2">Related Problems</h3>
            {relatedProblems.length === 0 ? (
              <p className="text-sm text-gray-400">No problems linked to this CI.</p>
            ) : (
              <div className="space-y-2">
                {relatedProblems.map((p) => (
                  <Link
                    key={p.id}
                    to={`/problems/${p.id}`}
                    className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    <p className="text-xs text-indigo-600 font-medium">{p.number}</p>
                    <p className="text-sm text-gray-900">{p.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.status} • {p.priority}</p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Relationships Tab */}
      {activeTab === 'relationships' && (
        <div className="space-y-6">
          {/* Add Relationship Button */}
          {canEdit && !showRelForm && (
            <div className="flex justify-end">
              <button
                onClick={() => setShowRelForm(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                + Add Relationship
              </button>
            </div>
          )}

          {/* Add Relationship Form */}
          {showRelForm && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Add Relationship</h3>
              {relError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{relError}</div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Direction</label>
                  <select
                    value={relForm.direction}
                    onChange={(e) => setRelForm({ ...relForm, direction: e.target.value as 'outgoing' | 'incoming' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="outgoing">{ci.name} &rarr; Target (outgoing)</option>
                    <option value="incoming">Source &rarr; {ci.name} (incoming)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Relationship Type</label>
                  <select
                    value={relForm.type}
                    onChange={(e) => setRelForm({ ...relForm, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {RELATIONSHIP_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 relative">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {relForm.direction === 'outgoing' ? 'Target CI' : 'Source CI'}
                  </label>
                  {selectedTarget ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-indigo-200 bg-indigo-50 rounded-lg">
                      <span className="text-sm font-medium text-indigo-700">{selectedTarget.display_name || selectedTarget.name}</span>
                      <span className="text-xs text-indigo-400">{selectedTarget.class_display_name}</span>
                      <button
                        onClick={() => { setRelForm({ ...relForm, target: '' }); setCiSearch(''); }}
                        className="ml-auto text-indigo-400 hover:text-indigo-600"
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={ciSearch}
                        onChange={(e) => setCiSearch(e.target.value)}
                        placeholder="Search for a CI..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {ciSearch.length >= 2 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {ciSearching ? (
                            <p className="p-3 text-sm text-gray-400">Searching...</p>
                          ) : ciSearchResults.length === 0 ? (
                            <p className="p-3 text-sm text-gray-400">No CIs found</p>
                          ) : (
                            ciSearchResults.map((r) => (
                              <button
                                key={r.id}
                                onClick={() => { setRelForm({ ...relForm, target: r.id }); setCiSearch(''); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                              >
                                <span className="text-sm font-medium text-gray-900">{r.display_name || r.name}</span>
                                <span className="text-xs text-gray-400">{r.class_display_name}</span>
                                <Badge value={r.status} />
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                  <input
                    type="text"
                    value={relForm.notes}
                    onChange={(e) => setRelForm({ ...relForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Describe this relationship..."
                  />
                </div>
              </div>

              {/* Preview */}
              {relForm.target && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">
                    {relForm.direction === 'outgoing' ? ci.name : (selectedTarget?.display_name || selectedTarget?.name || '?')}
                  </span>
                  <span className="text-gray-400">&rarr;</span>
                  <Badge value={relForm.type} />
                  <span className="text-gray-400">&rarr;</span>
                  <span className="font-medium text-gray-900">
                    {relForm.direction === 'outgoing' ? (selectedTarget?.display_name || selectedTarget?.name || '?') : ci.name}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => { setShowRelForm(false); setRelError(''); setCiSearch(''); setCiSearchResults([]); setRelForm({ target: '', type: 'depends_on', notes: '', direction: 'outgoing' }); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRelationship}
                  disabled={!relForm.target || relSaving}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {relSaving ? 'Saving...' : 'Add Relationship'}
                </button>
              </div>
            </Card>
          )}

          {/* Outgoing */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">
              Outgoing Relationships
              <span className="ml-2 text-xs font-normal text-gray-400">({ci.relationships.outgoing.length})</span>
            </h3>
            {ci.relationships.outgoing.length === 0 ? (
              <p className="text-sm text-gray-400">No outgoing relationships</p>
            ) : (
              <div className="space-y-2">
                {ci.relationships.outgoing.map((rel) => (
                  <div key={rel.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg group">
                    <span className="text-sm font-medium text-gray-900">{ci.name}</span>
                    <Badge value={rel.relationship_type} />
                    <span className="text-gray-400">&rarr;</span>
                    <Link to={`/cmdb/${rel.target_ci_id}`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                      {rel.target_display_name || rel.target_name}
                    </Link>
                    {rel.notes && <span className="text-xs text-gray-400 italic ml-auto hidden sm:inline">{rel.notes}</span>}
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity"
                        title="Remove relationship"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Incoming */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">
              Incoming Relationships
              <span className="ml-2 text-xs font-normal text-gray-400">({ci.relationships.incoming.length})</span>
            </h3>
            {ci.relationships.incoming.length === 0 ? (
              <p className="text-sm text-gray-400">No incoming relationships</p>
            ) : (
              <div className="space-y-2">
                {ci.relationships.incoming.map((rel) => (
                  <div key={rel.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg group">
                    <Link to={`/cmdb/${rel.source_ci_id}`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                      {rel.source_display_name || rel.source_name}
                    </Link>
                    <span className="text-gray-400">&rarr;</span>
                    <Badge value={rel.relationship_type} />
                    <span className="text-gray-400">&rarr;</span>
                    <span className="text-sm font-medium text-gray-900">{ci.name}</span>
                    {rel.notes && <span className="text-xs text-gray-400 italic ml-auto hidden sm:inline">{rel.notes}</span>}
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-opacity"
                        title="Remove relationship"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-4">Audit Trail</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No history entries</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                    entry.change_type === 'create' ? 'bg-green-500' :
                    entry.change_type === 'update' ? 'bg-blue-500' : 'bg-red-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{entry.changed_by_name}</span>
                      <Badge value={entry.change_type} />
                      {entry.field_name && (
                        <span className="text-xs text-gray-500">field: {entry.field_name}</span>
                      )}
                    </div>
                    {entry.old_value && entry.new_value && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.old_value.slice(0, 50)} &rarr; {entry.new_value.slice(0, 50)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(entry.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Impact Tab */}
      {activeTab === 'impact' && (
        <Card>
          <h3 className="font-semibold text-gray-900 mb-2">Impact Analysis</h3>
          <p className="text-sm text-gray-500 mb-4">
            Items that would be affected if <strong>{ci.name}</strong> goes down.
          </p>
          {impact.length === 0 ? (
            <p className="text-sm text-gray-400">No dependent items found</p>
          ) : (
            <div className="space-y-2">
              {impact.map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                  <span className="text-xs font-mono text-gray-400 w-8">L{item.depth}</span>
                  <Link to={`/cmdb/${item.ci_id}`} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">
                    {item.ci_name}
                  </Link>
                  <Badge value={item.relationship_type} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
