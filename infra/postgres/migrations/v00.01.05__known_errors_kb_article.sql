-- Link Known Errors (KEDB) to Knowledge Base articles.
ALTER TABLE known_errors
  ADD COLUMN IF NOT EXISTS kb_article_id uuid REFERENCES knowledge_articles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_known_errors_kb_article
  ON known_errors(tenant_id, kb_article_id);
