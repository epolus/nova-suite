/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState } from 'react';
import { admin, knowledge, type AssignmentGroupItem, type KnowledgeApprovalWorkflow, type KnowledgeCategory } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';

export default function KnowledgeWorkflowsPage() {
  const [workflows, setWorkflows] = useState<KnowledgeApprovalWorkflow[]>([]);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [groups, setGroups] = useState<AssignmentGroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);

  const [form, setForm] = useState({
    name: '',
    category_id: '',
    is_active: true,
    sort_order: 100,
    steps: [{ assignment_group_id: '' }],
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    parent_id: '',
    is_active: true,
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      knowledge.workflows(),
      knowledge.categories(),
      admin.assignmentGroups(),
    ]).then(([w, c, g]) => {
      setWorkflows(w.workflows);
      setCategories(c.categories);
      setGroups(g.assignment_groups.filter((x) => x.is_active));
      setLoading(false);
    });
  };

  const categoryLabelById = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const cache = new Map<string, string>();
    const labelFor = (id: string): string => {
      if (cache.has(id)) return cache.get(id)!;
      const current = byId.get(id);
      if (!current) return id;
      const label = current.parent_id && byId.has(current.parent_id)
        ? `${labelFor(current.parent_id)} / ${current.name}`
        : current.name;
      cache.set(id, label);
      return label;
    };
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, labelFor(c.id)));
    return map;
  }, [categories]);

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => (editingId && editingId !== 'new' ? workflows.find((w) => w.id === editingId) || null : null),
    [editingId, workflows],
  );

  useEffect(() => {
    if (editingId === 'new') {
      setForm({ name: '', category_id: '', is_active: true, sort_order: 100, steps: [{ assignment_group_id: '' }] });
    } else if (selected) {
      setForm({
        name: selected.name,
        category_id: selected.category_id || '',
        is_active: selected.is_active,
        sort_order: selected.sort_order,
        steps: selected.steps?.length ? selected.steps.map((s) => ({ assignment_group_id: s.assignment_group_id })) : [{ assignment_group_id: '' }],
      });
    }
  }, [editingId, selected]);

  const save = async () => {
    setSaving(true);
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
      steps: form.steps
        .filter((s) => s.assignment_group_id)
        .map((s, idx) => ({ step_order: idx + 1, assignment_group_id: s.assignment_group_id })),
    };
    try {
      if (editingId === 'new') await knowledge.createWorkflow(payload);
      else if (editingId) await knowledge.updateWorkflow(editingId, payload);
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    await knowledge.deleteWorkflow(id);
    load();
  };

  const startNewCategory = () => {
    setEditingCategoryId('new');
    setCategoryForm({ name: '', description: '', parent_id: '', is_active: true });
  };

  const startEditCategory = (id: string) => {
    const c = categories.find((x) => x.id === id);
    if (!c) return;
    setEditingCategoryId(id);
    setCategoryForm({
      name: c.name,
      description: c.description || '',
      parent_id: c.parent_id || '',
      is_active: c.is_active,
    });
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) return;
    setSavingCategory(true);
    try {
      const payload = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        parent_id: categoryForm.parent_id || null,
        is_active: categoryForm.is_active,
      };
      if (editingCategoryId === 'new') await knowledge.createCategory(payload);
      else if (editingCategoryId) await knowledge.updateCategory(editingCategoryId, payload);
      setEditingCategoryId(null);
      load();
    } finally {
      setSavingCategory(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    await knowledge.deleteCategory(id);
    if (editingCategoryId === id) setEditingCategoryId(null);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Knowledge Approval Workflows"
        description="Configure approval steps (assignment groups) for knowledge articles."
        action={
          <button
            onClick={() => setEditingId('new')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            + New Workflow
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-900">Categories & Subcategories</p>
            <button onClick={startNewCategory} className="text-xs text-indigo-600 hover:text-indigo-800">
              + New
            </button>
          </div>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {categories.map((c) => (
              <div key={c.id} className={`p-2.5 rounded border ${editingCategoryId === c.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}`}>
                <button className="w-full text-left" onClick={() => startEditCategory(c.id)}>
                  <p className="text-sm font-medium text-gray-900">{categoryLabelById.get(c.id) || c.name}</p>
                  <p className="text-xs text-gray-500">{c.is_active ? 'active' : 'inactive'}</p>
                </button>
                <div className="mt-1.5 flex items-center gap-2">
                  <button onClick={() => startEditCategory(c.id)} className="text-xs text-indigo-600 hover:text-indigo-800">Edit</button>
                  <button onClick={() => deleteCategory(c.id)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
                </div>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">No categories yet.</p>}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          {editingCategoryId ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category (optional)</label>
                  <select
                    value={categoryForm.parent_id}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, parent_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">Top-level category</option>
                    {categories
                      .filter((c) => c.id !== editingCategoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{categoryLabelById.get(c.id) || c.name}</option>
                      ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Active</label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={categoryForm.is_active}
                      onChange={(e) => setCategoryForm((p) => ({ ...p, is_active: e.target.checked }))}
                    />
                    Enabled
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveCategory}
                  disabled={savingCategory || !categoryForm.name.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingCategory ? 'Saving...' : editingCategoryId === 'new' ? 'Create Category' : 'Save Category'}
                </button>
                <button
                  onClick={() => setEditingCategoryId(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-16 text-center">Select a category/subcategory or create a new one.</div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <div className="space-y-2">
            {workflows.map((w) => (
              <div key={w.id} className={`p-3 rounded-lg border ${editingId === w.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}`}>
                <button className="w-full text-left" onClick={() => setEditingId(w.id)}>
                  <p className="text-sm font-medium text-gray-900">{w.name}</p>
                  <p className="text-xs text-gray-500">{w.category_name || 'Default'} • {w.steps?.length || 0} step(s)</p>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => setEditingId(w.id)} className="text-xs text-indigo-600 hover:text-indigo-800">Edit</button>
                  <button onClick={() => remove(w.id)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
                </div>
              </div>
            ))}
            {workflows.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No workflows configured.</p>}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          {editingId ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category (optional)</label>
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="">Default (all categories)</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabelById.get(c.id) || c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: parseInt(e.target.value) || 100 }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Active</label>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                    />
                    Enabled
                  </label>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-800">Approval Steps</p>
                  <button
                    onClick={() => setForm((p) => ({ ...p, steps: [...p.steps, { assignment_group_id: '' }] }))}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    + Add Step
                  </button>
                </div>
                <div className="space-y-2">
                  {form.steps.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-12">Step {idx + 1}</span>
                      <select
                        value={s.assignment_group_id}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            steps: p.steps.map((x, i) => (i === idx ? { assignment_group_id: e.target.value } : x)),
                          }))
                        }
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                      >
                        <option value="">Select group</option>
                        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <button
                        onClick={() => setForm((p) => ({ ...p, steps: p.steps.filter((_, i) => i !== idx) }))}
                        className="text-xs text-red-600 hover:text-red-800"
                        disabled={form.steps.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={save}
                  disabled={saving || !form.name || form.steps.every((s) => !s.assignment_group_id)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId === 'new' ? 'Create Workflow' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-16 text-center">Select a workflow or create a new one.</div>
          )}
        </Card>
      </div>
    </>
  );
}
