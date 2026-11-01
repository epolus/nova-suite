/* SPDX-License-Identifier: AGPL-3.0-only */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { catalog, cmdb } from '../../api/client';
import type { ServiceItem, Category, FormField, CIClass, FulfillmentModel } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import { normalizeCurrencyCode } from '../../utils/currency';
import { formatCustomAttribute, parseCustomAttribute } from './customAttributes';
import {
  EMPTY_SERVICE_ITEM,
  optionalText,
  serviceItemIssues,
  softSaveFailure,
  type ServiceItemField,
  type ServiceItemFieldErrors,
  type ServiceItemIssue,
} from './serviceItemFormModel';
import {
  ServiceItemAttributesCard,
  ServiceItemBasicCard,
  ServiceItemPictureCard,
  ServiceItemPreviewCard,
  ServiceItemRequestFormCard,
  ServiceItemSettingsCard,
} from './ServiceItemFormSections';

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
  const tActions = useTranslations('common.actions');
  const tMaster = useTranslations('common.masterData');
  const tMessages = useTranslations('common.messages');
  const dirtyRef = useRef(false);
  const isNew = !item;
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    if (item) return { ...item };
    return { ...EMPTY_SERVICE_ITEM, category_id: categories[0]?.id || '' };
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ServiceItemFieldErrors>({});
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [ciClasses, setCiClasses] = useState<CIClass[]>([]);
  const [fulfillmentModels, setFulfillmentModels] = useState<FulfillmentModel[]>([]);
  const normalizedCurrency = normalizeCurrencyCode(currencyCode);

  useEffect(() => {
    cmdb.classes().then((res) => setCiClasses(res.classes)).catch(() => {});
    catalog.fulfillmentModels().then((res) => setFulfillmentModels(res.fulfillment_models)).catch(() => {});
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
        .then((blob) => {
          objectUrl = URL.createObjectURL(blob);
          if (objectUrl.startsWith('blob:')) setPicturePreview(objectUrl);
        })
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
    if (!f.type.startsWith('image/')) return;
    const previewUrl = URL.createObjectURL(f);
    if (!previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
      return;
    }
    markDirty();
    setPictureFile(f);
    setPicturePreview(previewUrl);
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
      const messages: ServiceItemFieldErrors = {};
      for (const [field, key] of Object.entries(issues) as [ServiceItemField, ServiceItemIssue][]) {
        messages[field] = tForm(key);
      }
      setFieldErrors(messages);
      setFormError(tForm('validationFailed'));
      return;
    }

    const modelId = typeof form.fulfillment_model_id === 'string' ? form.fulfillment_model_id.trim() : '';
    if (modelId && (item?.task_count ?? 0) > 0) {
      setFormError(tForm('modelAndTasks'));
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
        fulfillment_model_id: typeof form.fulfillment_model_id === 'string' && form.fulfillment_model_id
          ? form.fulfillment_model_id
          : null,
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
        <div className="lg:col-span-2 space-y-6">
          <ServiceItemBasicCard form={form} categories={categories} fieldErrors={fieldErrors} set={set} />
          <ServiceItemPictureCard
            picturePreview={picturePreview}
            fileRef={fileRef}
            onFileChange={handleFileChange}
            onClear={() => {
              setPictureFile(null);
              setPicturePreview('');
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <ServiceItemAttributesCard
            customAttrs={customAttrs}
            onAdd={addAttr}
            onRemove={removeAttr}
            onUpdate={updateAttr}
          />
          <ServiceItemRequestFormCard
            fields={(form.form_schema as { fields: FormField[] })?.fields || []}
            ciClasses={ciClasses}
            onChange={(fields) => set('form_schema', { fields })}
          />
        </div>
        <div className="space-y-6">
          <ServiceItemSettingsCard
            form={form}
            fieldErrors={fieldErrors}
            currencyCode={normalizedCurrency}
            fulfillmentModels={fulfillmentModels}
            set={set}
          />
          <ServiceItemPreviewCard
            form={form}
            picturePreview={picturePreview}
            currencyCode={normalizedCurrency}
          />
        </div>
      </div>
    </>
  );
}
