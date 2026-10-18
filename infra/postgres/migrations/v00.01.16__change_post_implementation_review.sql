-- Structured post-implementation review: failure category and planned downtime.

ALTER TABLE changes ADD COLUMN IF NOT EXISTS failure_category text;
ALTER TABLE changes ADD COLUMN IF NOT EXISTS planned_downtime_minutes integer;

ALTER TABLE changes DROP CONSTRAINT IF EXISTS changes_failure_category_check;
ALTER TABLE changes ADD CONSTRAINT changes_failure_category_check
  CHECK (failure_category IS NULL OR failure_category IN (
    'incomplete', 'caused_incident', 'rolled_back', 'exceeded_window', 'other'
  ));

ALTER TABLE changes DROP CONSTRAINT IF EXISTS changes_planned_downtime_nonnegative;
ALTER TABLE changes ADD CONSTRAINT changes_planned_downtime_nonnegative
  CHECK (planned_downtime_minutes IS NULL OR planned_downtime_minutes >= 0);
