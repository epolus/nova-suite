/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { cmdb } from '../../api/client';
import type { CIClass } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import ClassEditorModal from './ci-classes/ClassEditorModal';
import ClassListToolbar from './ci-classes/ClassListToolbar';
import { CiClassIcon } from '../../components/CiClassIcon';
import {
  EMPTY_CLASS,
  ICON_VALUES,
  attrsToList,
  attrsToRecord,
  buildClassTree,
  classMatchesQuery,
  classPath,
  filterClassTree,
  formatAttrType,
  getInheritedAttrs,
  subtreeCiCounts,
  type ClassDraft,
  type ClassTreeNode,
} from './ci-classes/classHelpers';

type ActiveFilter = 'all' | 'active' | 'inactive';

function isClassActive(cls: CIClass): boolean {
  return cls.is_active !== false;
}

export default function CIClassesPage() {
  const t = useTranslations('pages.admin.ciClasses');
  const tFields = useTranslations('common.fields');
  const tActions = useTranslations('common.actions');
  const tStates = useTranslations('common.states');

  const icons = useMemo(
    () => ICON_VALUES.map((value) => ({
      value,
      label: t(`icons.${value}`),
    })),
    [t],
  );
  const [classes, setClasses] = useState<CIClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClassDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');
  const [toggling, setToggling] = useState('');
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchClasses = () => {
    cmdb.classes().then((res) => {
      setClasses(res.classes);
      setLoading(false);
    });
  };

  const load = () => {
    setLoading(true);
    fetchClasses();
  };

  useEffect(() => { fetchClasses(); }, []);

  const childCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cls of classes) {
      if (!cls.parent_class) continue;
      counts.set(cls.parent_class, (counts.get(cls.parent_class) ?? 0) + 1);
    }
    return counts;
  }, [classes]);

  const branchCiCount = useMemo(() => subtreeCiCounts(classes), [classes]);

  const matches = (cls: CIClass) => {
    if (activeFilter === 'active' && !isClassActive(cls)) return false;
    if (activeFilter === 'inactive' && isClassActive(cls)) return false;
    return classMatchesQuery(cls, query);
  };

  const tree = useMemo(
    () => filterClassTree(buildClassTree(classes), (cls) => {
      if (activeFilter === 'active' && !isClassActive(cls)) return false;
      if (activeFilter === 'inactive' && isClassActive(cls)) return false;
      return classMatchesQuery(cls, query);
    }),
    [classes, query, activeFilter],
  );

  const forceExpand = query.trim().length > 0 || activeFilter !== 'all';

  const openNew = (parentId = '') => {
    setEditing({ ...EMPTY_CLASS, parent_class: parentId, attributes: [] });
    setError('');
  };

  const openEdit = (cls: CIClass) => {
    setEditing({
      id: cls.id,
      name: cls.name,
      display_name: cls.display_name,
      description: cls.description || '',
      icon: cls.icon,
      parent_class: cls.parent_class || '',
      is_active: isClassActive(cls),
      attributes: attrsToList(cls.attributes),
    });
    setError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.display_name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!/^[a-z_]+$/.test(editing.name)) {
      setError(t('nameFormat'));
      return;
    }
    const dupeAttrs = editing.attributes
      .map((a) => a.key.trim())
      .filter((k, i, arr) => k && arr.indexOf(k) !== i);
    if (dupeAttrs.length > 0) {
      setError(t('duplicateAttributes', { keys: dupeAttrs.join(', ') }));
      return;
    }

    setSaving(true);
    setError('');
    const payload = {
      name: editing.name.trim(),
      display_name: editing.display_name.trim(),
      description: editing.description.trim() || undefined,
      icon: editing.icon,
      parent_class: editing.parent_class || undefined,
      is_active: editing.is_active,
      attributes: attrsToRecord(editing.attributes),
    };

    try {
      if (editing.id) {
        await cmdb.updateClass(editing.id, payload);
      } else {
        await cmdb.createClass(payload);
      }
      setEditing(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    setDeleting(id);
    try {
      await cmdb.deleteClass(id);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting('');
    }
  };

  const handleToggleActive = async (cls: CIClass) => {
    setToggling(cls.id);
    try {
      await cmdb.updateClass(cls.id, { is_active: !isClassActive(cls) });
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling('');
    }
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandableIds = useMemo(
    () => classes.filter((cls) => (childCount.get(cls.id) ?? 0) > 0).map((cls) => cls.id),
    [classes, childCount],
  );

  if (loading) return <Spinner />;

  const renderNode = (node: ClassTreeNode<CIClass>) => {
    const cls = node.cls;
    const active = isClassActive(cls);
    const kids = childCount.get(cls.id) ?? 0;
    const directCis = cls.ci_count ?? 0;
    const branchCis = branchCiCount.get(cls.id) ?? directCis;
    const expanded = forceExpand || !collapsed.has(cls.id);
    const own = Object.entries(cls.attributes);
    const ownKeys = new Set(own.map(([key]) => key));
    const inherited = cls.parent_class
      ? getInheritedAttrs(cls.parent_class, classes).filter((attr) => !ownKeys.has(attr.key))
      : [];
    const ancestors = classPath(cls, classes).slice(0, -1);
    const hit = matches(cls);

    return (
      <div key={cls.id}>
        <div className={node.depth > 0 ? 'ml-4 sm:ml-8 border-l border-indigo-100 pl-3 sm:pl-4' : ''}>
          <Card className={`relative group mb-3 ${active ? '' : 'opacity-60'} ${hit ? '' : 'bg-gray-50'}`}>
            <div className="flex items-start gap-3">
              {kids > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleCollapsed(cls.id)}
                  className="mt-1 w-6 h-6 shrink-0 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                  aria-expanded={expanded}
                  title={expanded ? t('collapse') : t('expand')}
                >
                  {expanded ? '−' : '+'}
                </button>
              ) : (
                <span className="mt-1 w-6 h-6 shrink-0" />
              )}
              <span className="text-gray-600 mt-0.5"><CiClassIcon name={cls.icon} className="w-7 h-7" /></span>
              <div className="flex-1 min-w-0">
                {ancestors.length > 0 ? (
                  <p className="text-xs text-indigo-600 mb-1">{t('childOf', { parent: ancestors.join(' / ') })}</p>
                ) : (
                  <p className="text-xs text-gray-400 mb-1">{t('topLevel')}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{cls.display_name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                  }`}
                  >
                    {active ? tStates('active') : tStates('inactive')}
                  </span>
                  {kids > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-medium">
                      {t('childCount', { count: kids })}
                    </span>
                  )}
                  <Link
                    to={`/cmdb?class_id=${cls.id}`}
                    className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium hover:bg-slate-200"
                  >
                    {t('ciCount', { count: directCis })}
                  </Link>
                  {branchCis > directCis && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 text-[11px] font-medium">
                      {t('ciCountBranch', { count: branchCis })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 font-mono">{cls.name}</p>
                {cls.description && <p className="text-sm text-gray-500 mt-1">{cls.description}</p>}

                {kids > 0 && !expanded && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">{t('children')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {classes.filter((child) => child.parent_class === cls.id).map((child) => (
                        <span key={child.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 rounded-sm text-xs text-indigo-700">
                          <CiClassIcon name={child.icon} className="w-3.5 h-3.5" />
                          {child.display_name}
                          <span className="text-indigo-400">{t('ciCount', { count: child.ci_count ?? 0 })}</span>
                          {!isClassActive(child) && (
                            <span className="text-indigo-300">{tStates('inactive')}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {hit && (own.length > 0 || inherited.length > 0) && (
                  <div className="mt-3">
                    {own.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-gray-500 mb-1">{t('ownAttributes')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {own.map(([key, val]) => (
                            <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-sm text-xs text-gray-600">
                              <span className="font-medium">{key}</span>
                              <span className="text-gray-400">({formatAttrType({ key, type: val.type, reference_table: val.reference_table }, t, tFields)})</span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {inherited.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-gray-500 mb-1 mt-2">{t('inherited')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {inherited.map((attr) => (
                            <span key={attr.key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-100 rounded-sm text-xs text-amber-700">
                              <span className="font-medium">{attr.key}</span>
                              <span className="text-amber-400">({formatAttrType(attr, t, tFields)})</span>
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEdit(cls)}
                className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs text-indigo-600 hover:bg-indigo-50"
              >
                {tActions('edit')}
              </button>
              <button
                type="button"
                onClick={() => openNew(cls.id)}
                className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs text-indigo-600 hover:bg-indigo-50"
              >
                {t('addChild')}
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(cls)}
                disabled={toggling === cls.id}
                className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {toggling === cls.id ? '...' : active ? t('deactivate') : t('activate')}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(cls.id)}
                disabled={deleting === cls.id}
                className="px-2.5 py-1 bg-white border border-gray-200 rounded-md text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting === cls.id ? '...' : tActions('delete')}
              </button>
            </div>
          </Card>
        </div>
        {expanded && node.children.map((child) => renderNode(child))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          <button
            type="button"
            onClick={() => openNew()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            {t('newClass')}
          </button>
        }
      />

      <ClassListToolbar
        query={query}
        onQuery={setQuery}
        activeFilter={activeFilter}
        onActiveFilter={setActiveFilter}
        forceExpand={forceExpand}
        onExpandAll={() => setCollapsed(new Set())}
        onCollapseAll={() => setCollapsed(new Set(expandableIds))}
      />

      <p className="text-sm text-gray-500 mb-4">{t('hierarchyHint')}</p>

      <div className="mb-8">
        {tree.map((node) => renderNode(node))}
        {tree.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            {classes.length === 0 ? t('empty') : t('noMatches')}
          </p>
        )}
      </div>

      {editing && (
        <ClassEditorModal
          editing={editing}
          classes={classes}
          icons={icons}
          error={error}
          saving={saving}
          onChange={setEditing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
