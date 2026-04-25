/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect } from 'react';
import { cmdb } from '../../api/client';
import type { CIClass } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';

const ICONS = [
  { value: 'server', label: 'Server', emoji: '🖥️' },
  { value: 'globe', label: 'Application', emoji: '🌐' },
  { value: 'database', label: 'Database', emoji: '🗄️' },
  { value: 'wifi', label: 'Network', emoji: '📡' },
  { value: 'storage', label: 'Storage', emoji: '💾' },
  { value: 'cloud', label: 'Cloud', emoji: '☁️' },
  { value: 'printer', label: 'Printer', emoji: '🖨️' },
  { value: 'phone', label: 'Phone', emoji: '📱' },
  { value: 'monitor', label: 'Monitor', emoji: '🖥️' },
  { value: 'other', label: 'Other', emoji: '📦' },
];

const ATTR_TYPES = ['string', 'integer', 'number', 'boolean', 'reference'];

const REFERENCE_TABLES = [
  { value: 'users', label: 'Users' },
  { value: 'assignment_groups', label: 'Assignment Groups' },
  { value: 'departments', label: 'Departments' },
  { value: 'cost_centers', label: 'Cost Centers' },
  { value: 'services', label: 'Services' },
];

type AttrDef = { key: string; type: string; reference_table?: string };
type ClassDraft = {
  id?: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  parent_class: string;
  attributes: AttrDef[];
};

const EMPTY_CLASS: ClassDraft = {
  name: '',
  display_name: '',
  description: '',
  icon: 'server',
  parent_class: '',
  attributes: [],
};

function attrsToList(attrs: Record<string, { type: string; reference_table?: string }>): AttrDef[] {
  return Object.entries(attrs).map(([key, val]) => ({
    key,
    type: val.type || 'string',
    reference_table: val.reference_table,
  }));
}

function attrsToRecord(list: AttrDef[]): Record<string, { type: string; reference_table?: string }> {
  const rec: Record<string, { type: string; reference_table?: string }> = {};
  for (const a of list) {
    if (a.key.trim()) {
      const entry: { type: string; reference_table?: string } = { type: a.type };
      if (a.type === 'reference' && a.reference_table) entry.reference_table = a.reference_table;
      rec[a.key.trim()] = entry;
    }
  }
  return rec;
}

function getInheritedAttrs(parentId: string, allClasses: CIClass[]): AttrDef[] {
  const result: AttrDef[] = [];
  const visited = new Set<string>();
  let currentId: string | null = parentId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const cls = allClasses.find((c) => c.id === currentId);
    if (!cls) break;
    for (const [key, val] of Object.entries(cls.attributes)) {
      if (!result.some((a) => a.key === key)) {
        result.push({ key, type: val.type || 'string', reference_table: val.reference_table });
      }
    }
    currentId = cls.parent_class;
  }
  return result;
}

function formatAttrType(attr: AttrDef): string {
  if (attr.type === 'reference' && attr.reference_table) {
    const tbl = REFERENCE_TABLES.find((t) => t.value === attr.reference_table);
    return `ref → ${tbl?.label || attr.reference_table}`;
  }
  return attr.type;
}

