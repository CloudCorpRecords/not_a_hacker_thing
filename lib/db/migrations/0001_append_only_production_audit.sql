-- Production audit history is append-only. Keep this migration alongside the
-- Drizzle schema because triggers are not represented by drizzle-kit push.
CREATE OR REPLACE FUNCTION prevent_fiber_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fiber production audit events are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS fiber_production_audit_append_only
  ON fiber_production_audit_events;

CREATE TRIGGER fiber_production_audit_append_only
BEFORE UPDATE OR DELETE ON fiber_production_audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_fiber_audit_mutation();