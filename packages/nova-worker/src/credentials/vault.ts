/* SPDX-License-Identifier: AGPL-3.0-only */
import type { PoolClient } from 'pg';
import { config } from '../config';

function requireKey(): string {
  if (!config.credentials.masterKey || config.credentials.masterKey.length < 16) {
    throw new Error('CREDENTIALS_MASTER_KEY is not set or is too short (min 16 characters)');
  }
  return config.credentials.masterKey;
}

export async function decryptCredentialSecret(
  client: PoolClient,
  tenantId: string,
  slug: string,
): Promise<string> {
  const key = requireKey();
  const r = await client.query(
    `SELECT pgp_sym_decrypt(secret_enc, $1)::text AS secret
     FROM tenant_credentials
     WHERE tenant_id = $2 AND slug = $3`,
    [key, tenantId, slug],
  );
  if (r.rows.length === 0) {
    throw new Error(`Unknown or inaccessible credential slug: ${slug}`);
  }
  return (r.rows[0] as { secret: string }).secret;
}

export async function loadCredentialSecretsBySlugs(
  client: PoolClient,
  tenantId: string,
  slugs: string[],
): Promise<Record<string, string>> {
  if (slugs.length === 0) return {};
  const key = requireKey();
  const r = await client.query(
    `SELECT slug, pgp_sym_decrypt(secret_enc, $1)::text AS secret
     FROM tenant_credentials
     WHERE tenant_id = $2 AND slug = ANY($3::text[])`,
    [key, tenantId, slugs],
  );
  const out: Record<string, string> = {};
  for (const row of r.rows as { slug: string; secret: string }[]) {
    out[row.slug] = row.secret;
  }
  for (const s of slugs) {
    if (!(s in out)) {
      throw new Error(`Unknown or inaccessible credential slug: ${s}`);
    }
  }
  return out;
}
