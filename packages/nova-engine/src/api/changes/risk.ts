/* SPDX-License-Identifier: AGPL-3.0-only */
// ─── Nova Suite – Change risk assessment services ───
// Plain-argument services (PoolClient + args). No Request/Response.
import type { PoolClient } from 'pg';
import { AppError, NotFound } from '../../middleware/errorHandler';
import { writeChangeAuditDiff } from '../../domain/change-collaboration';
import { canWorkOnChange } from './permissions';
import type { ChangeActor } from './types';

/** Weighted-sum thresholds for suggested risk_level (scores 0–5 × question weight). */
export function suggestRiskLevelFromScore(score: number): 'low' | 'medium' | 'high' | 'very_high' {
  if (score < 8) return 'low';
  if (score < 16) return 'medium';
  if (score < 24) return 'high';
  return 'very_high';
}

// ─── GET /api/changes/:id/risk-answers ───

export async function getRiskAnswers(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
): Promise<{
  answers: unknown[];
  risk_score: number | null;
  risk_level: unknown;
  suggested_risk_level: ReturnType<typeof suggestRiskLevelFromScore> | null;
}> {
  const changeRes = await client.query(
    `SELECT id, risk_score, risk_level
       FROM changes
       WHERE tenant_id = current_tenant_id()
         AND id = $1`,
    [changeId],
  );
  if (changeRes.rows.length === 0) throw NotFound('Change not found');
  const change = changeRes.rows[0];
  const canWork = await canWorkOnChange(client, actor, change);
  if (!canWork) throw new AppError(403, 'Insufficient permissions');
  const answers = await client.query(
    `SELECT a.*, q.prompt, q.weight, q.sort_order
       FROM change_risk_answers a
       JOIN change_risk_questions q ON q.id = a.question_id
       WHERE a.tenant_id = current_tenant_id()
         AND a.change_id = $1
       ORDER BY q.sort_order ASC, q.created_at ASC`,
    [changeId],
  );
  const riskScore = change.risk_score == null ? null : Number(change.risk_score);
  return {
    answers: answers.rows,
    risk_score: riskScore,
    risk_level: change.risk_level,
    suggested_risk_level: riskScore == null ? null : suggestRiskLevelFromScore(riskScore),
  };
}

// ─── POST /api/changes/:id/risk-assessment ───

export async function submitRiskAssessment(
  client: PoolClient,
  actor: ChangeActor,
  changeId: string,
  body: {
    answers?: Array<{ question_id: string; score: number; answer_text?: string | null }>;
    apply_suggested_risk_level?: boolean;
  },
): Promise<{
  risk_score: number;
  risk_level: unknown;
  suggested_risk_level: ReturnType<typeof suggestRiskLevelFromScore>;
  answers_saved: number;
}> {
  const changeRes = await client.query(
    `SELECT *
         FROM changes
         WHERE tenant_id = current_tenant_id()
           AND id = $1`,
    [changeId],
  );
  if (changeRes.rows.length === 0) throw NotFound('Change not found');
  const change = changeRes.rows[0];
  const canWork = await canWorkOnChange(client, actor, change);
  if (!canWork) throw new AppError(403, 'Insufficient permissions');

  const answers = body.answers || [];
  const questionIds = answers.map((a) => a.question_id);
  const questions = await client.query(
    `SELECT id, weight, is_active
         FROM change_risk_questions
         WHERE tenant_id = current_tenant_id()
           AND id = ANY($1::uuid[])`,
    [questionIds],
  );
  if (questions.rows.length !== questionIds.length) {
    throw new AppError(400, 'One or more risk questions are invalid for this tenant');
  }
  const weightById = new Map<string, number>(
    questions.rows.map((q: { id: string; weight: string | number }) => [q.id, Number(q.weight)]),
  );

  await client.query(
    `DELETE FROM change_risk_answers
         WHERE tenant_id = current_tenant_id()
           AND change_id = $1`,
    [changeId],
  );

  let riskScore = 0;
  for (const answer of answers) {
    const weight = weightById.get(answer.question_id) ?? 1;
    riskScore += Number(answer.score) * weight;
    await client.query(
      `INSERT INTO change_risk_answers
           (tenant_id, change_id, question_id, score, answer_text)
           VALUES (current_tenant_id(), $1, $2, $3, $4)`,
      [changeId, answer.question_id, answer.score, answer.answer_text || null],
    );
  }

  const suggested = suggestRiskLevelFromScore(riskScore);
  const applySuggested = body.apply_suggested_risk_level !== false;
  const updated = await client.query(
    `UPDATE changes
         SET risk_score = $1,
             risk_level = CASE
               WHEN $2::boolean THEN $3::change_risk_enum
               ELSE risk_level
             END
         WHERE tenant_id = current_tenant_id()
           AND id = $4
         RETURNING *`,
    [riskScore, applySuggested, suggested, changeId],
  );
  await writeChangeAuditDiff(
    client,
    changeId,
    actor.id,
    change as Record<string, unknown>,
    (updated.rows[0] || {}) as Record<string, unknown>,
  );

  return {
    risk_score: Number(updated.rows[0].risk_score),
    risk_level: updated.rows[0].risk_level,
    suggested_risk_level: suggested,
    answers_saved: answers.length,
  };
}
