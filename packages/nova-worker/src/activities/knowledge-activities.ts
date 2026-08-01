/* SPDX-License-Identifier: AGPL-3.0-only */
import { log } from '@temporalio/activity';
import { withTenantContext } from '../db';

export async function setKnowledgeArticleStatus(
  articleId: string,
  tenantId: string,
  status: 'draft' | 'review' | 'published' | 'retired',
  note?: string,
): Promise<void> {
  log.info('Updating knowledge article status', { articleId, status });
  await withTenantContext(tenantId, async (client) => {
    let rootId: string | null = null;
    if (status === 'published') {
      const rootRes = await client.query(
        `SELECT COALESCE(root_article_id, id) AS root_id
         FROM knowledge_articles
         WHERE id = $1::uuid`,
        [articleId],
      );
      rootId = (rootRes.rows[0]?.root_id as string | undefined) || null;
    }

    await client.query(
      `UPDATE knowledge_articles
       SET status = $1::kb_status
       WHERE id = $2::uuid`,
      [status, articleId],
    );

    if (status === 'published' && rootId) {
      await client.query(
        `UPDATE knowledge_articles
         SET status = 'retired'
         WHERE status = 'published'
           AND id <> $1::uuid
           AND (id = $2::uuid OR root_article_id = $2::uuid)`,
        [articleId, rootId],
      );
    }

    if (note) {
      await client.query(
        `UPDATE knowledge_articles
         SET meta_data = COALESCE(meta_data, '{}'::jsonb) || jsonb_build_object('last_workflow_note', $1::text)
         WHERE id = $2::uuid`,
        [note, articleId],
      );
    }
  });
}
