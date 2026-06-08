/* SPDX-License-Identifier: AGPL-3.0-only */
export interface TenantCredentialListItem {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantCredentialDetail extends TenantCredentialListItem {
  has_secret: boolean;
  created_by: string | null;
  secret_type?: 'plain' | 'oauth2_client_credentials';
  oauth2?: {
    token_url: string;
    client_id: string;
    scope: string | null;
    audience: string | null;
  };
}

export interface CredentialTokenTestResult {
  ok: boolean;
  credential_slug: string;
  token_type: string;
  expires_in: number | null;
  access_token_preview: string;
  error?: string;
}
