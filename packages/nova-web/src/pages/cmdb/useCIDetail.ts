/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { cmdb, auth, admin, problems } from '../../api/client';
import type { CI, CIClass, CIRelationship, CIHistoryEntry, ImpactedCI, Problem } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { hasConfigurationRole } from '../../utils/roles';
import { useTranslations } from 'use-intl';
import { resolveClassAttrs } from './cmdbHelpers';

export const RELATIONSHIP_VALUES = [
  'depends_on',
  'used_by',
  'runs_on',
  'connected_to',
  'part_of',
  'manages',
] as const;

export type CIData = CI & { relationships: { outgoing: CIRelationship[]; incoming: CIRelationship[] } };

export type RelForm = { target: string; type: string; notes: string; direction: 'outgoing' | 'incoming' };

export function useCIDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const canEdit = hasConfigurationRole(user?.roles);
  const tCmdb = useTranslations('pages.cmdb');

  const listParams = useMemo<Record<string, string>>(
    () => (location.state as { listParams?: Record<string, string> })?.listParams || {},
    [location.state],
  );

  const [ci, setCi] = useState<CIData | null>(null);
  const [, setClasses] = useState<CIClass[]>([]);
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
        setLoadError(err instanceof Error ? err.message : tCmdb('loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [listParams, tCmdb]);

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
  const [relForm, setRelForm] = useState<RelForm>({ target: '', type: 'depends_on', notes: '', direction: 'outgoing' });
  const [ciSearch, setCiSearch] = useState('');
  const [ciSearchResults, setCiSearchResults] = useState<CI[]>([]);
  const [ciSearching, setCiSearching] = useState(false);
  const [selectedFlowEdgeId, setSelectedFlowEdgeId] = useState<string | null>(null);

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
      setRelError(err instanceof Error ? err.message : tCmdb('createRelationshipFailed'));
    } finally {
      setRelSaving(false);
    }
  };

  const cancelRelForm = () => {
    setShowRelForm(false);
    setRelError('');
    setCiSearch('');
    setCiSearchResults([]);
    setRelForm({ target: '', type: 'depends_on', notes: '', direction: 'outgoing' });
  };

  const handleDeleteRelationship = async (relId: string) => {
    if (!confirm(tCmdb('confirmRemoveRelationship'))) return;
    try {
      await cmdb.deleteRelationship(relId);
      if (id) loadCi(id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : tCmdb('deleteRelationshipFailed'));
    }
  };

  return {
    id,
    navigate,
    canEdit,
    ci,
    refNames,
    history,
    impact,
    relatedProblems,
    activeTab,
    setActiveTab,
    loading,
    loadError,
    prevId,
    nextId,
    navigateTo,
    showRelForm,
    setShowRelForm,
    relSaving,
    relError,
    relForm,
    setRelForm,
    ciSearch,
    setCiSearch,
    ciSearchResults,
    ciSearching,
    selectedFlowEdgeId,
    setSelectedFlowEdgeId,
    handleAddRelationship,
    handleDeleteRelationship,
    cancelRelForm,
  };
}
