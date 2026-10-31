/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { catalog, cmdb } from '../../api/client';
import type { ServiceItem, Category, FormField, CIClass } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import FormBuilder from '../../components/FormBuilder';
import { formatCurrency, normalizeCurrencyCode } from '../../utils/currency';
import { formatCustomAttribute, parseCustomAttribute } from './customAttributes';
import { CATALOG_ITEM_ICONS, CatalogItemIcon, isCatalogItemIcon } from './catalogItemIcons';

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

type ServiceItemField =
  | 'name'
  | 'category_id'
  | 'short_description'
  | 'description'
  | 'icon'
  | 'price'
  | 'sla_hours'
  | 'is_active';

type ServiceItemIssue =
  | 'nameRequired'
  | 'nameTooLong'
  | 'categoryRequired'
  | 'shortDescriptionTooLong'
  | 'descriptionTooLong'
  | 'priceInvalid'
  | 'slaInvalid'
  | 'iconTooLong'
  | 'activateRequiresTask';

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function softSaveFailure(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { success?: boolean; error?: string; id?: string };
  if (body.success === false && !body.id) return body.error || 'This item was not saved.';
  return null;
}

/** Mirrors createServiceItemSchema: only name and category are required. */
function serviceItemIssues(
  form: Record<string, unknown>,
  options: { isNew: boolean; taskCount: number },
): Partial<Record<ServiceItemField, ServiceItemIssue>> {
  const issues: Partial<Record<ServiceItemField, ServiceItemIssue>> = {};
  const name = typeof form.name === 'string' ? form.name.trim() : '';
  if (!name) issues.name = 'nameRequired';
  else if (name.length > 255) issues.name = 'nameTooLong';

  const categoryId = typeof form.category_id === 'string' ? form.category_id.trim() : '';
  if (!categoryId) issues.category_id = 'categoryRequired';

  const shortDescription = typeof form.short_description === 'string' ? form.short_description : '';
  if (shortDescription.length > 500) issues.short_description = 'shortDescriptionTooLong';

  const description = typeof form.description === 'string' ? form.description : '';
  if (description.length > 5000) issues.description = 'descriptionTooLong';

  const icon = typeof form.icon === 'string' && form.icon ? form.icon : 'box';
  if (icon.length > 50) issues.icon = 'iconTooLong';

  if (form.price != null && form.price !== '') {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) issues.price = 'priceInvalid';
  }

  const sla = Number(form.sla_hours);
  if (!Number.isInteger(sla) || sla < 1) issues.sla_hours = 'slaInvalid';

  if (!options.isNew && form.is_active !== false && options.taskCount === 0) {
    issues.is_active = 'activateRequiresTask';
  }

  return issues;
}

function controlClass(invalid: boolean, extra = ''): string {
  const padding = extra.includes('pl-') || extra.includes('pr-') || extra.includes('px-') ? '' : 'px-3 ';
  return `w-full ${padding}py-2 border rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 ${
    invalid ? 'border-red-400' : 'border-gray-200'
  }${extra ? ` ${extra}` : ''}`;
}

