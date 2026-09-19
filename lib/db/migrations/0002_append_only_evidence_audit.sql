CREATE OR REPLACE FUNCTION prevent_fiber_evidence_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fiber evidence audit events are append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS fiber_evidence_audit_append_only
  ON fiber_evidence_audit_events;

CREATE TRIGGER fiber_evidence_audit_append_only
BEFORE UPDATE OR DELETE ON fiber_evidence_audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_fiber_evidence_audit_mutation();