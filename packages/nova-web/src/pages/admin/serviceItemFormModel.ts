/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ServiceItem } from '../../api/client';

export const EMPTY_SERVICE_ITEM: Partial<ServiceItem> = {
  name: '',
  short_description: '',
  description: '',
  icon: 'box',
  price: null,
  custom_attributes: {},
  form_schema: { fields: [] },
  approval_required: false,
  sla_hours: 72,
  fulfillment_model_id: null,
  is_active: false,
};

export type ServiceItemField =
  | 'name'
  | 'category_id'
  | 'short_description'
  | 'description'
  | 'icon'
  | 'price'
  | 'sla_hours'
  | 'is_active';

export type ServiceItemIssue =
  | 'nameRequired'
  | 'nameTooLong'
  | 'categoryRequired'
  | 'shortDescriptionTooLong'
  | 'descriptionTooLong'
  | 'priceInvalid'
  | 'slaInvalid'
  | 'iconTooLong'
  | 'activateRequiresTask';

export type ServiceItemFieldErrors = Partial<Record<ServiceItemField, string>>;

export function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function softSaveFailure(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { success?: boolean; error?: string; id?: string };
  if (body.success === false && !body.id) return body.error || 'This item was not saved.';
  return null;
}

/** Mirrors createServiceItemSchema: only name and category are required. */
export function serviceItemIssues(
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

  const modelId = typeof form.fulfillment_model_id === 'string' ? form.fulfillment_model_id.trim() : '';
  if (!options.isNew && form.is_active !== false && options.taskCount === 0 && !modelId) {
    issues.is_active = 'activateRequiresTask';
  }

  return issues;
}

/** Parsed blob: URL, or empty. encodeURI is the barrier CodeQL accepts for img src. */
export function blobPreviewUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'blob:' ? encodeURI(url.href) : '';
  } catch {
    return '';
  }
}

export function controlClass(invalid: boolean, extra = ''): string {
  const padding = extra.includes('pl-') || extra.includes('pr-') || extra.includes('px-') ? '' : 'px-3 ';
  return `w-full ${padding}py-2 border rounded-lg text-sm outline-hidden focus:ring-2 focus:ring-indigo-500 ${
    invalid ? 'border-red-400' : 'border-gray-200'
  }${extra ? ` ${extra}` : ''}`;
}