export default function ServiceItemForm({
  item,
  categories,
  currencyCode,
  prevItemId,
  nextItemId,
  onNavigate,
  onSave,
  onCancel,
}: {
  item?: ServiceItem;
  categories: Category[];
  currencyCode: string;
  prevItemId?: string | null;
  nextItemId?: string | null;
  onNavigate?: (id: string) => void;
  onSave: (item: ServiceItem) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('pages.admin.serviceItems');
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const tIcons = useTranslations('pages.admin.serviceItems.form.icons');
  const tActions = useTranslations('common.actions');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const tMaster = useTranslations('common.masterData');
  const tMessages = useTranslations('common.messages');
  const dirtyRef = useRef(false);
  const isNew = !item;
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    if (item) return { ...item };
    return { ...EMPTY_ITEM, category_id: categories[0]?.id || '' };
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ServiceItemField, string>>>({});
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
    const entries = Object.entries(attrs).map(([k, v]) => [k, formatCustomAttribute(v, true)] as [string, string]);
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

  const markDirty = () => { dirtyRef.current = true; };

  const navigateTo = useCallback((id: string) => {
    if (!onNavigate) return;
    if (dirtyRef.current && !window.confirm(tMessages('unsavedChanges'))) return;
    onNavigate(id);
  }, [onNavigate, tMessages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isNew) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (e.key === 'ArrowLeft' && prevItemId) navigateTo(prevItemId);
      if (e.key === 'ArrowRight' && nextItemId) navigateTo(nextItemId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNew, prevItemId, nextItemId, navigateTo]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    markDirty();
    setPictureFile(f);
    setPicturePreview(URL.createObjectURL(f));
  };

  const addAttr = () => { markDirty(); setCustomAttrs([...customAttrs, ['', '']]); };
  const removeAttr = (idx: number) => { markDirty(); setCustomAttrs(customAttrs.filter((_, i) => i !== idx)); };
  const updateAttr = (idx: number, field: 0 | 1, value: string) => {
    markDirty();
    const updated = [...customAttrs];
    const entry = updated[idx];
    if (!entry) return;
    updated[idx] = [field === 0 ? value : entry[0], field === 1 ? value : entry[1]];
    setCustomAttrs(updated);
  };

  const handleSubmit = async () => {
    const issues = serviceItemIssues(form, { isNew, taskCount: item?.task_count ?? 0 });
    if (Object.keys(issues).length > 0) {
      const messages: Partial<Record<ServiceItemField, string>> = {};
      for (const [field, key] of Object.entries(issues) as [ServiceItemField, ServiceItemIssue][]) {
        messages[field] = tForm(key);
      }
      setFieldErrors(messages);
      setFormError(tForm('validationFailed'));
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      // Build custom_attributes from editor
      const attrs: Record<string, unknown> = {};
      for (const [k, v] of customAttrs) {
        if (k.trim()) attrs[k.trim()] = parseCustomAttribute(v);
      }

      const name = typeof form.name === 'string' ? form.name.trim() : '';
      const payload: Record<string, unknown> = {
        category_id: form.category_id,
        name,
        icon: form.icon || 'box',
        price: form.price != null && form.price !== '' ? Number(form.price) : null,
        custom_attributes: attrs,
        form_schema: form.form_schema || { fields: [] },
        approval_required: form.approval_required ?? false,
        sla_hours: Number(form.sla_hours),
        is_active: form.is_active ?? true,
      };
      const shortDescription = optionalText(form.short_description);
      const description = optionalText(form.description);
      if (shortDescription) payload.short_description = shortDescription;
      if (description) payload.description = description;

      let saved: ServiceItem;
      if (isNew) {
        saved = await catalog.createItem(payload as Partial<ServiceItem>);
      } else {
        saved = await catalog.updateItem(item!.id, payload as Partial<ServiceItem>);
      }

      const rejected = softSaveFailure(saved);
      if (rejected) {
        setFormError(rejected);
        return;
      }

      // Upload picture if changed
      if (pictureFile) {
        saved = await catalog.uploadPicture(saved.id, pictureFile);
      }

      onSave(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      const expectedValidation = message.startsWith('Validation failed')
        || message.includes('Cannot activate a service item');
      if (!expectedValidation) console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: unknown) => {
    markDirty();
    setForm({ ...form, [key]: value });
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key as ServiceItemField];
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title={isNew ? t('newServiceItem') : t('editServiceItem', { name: item!.name })}
        description={!isNew && (prevItemId || nextItemId) ? tMaster('navigateRecords') : undefined}
        action={
          <div className="flex items-center gap-2">
            {!isNew && (
              <>
                <button
                  type="button"
                  disabled={!prevItemId}
                  onClick={() => prevItemId && navigateTo(prevItemId)}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={tMaster('previousEntity', { entity: t('entity') })}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={!nextItemId}
                  onClick={() => nextItemId && navigateTo(nextItemId)}
                  className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={tMaster('nextEntity', { entity: t('entity') })}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {tActions('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tActions('saving') : isNew ? tForm('createServiceItem') : tMaster('saveChanges')}
            </button>
          </div>
        }
      />

      {formError && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start justify-between gap-3"
        >
          <div>
            <p>{formError}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(fieldErrors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFormError(null)}
            className="shrink-0 text-red-500 hover:text-red-800 leading-none"
            aria-label={tActions('dismiss')}
          >
            &times;
          </button>
        </div>
      )}

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
                  aria-required="true"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  className={controlClass(!!fieldErrors.name)}
                  placeholder={tForm('namePlaceholder')}
                  maxLength={255}
                />
                {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('category')} *</label>
                <select
                  value={(form.category_id as string) || ''}
                  onChange={(e) => set('category_id', e.target.value)}
                  aria-required="true"
                  aria-invalid={fieldErrors.category_id ? true : undefined}
                  className={controlClass(!!fieldErrors.category_id)}
                >
                  <option value="">{tForm('selectCategory')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {fieldErrors.category_id && <p className="text-xs text-red-600 mt-1">{fieldErrors.category_id}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('icon')}</label>
                <div className="flex flex-wrap gap-2" role="group" aria-label={tFields('icon')}>
                  {CATALOG_ITEM_ICONS.map(({ value }) => {
                    const selected = ((form.icon as string) || 'box') === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        title={tIcons(value)}
                        aria-label={tIcons(value)}
                        aria-pressed={selected}
                        onClick={() => set('icon', value)}
                        className={`p-2 rounded-lg border-2 transition-all text-gray-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <CatalogItemIcon name={value} />
                      </button>
                    );
                  })}
                </div>
                {(form.icon as string) && !isCatalogItemIcon(form.icon as string) && (
                  <p className="text-xs text-gray-400 mt-1">{tForm('currentIcon', { icon: form.icon as string })}</p>
                )}
                {fieldErrors.icon && <p className="text-xs text-red-600 mt-1">{fieldErrors.icon}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('shortDescription')}</label>
                <input
                  value={(form.short_description as string) || ''}
                  onChange={(e) => set('short_description', e.target.value)}
                  aria-invalid={fieldErrors.short_description ? true : undefined}
                  className={controlClass(!!fieldErrors.short_description)}
                  placeholder={tForm('shortDescriptionPlaceholder')}
                  maxLength={500}
                />
                {fieldErrors.short_description && <p className="text-xs text-red-600 mt-1">{fieldErrors.short_description}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('description')}</label>
                <textarea
                  value={(form.description as string) || ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  aria-invalid={fieldErrors.description ? true : undefined}
                  className={controlClass(!!fieldErrors.description, 'resize-none')}
                  placeholder={tForm('descriptionPlaceholder')}
                  maxLength={5000}
                />
                {fieldErrors.description && <p className="text-xs text-red-600 mt-1">{fieldErrors.description}</p>}
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
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  {val.includes('\n') ? (
                    <textarea
                      value={val}
                      onChange={(e) => updateAttr(idx, 1, e.target.value)}
                      rows={Math.min(8, val.split('\n').length)}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-hidden focus:ring-2 focus:ring-indigo-500 resize-y"
                    />
                  ) : (
                    <input
                      value={val}
                      onChange={(e) => updateAttr(idx, 1, e.target.value)}
                      placeholder={tFields('value')}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                  <button onClick={() => removeAttr(idx)} className="text-red-400 hover:text-red-600 text-sm shrink-0 px-1">&times;</button>
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
                    aria-invalid={fieldErrors.price ? true : undefined}
                    className={controlClass(!!fieldErrors.price, 'pl-16 pr-3')}
                    placeholder={tForm('pricePlaceholder')}
                  />
                </div>
                {fieldErrors.price && <p className="text-xs text-red-600 mt-1">{fieldErrors.price}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{tForm('slaHoursLabel')}</label>
                <input
                  type="number"
                  min="1"
                  value={form.sla_hours ? String(form.sla_hours) : ''}
                  onChange={(e) => set('sla_hours', parseInt(e.target.value, 10) || 72)}
                  aria-invalid={fieldErrors.sla_hours ? true : undefined}
                  className={controlClass(!!fieldErrors.sla_hours)}
                />
                {fieldErrors.sla_hours && <p className="text-xs text-red-600 mt-1">{fieldErrors.sla_hours}</p>}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!form.approval_required}
                    onChange={(e) => set('approval_required', e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded-sm border-gray-300 focus:ring-indigo-500"
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
                  className="w-4 h-4 text-indigo-600 rounded-sm border-gray-300 focus:ring-indigo-500"
                  id="is_active"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">{tStates('active')}</label>
              </div>
              {fieldErrors.is_active && <p className="text-xs text-red-600">{fieldErrors.is_active}</p>}
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
                <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <CatalogItemIcon name={(form.icon as string) || 'box'} className="size-4 shrink-0 text-gray-500" />
                  <span>{(form.name as string) || tForm('previewNamePlaceholder')}</span>
                </h4>
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
        </div>
      </div>
    </>
  );
}
