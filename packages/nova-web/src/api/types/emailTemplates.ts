/* SPDX-License-Identifier: AGPL-3.0-only */

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  locale: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type EmailTemplatePayload = {
  name: string;
  subject?: string;
  body?: string;
  locale?: string;
  sort_order?: number;
  is_active?: boolean;
};

export interface UserEmailSignature {
  id: string | null;
  body: string;
  updated_at: string | null;
}
