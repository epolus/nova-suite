/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useMemo } from 'react';
import { catalog, cmdb } from '../../api/client';
import type { ServiceItem, Category, FormField, CIClass } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import SearchBar from '../../components/SearchBar';
import FormBuilder from '../../components/FormBuilder';

const EMPTY_ITEM: Partial<ServiceItem> = {
  name: '',
  short_description: '',
  description: '',
  icon: 'box',
  price: null,
  custom_attributes: {},
  form_schema: { fields: [] },
  approval_required: false,
  sla_hours: 72,
  is_active: false,
};

export default function ServiceItemsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      catalog.allItems(),
      catalog.categories(),
    ]).then(([itemsRes, catsRes]) => {
      setItems(itemsRes.items);
      setCategories(catsRes.categories);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.short_description && i.short_description.toLowerCase().includes(q)) ||
      (i.category_name && i.category_name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const handleSaved = (item: ServiceItem) => {
    if (creating) {
      setItems([...items, item]);
      setCreating(false);
    } else {
      setItems(items.map((i) => (i.id === item.id ? item : i)));
      setEditing(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this service item?')) return;
    await catalog.deleteItem(id);
    setItems(items.map((i) => (i.id === id ? { ...i, is_active: false } : i)));
  };

  if (loading) return <Spinner />;

  if (creating || editing) {
    return (
      <ServiceItemForm
        item={editing || undefined}
        categories={categories}
        onSave={handleSaved}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Service Item Designer"
        description="Create and manage service catalog items."
        action={
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Item
          </button>
        }
      />

      <div className="mb-4 w-full sm:w-80">
        <SearchBar value={search} onChange={setSearch} placeholder="Search items..." />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {search ? `No items matching "${search}"` : 'No service items yet. Create one to get started.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <Card key={item.id} className={`relative transition-shadow hover:shadow-md ${!item.is_active ? 'opacity-50' : ''}`}>
              {/* Picture */}
              {item.picture_storage_key && (
                <div className="mb-3 -mx-5 -mt-5 rounded-t-xl overflow-hidden">
                  <AuthImage itemId={item.id} className="w-full h-40 object-cover" />
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                  <p className="text-xs text-indigo-500 mt-0.5">{item.category_name}</p>
                </div>
                {item.price != null && (
                  <span className="text-sm font-semibold text-green-700 flex-shrink-0 ml-2">
                    ${Number(item.price).toFixed(2)}
                  </span>
                )}
              </div>
              {item.short_description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{item.short_description}</p>
              )}
              {/* Custom attributes preview */}
              {item.custom_attributes && Object.keys(item.custom_attributes as Record<string, unknown>).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(item.custom_attributes as Record<string, unknown>).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {k}: {String(v)}
                    </span>
                  ))}
                  {Object.keys(item.custom_attributes as Record<string, unknown>).length > 3 && (
                    <span className="text-xs text-gray-400">+{Object.keys(item.custom_attributes as Record<string, unknown>).length - 3} more</span>
                  )}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.approval_required && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Manager approval</span>
                  )}
                  <span className="text-xs text-gray-400">SLA: {item.sla_hours}h</span>
                  {!item.is_active && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(item)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
                  {item.is_active && (
                    <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Deactivate</button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Authenticated image component ─── */
function AuthImage({ itemId, className }: { itemId: string; className?: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    const token = localStorage.getItem('nova_token');
    fetch(`/api/catalog/items/${itemId}/picture`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
      .then((blob) => setSrc(URL.createObjectURL(blob)))
      .catch(() => {});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [itemId]);

  if (!src) return null;
  return <img src={src} className={className} alt="" />;
}

/* ─── Form (create/edit) ─── */
function ServiceItemForm({
  item,
  categories,
  onSave,
  onCancel,
}: {
  item?: ServiceItem;
  categories: Category[];
  onSave: (item: ServiceItem) => void;
  onCancel: () => void;
}) {
  const isNew = !item;
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    if (item) return { ...item };
    return { ...EMPTY_ITEM, category_id: categories[0]?.id || '' };
  });
  const [saving, setSaving] = useState(false);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [ciClasses, setCiClasses] = useState<CIClass[]>([]);

  useEffect(() => {
    cmdb.classes().then((res) => setCiClasses(res.classes)).catch(() => {});
  }, []);

  // Custom attributes editor
  const [customAttrs, setCustomAttrs] = useState<[string, string][]>(() => {
    const attrs = (item?.custom_attributes || {}) as Record<string, unknown>;
    const entries = Object.entries(attrs).map(([k, v]) => [k, String(v)] as [string, string]);
    return entries.length > 0 ? entries : [['', '']];
  });

  // Picture preview for existing items
  useEffect(() => {
    if (item?.picture_storage_key) {
      const token = localStorage.getItem('nova_token');
      fetch(`/api/catalog/items/${item.id}/picture`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
        .then((blob) => setPicturePreview(URL.createObjectURL(blob)))
        .catch(() => {});
    }
    return () => { if (picturePreview) URL.revokeObjectURL(picturePreview); };
  }, [item?.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPictureFile(f);
    setPicturePreview(URL.createObjectURL(f));
  };

  const addAttr = () => setCustomAttrs([...customAttrs, ['', '']]);
  const removeAttr = (idx: number) => setCustomAttrs(customAttrs.filter((_, i) => i !== idx));
  const updateAttr = (idx: number, field: 0 | 1, value: string) => {
    const updated = [...customAttrs];
    const entry = updated[idx];
    if (!entry) return;
    updated[idx] = [field === 0 ? value : entry[0], field === 1 ? value : entry[1]];
    setCustomAttrs(updated);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      // Build custom_attributes from editor
      const attrs: Record<string, string> = {};
      for (const [k, v] of customAttrs) {
        if (k.trim()) attrs[k.trim()] = v;
      }

      const payload: Record<string, unknown> = {
        category_id: form.category_id,
        name: form.name,
        short_description: form.short_description || null,
        description: form.description || null,
        icon: form.icon || 'box',
        price: form.price != null && form.price !== '' ? Number(form.price) : null,
        custom_attributes: attrs,
        form_schema: form.form_schema || { fields: [] },
        approval_required: form.approval_required ?? false,
        sla_hours: Number(form.sla_hours) || 72,
        is_active: form.is_active ?? true,
      };

      let saved: ServiceItem;
      if (isNew) {
        saved = await catalog.createItem(payload as Partial<ServiceItem>);
      } else {
        saved = await catalog.updateItem(item!.id, payload as Partial<ServiceItem>);
      }

      // Upload picture if changed
      if (pictureFile) {
        saved = await catalog.uploadPicture(saved.id, pictureFile);
      }

      onSave(saved);
    } catch (err) {
      console.error(err);
      alert(String(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: unknown) => setForm({ ...form, [key]: value });

  return (
    <>
      <PageHeader
        title={isNew ? 'New Service Item' : `Edit: ${item!.name}`}
        action={
          <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            &larr; Cancel
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input
                  value={(form.name as string) || ''}
                  onChange={(e) => set('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. New Employee Onboarding"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category *</label>
                <select
                  value={(form.category_id as string) || ''}
                  onChange={(e) => set('category_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select category...</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Icon</label>
                <input
                  value={(form.icon as string) || ''}
                  onChange={(e) => set('icon', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="box"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Short Description</label>
                <input
                  value={(form.short_description as string) || ''}
                  onChange={(e) => set('short_description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Brief summary shown in catalog cards"
                  maxLength={500}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                <textarea
                  value={(form.description as string) || ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Detailed description of this service..."
                />
              </div>
            </div>
          </Card>

          {/* Picture */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Picture</h3>
            {picturePreview ? (
              <div className="mb-4 relative inline-block">
                <img src={picturePreview} className="max-h-48 rounded-lg object-cover" alt="Preview" />
                <button
                  onClick={() => { setPictureFile(null); setPicturePreview(''); if (fileRef.current) fileRef.current.value = ''; }}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                >
                  &times;
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-300 transition-colors"
              >
                <p className="text-sm text-gray-400">Click to upload an image</p>
                <p className="text-xs text-gray-300 mt-1">JPG, PNG, WEBP, GIF</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {!picturePreview && (
              <button
                onClick={() => fileRef.current?.click()}
                className="mt-3 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Choose File
              </button>
            )}
          </Card>

          {/* Custom Attributes */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Custom Attributes</h3>
              <button onClick={addAttr} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ Add Attribute</button>
            </div>
            <div className="space-y-2">
              {customAttrs.map(([key, val], idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={key}
                    onChange={(e) => updateAttr(idx, 0, e.target.value)}
                    placeholder="Attribute name"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    value={val}
                    onChange={(e) => updateAttr(idx, 1, e.target.value)}
                    placeholder="Value"
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => removeAttr(idx)} className="text-red-400 hover:text-red-600 text-sm flex-shrink-0 px-1">&times;</button>
                </div>
              ))}
              {customAttrs.length === 0 && (
                <p className="text-xs text-gray-400">No custom attributes. Click "+ Add Attribute" to add one.</p>
              )}
            </div>
          </Card>

          {/* Request Form Builder */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                Request Form
                {((form.form_schema as { fields: FormField[] })?.fields || []).length > 0 && (
                  <span className="ml-2 text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    {(form.form_schema as { fields: FormField[] }).fields.length} field{(form.form_schema as { fields: FormField[] }).fields.length !== 1 ? 's' : ''}
                  </span>
                )}
              </h3>
            </div>
            <p className="text-xs text-gray-400 mb-3">Define the fields users must fill out when requesting this item.</p>
            <FormBuilder
              fields={(form.form_schema as { fields: FormField[] })?.fields || []}
              onChange={(fields) => set('form_schema', { fields })}
              ciClasses={ciClasses}
            />
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price != null && form.price !== '' ? String(form.price) : ''}
                    onChange={(e) => set('price', e.target.value === '' ? null : e.target.value)}
                    className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">SLA (hours)</label>
                <input
                  type="number"
                  min="1"
                  value={form.sla_hours ? String(form.sla_hours) : ''}
                  onChange={(e) => set('sla_hours', parseInt(e.target.value, 10) || 72)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!form.approval_required}
                    onChange={(e) => set('approval_required', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    id="approval_required"
                  />
                  <label htmlFor="approval_required" className="text-sm text-gray-700">Manager approval</label>
                </div>
                <p className="text-xs text-gray-500 pl-7">
                  {'When enabled, the request subject\u2019s manager must approve before fulfilment tasks run. If they have no manager on file, the approval step is recorded as skipped.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.is_active !== false}
                  onChange={(e) => set('is_active', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                  id="is_active"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
              </div>
            </div>
          </Card>

          {/* Live preview */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">Preview</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {picturePreview && (
                <img src={picturePreview} className="w-full h-32 object-cover" alt="" />
              )}
              <div className="p-3">
                <h4 className="font-semibold text-gray-900 text-sm">{(form.name as string) || 'Item Name'}</h4>
                <p className="text-xs text-gray-500 mt-1">{(form.short_description as string) || 'Short description...'}</p>
                <div className="flex items-center justify-between mt-2">
                  {form.price != null && form.price !== '' ? (
                    <span className="text-sm font-semibold text-green-700">${Number(form.price).toFixed(2)}</span>
                  ) : (
                    <span className="text-xs text-gray-400">Free</span>
                  )}
                  <span className="text-xs text-gray-400">SLA: {String(form.sla_hours || 72)}h</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Save */}
          <button
            onClick={handleSubmit}
            disabled={saving || !(form.name as string)?.trim() || !(form.category_id as string)}
            className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isNew ? 'Create Service Item' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
