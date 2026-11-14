/* SPDX-License-Identifier: AGPL-3.0-only */
import { request } from '../http';
import type {
  EmailTemplate,
  EmailTemplatePayload,
  UserEmailSignature,
} from '../types/emailTemplates';

export const emailTemplates = {
  /** Active templates for agent insert UX. */
  list: (locale?: string) =>
    request<{ email_templates: EmailTemplate[] }>(
      locale
        ? `/email-templates?locale=${encodeURIComponent(locale)}`
        : '/email-templates',
    ),
  adminList: (includeInactive = true) =>
    request<{ email_templates: EmailTemplate[] }>(
      `/admin/email-templates?include_inactive=${includeInactive ? 'true' : 'false'}`,
    ),
  create: (data: EmailTemplatePayload) =>
    request<EmailTemplate>('/admin/email-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<EmailTemplatePayload>) =>
    request<{ success: boolean }>(`/admin/email-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/admin/email-templates/${id}`, { method: 'DELETE' }),
};

export const emailSignatures = {
  me: () => request<{ signature: UserEmailSignature }>('/email-signatures/me'),
  saveMe: (body: string) =>
    request<{ signature: UserEmailSignature }>('/email-signatures/me', {
      method: 'PUT',
      body: JSON.stringify({ body }),
    }),
};
