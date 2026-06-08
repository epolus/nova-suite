/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { catalog, cmdb } from '../../api/client';
import type { ServiceItem, Category, FormField, CIClass } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import FormBuilder from '../../components/FormBuilder';
import { formatCurrency, normalizeCurrencyCode } from '../../utils/currency';

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

export default function ServiceItemForm({
  item,
  categories,
  currencyCode,
  onSave,
  onCancel,
}: {
  item?: ServiceItem;
  categories: Category[];
  currencyCode: string;
  onSave: (item: ServiceItem) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('pages.admin.serviceItems');
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const tMaster = useTranslations('common.masterData');
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
  const normalizedCurrency = normalizeCurrencyCode(currencyCode);

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
    let objectUrl = '';
    if (item?.picture_storage_key) {
      const token = localStorage.getItem('nova_token');
      fetch(`/api/catalog/items/${item.id}/picture`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
        .then((blob) => { objectUrl = URL.createObjectURL(blob); setPicturePreview(objectUrl); })
        .catch(() => {});
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item?.id, item?.picture_storage_key]);

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
        title={isNew ? t('newServiceItem') : t('editServiceItem', { name: item!.name })}
        action={
          <button onClick={onCancel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            &larr; {tActions('cancel')}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tForm('basicInformation')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('name')} *</label>
                <input
                  value={(form.name as string) || ''}
                  onChange={(e) => set('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={tForm('namePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('category')} *</label>
                <select
                  value={(form.category_id as string) || ''}
                  onChange={(e) => set('category_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{tForm('selectCategory')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('icon')}</label>
                <input
                  value={(form.icon as string) || ''}
                  onChange={(e) => set('icon', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={tForm('iconPlaceholder')}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('shortDescription')}</label>
                <input
                  value={(form.short_description as string) || ''}
                  onChange={(e) => set('short_description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder={tForm('shortDescriptionPlaceholder')}
                  maxLength={500}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('description')}</label>
                <textarea
                  value={(form.description as string) || ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder={tForm('descriptionPlaceholder')}
                />
              </div>
            </div>
          </Card>

          {/* Picture */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">{tForm('picture')}</h3>
            {picturePreview ? (
              <div className="mb-4 relative inline-block">
                <img src={picturePreview} className="max-h-48 rounded-lg object-cover" alt={tForm('picturePreviewAlt')} />
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
                <p className="text-sm text-gray-400">{tForm('uploadHint')}</p>
                <p className="text-xs text-gray-300 mt-1">{tForm('uploadFormats')}</p>
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
                {tForm('chooseFile')}
              </button>
            )}
          </Card>

          {/* Custom Attributes */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{tForm('customAttributes')}</h3>
              <button onClick={addAttr} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">{tForm('addAttribute')}</button>
            </div>
            <div className="space-y-2">
              {customAttrs.map(([key, val], idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={key}
                    onChange={(e) => updateAttr(idx, 0, e.target.value)}
                    placeholder={tForm('attributeNamePlaceholder')}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    value={val}
                    onChange={(e) => updateAttr(idx, 1, e.target.value)}
                    placeholder={tFields('value')}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => removeAttr(idx)} className="text-red-400 hover:text-red-600 text-sm flex-shrink-0 px-1">&times;</button>
                </div>
              ))}
              {customAttrs.length === 0 && (
                <p className="text-xs text-gray-400">{tForm('noCustomAttributes')}</p>
              )}
            </div>
          </Card>

          {/* Request Form Builder */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {tForm('requestForm')}
                {((form.form_schema as { fields: FormField[] })?.fields || []).length > 0 && (
                  <span className="ml-2 text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                    {tForm('fieldCount', { count: (form.form_schema as { fields: FormField[] }).fields.length })}
                  </span>
                )}
              </h3>
            </div>
            <p className="text-xs text-gray-400 mb-3">{tForm('requestFormHint')}</p>
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
            <h3 className="font-semibold text-gray-900 mb-4">{tForm('settings')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('price')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs uppercase">
                    {normalizedCurrency}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price != null && form.price !== '' ? String(form.price) : ''}
                    onChange={(e) => set('price', e.target.value === '' ? null : e.target.value)}
                    className="w-full pl-16 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={tForm('pricePlaceholder')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tForm('slaHoursLabel')}</label>
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
                  <label htmlFor="approval_required" className="text-sm text-gray-700">{t('managerApproval')}</label>
                </div>
                <p className="text-xs text-gray-500 pl-7">
                  {tForm('approvalHint')}
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
                <label htmlFor="is_active" className="text-sm text-gray-700">{tStates('active')}</label>
              </div>
            </div>
          </Card>

          {/* Live preview */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-3">{tForm('preview')}</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {picturePreview && (
                <img src={picturePreview} className="w-full h-32 object-cover" alt="" />
              )}
              <div className="p-3">
                <h4 className="font-semibold text-gray-900 text-sm">{(form.name as string) || tForm('previewNamePlaceholder')}</h4>
                <p className="text-xs text-gray-500 mt-1">{(form.short_description as string) || tForm('previewShortDescriptionPlaceholder')}</p>
                <div className="flex items-center justify-between mt-2">
                  {form.price != null && form.price !== '' ? (
                    <span className="text-sm font-semibold text-green-700">
                      {formatCurrency(Number(form.price), normalizedCurrency)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">{tForm('free')}</span>
                  )}
                  <span className="text-xs text-gray-400">{t('slaHours', { hours: String(form.sla_hours || 72) })}</span>
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
            {saving ? tActions('saving') : isNew ? tForm('createServiceItem') : tMaster('saveChanges')}
          </button>
        </div>
      </div>
    </>
  );
}
