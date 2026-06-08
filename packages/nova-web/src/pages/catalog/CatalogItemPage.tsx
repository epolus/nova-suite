/* SPDX-License-Identifier: AGPL-3.0-only */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslations } from 'use-intl';
import { catalog } from '../../api/client';
import type { FormField, ServiceItem } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import Card from '../../components/Card';
import Spinner from '../../components/Spinner';
import DynamicFormField from '../../components/DynamicFormField';
import { useCart, type CartItem } from '../../context/CartContext';
import { catalogPictureFrameBaseClass } from './catalogPictureFrame';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../utils/currency';
import { useStatusLabel } from '@/i18n/hooks';

function CatalogImage({ itemId }: { itemId: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    let objectUrl = '';
    const token = localStorage.getItem('nova_token');
    fetch(`/api/catalog/items/${itemId}/picture`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => { if (res.ok) return res.blob(); throw new Error(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); })
      .catch(() => {});
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [itemId]);
  if (!src) return null;
  return (
    <div className={`w-full h-56 rounded-xl mb-4 ${catalogPictureFrameBaseClass}`}>
      <img src={src} className="max-w-full max-h-full object-contain" alt="" />
    </div>
  );
}

function validateFormData(
  fields: FormField[],
  data: Record<string, string>,
  t: (key: 'fieldRequired' | 'mustBeNumber' | 'minValue' | 'maxValue' | 'dateNotPast' | 'patternMismatch', values?: Record<string, string | number>) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  for (const field of fields) {
    const val = data[field.name] || '';
    if (field.required && !val.trim() && field.type !== 'checkbox') {
      errors[field.name] = t('fieldRequired', { field: field.label || field.name });
      continue;
    }
    if (!val) continue;
    if (field.type === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) { errors[field.name] = t('mustBeNumber'); continue; }
      if (field.min != null && n < field.min) { errors[field.name] = t('minValue', { min: field.min }); continue; }
      if (field.max != null && n > field.max) { errors[field.name] = t('maxValue', { max: field.max }); continue; }
    }
    if (field.type === 'date') {
      if (val < todayIso) {
        errors[field.name] = t('dateNotPast');
      }
      continue;
    }
    if (field.pattern) {
      try {
        if (!new RegExp(field.pattern).test(val)) {
          errors[field.name] = t('patternMismatch');
        }
      } catch {
        // ignore invalid regex from malformed schema values
      }
    }
  }
  return errors;
}

const PRIORITY_VALUES: CartItem['priority'][] = ['low', 'medium', 'high', 'critical'];

export default function CatalogItemPage() {
  const t = useTranslations('pages.catalog');
  const tValidation = useTranslations('common.validation');
  const tFields = useTranslations('common.fields');
  const statusLabel = useStatusLabel();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { theme } = useTheme();

  const [item, setItem] = useState<ServiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<CartItem['priority']>('medium');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    catalog.item(id)
      .then((res) => {
        setItem(res);
        const initial: Record<string, string> = {};
        const fields = res.form_schema?.fields || [];
        for (const f of fields) {
          if (f.defaultValue) initial[f.name] = f.defaultValue;
        }
        setFormData(initial);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('loadFailed'));
      })
      .finally(() => setLoading(false));
  }, [id, t]);

  const fields = useMemo<FormField[]>(() => item?.form_schema?.fields || [], [item]);

  const validate = useCallback(
    (fieldsToValidate: FormField[], data: Record<string, string>) =>
      validateFormData(fieldsToValidate, data, tValidation),
    [tValidation],
  );

  const handleAddToCart = () => {
    if (!item) return;
    const errs = validate(fields, formData);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    addItem(item, formData, priority, notes);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (loading) return <Spinner />;
  if (!item) {
    return (
      <>
        <PageHeader title={t('itemTitle')} description={t('itemNotFound')} />
        <Card>
          <p className="text-sm text-gray-500 mb-4">{error || t('itemUnavailable')}</p>
          <Link to="/catalog" className="text-indigo-600 text-sm font-medium hover:text-indigo-800">
            {t('backToCatalog')}
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={item.name}
        description={item.short_description || t('configureDescription')}
        action={(
          <button
            type="button"
            onClick={() => navigate('/catalog')}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('backToCatalogShort')}
          </button>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            {item.picture_storage_key && <CatalogImage itemId={item.id} />}
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-indigo-500 mb-1">{item.category_name}</p>
                <h2 className="text-xl font-semibold text-gray-900">{item.name}</h2>
              </div>
              {item.approval_required && (
                <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                  {t('managerApproval')}
                </span>
              )}
            </div>
            {item.description && (
              <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{item.description}</p>
            )}
          </Card>
        </div>

        <div>
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('requestDetails')}</h3>

            <div className="space-y-4">
              {fields.map((field) => (
                <div key={field.name}>
                  <DynamicFormField
                    field={field}
                    value={formData[field.name] || ''}
                    onChange={(val) => {
                      setFormData((prev) => ({ ...prev, [field.name]: val }));
                      if (fieldErrors[field.name]) {
                        const { [field.name]: _ignored, ...rest } = fieldErrors;
                        setFieldErrors(rest);
                      }
                    }}
                  />
                  {fieldErrors[field.name] && (
                    <p className="text-xs text-red-500 mt-1">{fieldErrors[field.name]}</p>
                  )}
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tFields('priority')}</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as CartItem['priority'])}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  {PRIORITY_VALUES.map((value) => (
                    <option key={value} value={value}>{statusLabel(value)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('notesOptional')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                  placeholder={t('notesPlaceholder')}
                />
              </div>

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-gray-500">{tFields('sla')}</span>
                  <span className="font-medium text-gray-700">{item.sla_hours}h</span>
                </div>
                {item.price != null && (
                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-gray-500">{t('estimatedCost')}</span>
                    <span className="font-semibold text-green-700">
                      {formatCurrency(Number(item.price), theme.catalog_currency)}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddToCart}
                  className={`w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    added ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {added ? t('addedToCart') : t('addToCart')}
                </button>
                {added && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/catalog')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {t('continueShopping')}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/cart')}
                      className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                    >
                      {t('goToCart')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
