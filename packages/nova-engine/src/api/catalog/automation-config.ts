/* SPDX-License-Identifier: AGPL-3.0-only */
import {
  collectCredentialSlugsFromAutomationConfig as sharedCollectCredentialSlugsFromAutomationConfig,
  parseAutomationConfig as sharedParseAutomationConfig,
  validateAndParseAutomationConfig as sharedValidateAndParseAutomationConfig,
  validateAutomationConfig as sharedValidateAutomationConfig,
} from '@nova-suite/shared';
import { BadRequest } from '../../middleware/errorHandler';
export const collectCredentialSlugsFromAutomationConfig = sharedCollectCredentialSlugsFromAutomationConfig;
export const validateAutomationConfig = sharedValidateAutomationConfig;
export const parseAutomationConfig = sharedParseAutomationConfig;
export const validateAndParseAutomationConfig = sharedValidateAndParseAutomationConfig;

export async function ensureCredentialSlugsExist(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  slugs: string[],
): Promise<void> {
  if (slugs.length === 0) return;
  const result = await client.query(
    `SELECT slug
     FROM tenant_credentials
     WHERE tenant_id = current_tenant_id()
       AND slug = ANY($1::text[])`,
    [slugs],
  );
  const existing = new Set(result.rows.map((r) => String(r.slug)));
  const missing = slugs.filter((slug) => !existing.has(slug));
  if (missing.length > 0) {
    throw BadRequest(`Unknown credential slug(s) in automation_config: ${missing.join(', ')}`);
  }
}
