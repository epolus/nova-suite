-- SLA hardening: dual timers (response + resolution), pause clock, business calendars.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS response_due_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS response_breached boolean NOT NULL DEFAULT false;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_paused_at timestamptz;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sla_paused_ms bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_incidents_response_due
  ON incidents(tenant_id, response_breached, response_due_at);

CREATE TABLE IF NOT EXISTS business_calendars (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  timezone    text NOT NULL DEFAULT 'UTC',
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_calendars_tenant
  ON business_calendars(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_calendars_tenant_default
  ON business_calendars(tenant_id)
  WHERE is_default = true;

CREATE TRIGGER trg_business_calendars_updated_at
  BEFORE UPDATE ON business_calendars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS business_hours (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id  uuid NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  day_of_week  integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_business_hours_calendar
  ON business_hours(calendar_id, day_of_week);

CREATE TABLE IF NOT EXISTS holidays (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id   uuid NOT NULL REFERENCES business_calendars(id) ON DELETE CASCADE,
  holiday_date  date NOT NULL,
  name          text NOT NULL,
  UNIQUE (calendar_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_calendar
  ON holidays(calendar_id, holiday_date);
