-- Let a request task record that it cancelled the request.

ALTER TABLE request_tasks DROP CONSTRAINT IF EXISTS request_tasks_status_check;
ALTER TABLE request_tasks
  ADD CONSTRAINT request_tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped', 'rejected', 'failed', 'cancelled'));

CREATE OR REPLACE FUNCTION sync_is_active_from_status()
RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'changes' THEN
    NEW.is_active := (NEW.status::text <> 'closed');
  ELSIF TG_TABLE_NAME = 'incidents' THEN
    NEW.is_active := (NEW.status::text <> 'closed');
  ELSIF TG_TABLE_NAME = 'configuration_items' THEN
    NEW.is_active := (NEW.status::text <> 'retired');
  ELSIF TG_TABLE_NAME = 'knowledge_articles' THEN
    NEW.is_active := (NEW.status::text <> 'retired');
  ELSIF TG_TABLE_NAME = 'problem_tasks' THEN
    NEW.is_active := (NEW.status::text <> 'completed');
  ELSIF TG_TABLE_NAME = 'problems' THEN
    NEW.is_active := (NEW.status::text NOT IN ('resolved', 'closed'));
  ELSIF TG_TABLE_NAME = 'request_tasks' THEN
    NEW.is_active := (NEW.status::text NOT IN ('completed', 'skipped', 'rejected', 'cancelled'));
  ELSIF TG_TABLE_NAME = 'requests' THEN
    NEW.is_active := (NEW.status::text NOT IN ('fulfilled', 'cancelled'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