export default function CIClassesPage() {
  const [classes, setClasses] = useState<CIClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ClassDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');

  const load = () => {
    setLoading(true);
    cmdb.classes().then((res) => {
      setClasses(res.classes);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing({ ...EMPTY_CLASS, attributes: [] });
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
      attributes: attrsToList(cls.attributes),
    });
    setError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.display_name.trim()) {
      setError('Name and Display Name are required');
      return;
    }
    if (!/^[a-z_]+$/.test(editing.name)) {
      setError('Name must be lowercase letters and underscores only');
      return;
    }
    const dupeAttrs = editing.attributes
      .map((a) => a.key.trim())
      .filter((k, i, arr) => k && arr.indexOf(k) !== i);
    if (dupeAttrs.length > 0) {
      setError(`Duplicate attribute keys: ${dupeAttrs.join(', ')}`);
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
      attributes: attrsToRecord(editing.attributes),
    };

    try {
      if (editing.id) {
        await cmdb.updateClass(editing.id, payload as Partial<CIClass>);
      } else {
        await cmdb.createClass(payload as Partial<CIClass>);
      }
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this CI class? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await cmdb.deleteClass(id);
      load();
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting('');
    }
  };

  const addAttr = () => {
    if (!editing) return;
    setEditing({ ...editing, attributes: [...editing.attributes, { key: '', type: 'string', reference_table: undefined }] });
  };

  const removeAttr = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, attributes: editing.attributes.filter((_, i) => i !== idx) });
  };

  const updateAttr = (idx: number, field: 'key' | 'type' | 'reference_table', value: string) => {
    if (!editing) return;
    const attrs = [...editing.attributes];
    const current = attrs[idx]!;
    if (field === 'key') {
      attrs[idx] = { ...current, key: value };
    } else if (field === 'type') {
      attrs[idx] = {
        ...current,
        type: value,
        reference_table: value === 'reference' ? (current.reference_table || 'users') : undefined,
      };
    } else {
      attrs[idx] = { ...current, reference_table: value };
    }
    setEditing({ ...editing, attributes: attrs });
  };

  const iconEmoji = (icon: string) => ICONS.find((i) => i.value === icon)?.emoji || '📦';

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="CI Classes"
        description="Define configuration item types and their attributes."
        action={
          <button
            onClick={openNew}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Class
          </button>
        }
      />

      {/* Class list */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {classes.map((cls) => (
          <Card key={cls.id} className="relative group">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{iconEmoji(cls.icon)}</span>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{cls.display_name}</h3>
                <p className="text-xs text-gray-400 font-mono">{cls.name}</p>
                {cls.description && <p className="text-sm text-gray-500 mt-1">{cls.description}</p>}

                {(() => {
                  const inherited = cls.parent_class ? getInheritedAttrs(cls.parent_class, classes) : [];
                  const own = Object.entries(cls.attributes);
                  if (own.length === 0 && inherited.length === 0) return null;
                  return (
                    <div className="mt-3">
                      {own.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-gray-500 mb-1">Own Attributes</p>
                          <div className="flex flex-wrap gap-1.5">
                            {own.map(([key, val]) => (
                              <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                <span className="font-medium">{key}</span>
                                <span className="text-gray-400">({formatAttrType({ key, type: val.type, reference_table: val.reference_table })})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      {inherited.length > 0 && (
                        <>
                          <p className="text-xs font-medium text-gray-500 mb-1 mt-2">Inherited</p>
                          <div className="flex flex-wrap gap-1.5">
                            {inherited.map((a) => (
                              <span key={a.key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-100 rounded text-xs text-amber-700">
                                <span className="font-medium">{a.key}</span>
                                <span className="text-amber-400">({formatAttrType(a)})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => openEdit(cls)}
                className="p-1.5 bg-white border border-gray-200 rounded-md text-xs text-indigo-600 hover:bg-indigo-50"
                title="Edit"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(cls.id)}
                disabled={deleting === cls.id}
                className="p-1.5 bg-white border border-gray-200 rounded-md text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                title="Delete"
              >
                {deleting === cls.id ? '...' : 'Del'}
              </button>
            </div>
          </Card>
        ))}

        {classes.length === 0 && (
          <p className="text-sm text-gray-400 col-span-full text-center py-8">No CI classes defined yet.</p>
        )}
      </div>

      {/* Edit/Create Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editing.id ? 'Edit CI Class' : 'New CI Class'}
              </h2>
            </div>

            <div className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">System Name *</label>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    disabled={!!editing.id}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                    placeholder="e.g. server"
                  />
                  {!editing.id && (
                    <p className="text-xs text-gray-400 mt-1">Lowercase + underscores only. Cannot be changed later.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Display Name *</label>
                  <input
                    value={editing.display_name}
                    onChange={(e) => setEditing({ ...editing, display_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Server"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="What kind of CIs does this class represent?"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Icon</label>
                  <div className="flex flex-wrap gap-2">
                    {ICONS.map((ic) => (
                      <button
                        key={ic.value}
                        onClick={() => setEditing({ ...editing, icon: ic.value })}
                        className={`p-2 rounded-lg border-2 transition-all text-lg ${
                          editing.icon === ic.value
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-100 hover:border-gray-200'
                        }`}
                        title={ic.label}
                      >
                        {ic.emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Parent Class</label>
                  <select
                    value={editing.parent_class}
                    onChange={(e) => setEditing({ ...editing, parent_class: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">None</option>
                    {classes.filter((c) => c.id !== editing.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.display_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Inherited attributes (read-only) */}
              {editing.parent_class && (() => {
                const inherited = getInheritedAttrs(editing.parent_class, classes);
                if (inherited.length === 0) return null;
                return (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-2 block">
                      Inherited Attributes
                      <span className="ml-1 text-gray-400 font-normal">(from parent)</span>
                    </label>
                    <div className="space-y-1.5">
                      {inherited.map((attr) => (
                        <div key={attr.key} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-100 rounded-lg opacity-80">
                          <span className="text-xs text-amber-500 w-6 text-right">&#8627;</span>
                          <span className="flex-1 px-2.5 py-1.5 text-sm text-gray-500">{attr.key}</span>
                          <span className="px-2.5 py-1.5 text-sm text-gray-400">{formatAttrType(attr)}</span>
                          <span className="p-1 text-xs text-amber-500">inherited</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-amber-600 mt-1.5">
                      Inherited attributes are available on CIs of this class but managed on the parent.
                    </p>
                  </div>
                );
              })()}

              {/* Attributes builder */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-gray-500">Own Attributes</label>
                  <button
                    onClick={addAttr}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    + Add Attribute
                  </button>
                </div>

                {editing.attributes.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <p className="text-sm text-gray-400">No attributes yet</p>
                    <button
                      onClick={addAttr}
                      className="mt-2 text-xs text-indigo-600 font-medium hover:text-indigo-800"
                    >
                      Add your first attribute
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editing.attributes.map((attr, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <span className="text-xs text-gray-400 w-6 text-right">{idx + 1}</span>
                        <input
                          value={attr.key}
                          onChange={(e) => updateAttr(idx, 'key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                          className="flex-1 min-w-[120px] px-2.5 py-1.5 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="attribute_name"
                        />
                        <select
                          value={attr.type}
                          onChange={(e) => updateAttr(idx, 'type', e.target.value)}
                          className="w-28 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {ATTR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        {attr.type === 'reference' && (
                          <select
                            value={attr.reference_table || 'users'}
                            onChange={(e) => updateAttr(idx, 'reference_table', e.target.value)}
                            className="w-40 px-2.5 py-1.5 border border-indigo-200 bg-indigo-50 rounded-md text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {REFERENCE_TABLES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => removeAttr(idx)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-2">
                  These attributes will appear as fields when creating or editing CIs of this class.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : editing.id ? 'Save Changes' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
