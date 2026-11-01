/* SPDX-License-Identifier: AGPL-3.0-only */
import type { RefObject } from 'react';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import type { Category, CIClass, FormField, FulfillmentModel } from '../../api/client';
import { fulfillmentGroupTasks } from '../../api/types/catalog';
import Card from '../../components/Card';
import FormBuilder from '../../components/FormBuilder';
import { formatCurrency } from '../../utils/currency';
import { CatalogItemIcon } from './catalogItemIcons';
import { CATALOG_ITEM_ICONS, isCatalogItemIcon } from './catalogItemIconSet';
import { blobPreviewUrl, controlClass, type ServiceItemFieldErrors } from './serviceItemFormModel';

type SetField = (key: string, value: unknown) => void;

export function ServiceItemBasicCard({
  form,
  categories,
  fieldErrors,
  set,
}: {
  form: Record<string, unknown>;
  categories: Category[];
  fieldErrors: ServiceItemFieldErrors;
  set: SetField;
}) {
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const tIcons = useTranslations('pages.admin.serviceItems.form.icons');
  const tFields = useTranslations('common.fields');

  return (
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
  );
}

export function ServiceItemPictureCard({
  picturePreview,
  fileRef,
  onFileChange,
  onClear,
}: {
  picturePreview: string;
  fileRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const safePicturePreview = blobPreviewUrl(picturePreview);
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tForm('picture')}</h3>
      {safePicturePreview ? (
        <div className="mb-4 relative inline-block">
          <img src={encodeURI(safePicturePreview)} className="max-h-48 rounded-lg object-cover" alt={tForm('picturePreviewAlt')} />
          <button
            onClick={onClear}
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
      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      {!safePicturePreview && (
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-3 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {tForm('chooseFile')}
        </button>
      )}
    </Card>
  );
}

export function ServiceItemAttributesCard({
  customAttrs,
  onAdd,
  onRemove,
  onUpdate,
}: {
  customAttrs: [string, string][];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onUpdate: (idx: number, field: 0 | 1, value: string) => void;
}) {
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const tFields = useTranslations('common.fields');
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{tForm('customAttributes')}</h3>
        <button onClick={onAdd} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">{tForm('addAttribute')}</button>
      </div>
      <div className="space-y-2">
        {customAttrs.map(([key, val], idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              value={key}
              onChange={(e) => onUpdate(idx, 0, e.target.value)}
              placeholder={tForm('attributeNamePlaceholder')}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            {val.includes('\n') ? (
              <textarea
                value={val}
                onChange={(e) => onUpdate(idx, 1, e.target.value)}
                rows={Math.min(8, val.split('\n').length)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-hidden focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            ) : (
              <input
                value={val}
                onChange={(e) => onUpdate(idx, 1, e.target.value)}
                placeholder={tFields('value')}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            )}
            <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600 text-sm shrink-0 px-1">&times;</button>
          </div>
        ))}
        {customAttrs.length === 0 && (
          <p className="text-xs text-gray-400">{tForm('noCustomAttributes')}</p>
        )}
      </div>
    </Card>
  );
}

export function ServiceItemRequestFormCard({
  fields,
  ciClasses,
  onChange,
}: {
  fields: FormField[];
  ciClasses: CIClass[];
  onChange: (fields: FormField[]) => void;
}) {
  const tForm = useTranslations('pages.admin.serviceItems.form');
  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">
          {tForm('requestForm')}
          {fields.length > 0 && (
            <span className="ml-2 text-xs font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
              {tForm('fieldCount', { count: fields.length })}
            </span>
          )}
        </h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">{tForm('requestFormHint')}</p>
      <FormBuilder fields={fields} onChange={onChange} ciClasses={ciClasses} />
    </Card>
  );
}

export function ServiceItemSettingsCard({
  form,
  fieldErrors,
  currencyCode,
  fulfillmentModels,
  set,
}: {
  form: Record<string, unknown>;
  fieldErrors: ServiceItemFieldErrors;
  currencyCode: string;
  fulfillmentModels: FulfillmentModel[];
  set: SetField;
}) {
  const t = useTranslations('pages.admin.serviceItems');
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const tFields = useTranslations('common.fields');
  const tStates = useTranslations('common.states');
  const selectedModel = fulfillmentModels.find((model) => model.id === form.fulfillment_model_id);
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-4">{tForm('settings')}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tFields('price')}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs uppercase">
              {currencyCode}
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
          <p className="text-xs text-gray-500 pl-7">{tForm('approvalHint')}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{tForm('fulfillmentModel')}</label>
          <select
            value={(form.fulfillment_model_id as string) || ''}
            onChange={(e) => set('fulfillment_model_id', e.target.value || null)}
            className={controlClass(false)}
          >
            <option value="">{tForm('fulfillmentModelNone')}</option>
            {fulfillmentModels.map((model) => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">{tForm('fulfillmentModelHint')}</p>
          {selectedModel && (
            <ul className="mt-2 text-xs text-gray-600 list-disc pl-4 space-y-1">
              {fulfillmentGroupTasks(selectedModel.config).map((task, index) => (
                <li key={`${task.name}-${index}`}>
                  {tForm('modelSummaryTask', {
                    name: task.name,
                    group: selectedModel.task_group_names?.[index] || '',
                  })}
                </li>
              ))}
              {selectedModel.config.ci?.enabled && <li>{tForm('modelSummaryCi')}</li>}
              {selectedModel.config.asset?.enabled && <li>{tForm('modelSummaryAsset')}</li>}
            </ul>
          )}
          <Link to="/admin/fulfillment-models" className="inline-block mt-2 text-xs text-indigo-700 hover:underline">
            {tForm('openFulfillmentModels')}
          </Link>
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
  );
}

export function ServiceItemPreviewCard({
  form,
  picturePreview,
  currencyCode,
}: {
  form: Record<string, unknown>;
  picturePreview: string;
  currencyCode: string;
}) {
  const t = useTranslations('pages.admin.serviceItems');
  const tForm = useTranslations('pages.admin.serviceItems.form');
  const safePicturePreview = blobPreviewUrl(picturePreview);
  return (
    <Card>
      <h3 className="font-semibold text-gray-900 mb-3">{tForm('preview')}</h3>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {safePicturePreview && (
          <img src={encodeURI(safePicturePreview)} className="w-full h-32 object-cover" alt="" />
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
                {formatCurrency(Number(form.price), currencyCode)}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{tForm('free')}</span>
            )}
            <span className="text-xs text-gray-400">{t('slaHours', { hours: String(form.sla_hours || 72) })}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
