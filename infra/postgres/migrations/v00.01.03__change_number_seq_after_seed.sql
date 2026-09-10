-- Advance change_number_seq past any existing CHG/REL numbers.
-- Seed data inserts CHG0000001 without setval; first POST /api/changes then
-- regenerates CHG0000001 and hits UNIQUE (tenant_id, number) → unhandled 500.
-- Releases also allocate from change_number_seq (REL…).

SELECT setval(
  'change_number_seq',
  GREATEST(
    (SELECT last_value FROM change_number_seq),
    COALESCE((
      SELECT MAX(NULLIF(regexp_replace(number, '[^0-9]', '', 'g'), '')::bigint)
      FROM (
        SELECT number FROM changes
        UNION ALL
        SELECT number FROM releases
      ) nums
    ), 0)
  ),
  true
);
