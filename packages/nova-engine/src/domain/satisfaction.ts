/* SPDX-License-Identifier: AGPL-3.0-only */
import { randomBytes } from 'node:crypto';
import type { PoolClient, QueryResult } from 'pg';
import { db } from '../data/db';
import { AppError } from '../middleware/errorHandler';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

export type SatisfactionResponseRow = {
  id: string;
  incident_id: string;
  score: number | null;
  comment: string | null;
  submitted_at: string | null;
  token: string;
  created_at: string;
  updated_at: string;
};

export type SatisfactionPublicView = {
  incident_number: string;
  incident_title: string;
  submitted: boolean;
  score: number | null;
  comment: string | null;
  submitted_at: string | null;
};

type TokenLookupRow = {
  id: string;
  tenant_id: string;
  incident_id: string;
  score: number | null;
  comment: string | null;
  submitted_at: string | null;
  incident_number: string;
  incident_title: string;
};

function newToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Create a pending CSAT row when an incident is first resolved (idempotent). */
export async function ensureSatisfactionResponse(
  client: Queryable,
  incidentId: string,
): Promise<SatisfactionResponseRow | null> {
  const existing = await client.query<SatisfactionResponseRow>(
    `SELECT id, incident_id, score, comment, submitted_at, token, created_at, updated_at
     FROM satisfaction_responses
     WHERE incident_id = $1
     LIMIT 1`,
    [incidentId],
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const token = newToken();
  const inserted = await client.query<SatisfactionResponseRow>(
    `INSERT INTO satisfaction_responses (tenant_id, incident_id, token)
     VALUES (current_tenant_id(), $1, $2)
     ON CONFLICT (incident_id) DO NOTHING
     RETURNING id, incident_id, score, comment, submitted_at, token, created_at, updated_at`,
    [incidentId, token],
  );
  if (inserted.rows[0]) {
    return inserted.rows[0];
  }

  const again = await client.query<SatisfactionResponseRow>(
    `SELECT id, incident_id, score, comment, submitted_at, token, created_at, updated_at
     FROM satisfaction_responses
     WHERE incident_id = $1
     LIMIT 1`,
    [incidentId],
  );
  return again.rows[0] ?? null;
}

export async function getSatisfactionForIncident(
  client: PoolClient,
  incidentId: string,
): Promise<SatisfactionResponseRow | null> {
  const r = await client.query<SatisfactionResponseRow>(
    `SELECT id, incident_id, score, comment, submitted_at, token, created_at, updated_at
     FROM satisfaction_responses
     WHERE incident_id = $1
     LIMIT 1`,
    [incidentId],
  );
  return r.rows[0] ?? null;
}

async function lookupByToken(token: string): Promise<TokenLookupRow | null> {
  return db.getOne<TokenLookupRow>(
    `SELECT id, tenant_id, incident_id, score, comment, submitted_at,
            incident_number, incident_title
     FROM lookup_satisfaction_by_token($1)`,
    [token],
  );
}

export async function getSatisfactionByToken(token: string): Promise<SatisfactionPublicView> {
  const row = await lookupByToken(token);
  if (!row) throw new AppError(404, 'Satisfaction survey not found');
  return {
    incident_number: row.incident_number,
    incident_title: row.incident_title,
    submitted: row.submitted_at != null,
    score: row.score,
    comment: row.comment,
    submitted_at: row.submitted_at,
  };
}

export async function submitSatisfactionByToken(
  token: string,
  score: number,
  comment: string | null,
): Promise<SatisfactionPublicView> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new AppError(400, 'Score must be an integer from 1 to 5');
  }
  const trimmed = comment?.trim() || null;
  if (trimmed && trimmed.length > 4000) {
    throw new AppError(400, 'Comment must be at most 4000 characters');
  }

  const row = await lookupByToken(token);
  if (!row) throw new AppError(404, 'Satisfaction survey not found');
  if (row.submitted_at != null) {
    throw new AppError(409, 'Satisfaction survey already submitted');
  }

  await db.withTenantTransaction(row.tenant_id, SYSTEM_USER_ID, 'system', async (client) => {
    const updated = await client.query(
      `UPDATE satisfaction_responses
       SET score = $2,
           comment = $3,
           submitted_at = now()
       WHERE id = $1
         AND submitted_at IS NULL
       RETURNING id`,
      [row.id, score, trimmed],
    );
    if (updated.rowCount === 0) {
      throw new AppError(409, 'Satisfaction survey already submitted');
    }
  });

  return getSatisfactionByToken(token);
}
