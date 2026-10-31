/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Queryable } from './db-checks';

export async function loadCredentialSecretsBySlugs(
  client: Queryable,
  masterKey: string,
  tenantId: string,
  slugs: string[],
): Promise<Record<string, string>> {
  if (slugs.length === 0) return {};
  if (masterKey.length < 16) {
    throw new Error('CREDENTIALS_MASTER_KEY is not set or is too short (min 16 characters)');
  }
  const r = await client.query(
    `SELECT slug, pgp_sym_decrypt(secret_enc, $1)::text AS secret
     FROM tenant_credentials
     WHERE tenant_id = $2 AND slug = ANY($3::text[])`,
    [masterKey, tenantId, slugs],
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
