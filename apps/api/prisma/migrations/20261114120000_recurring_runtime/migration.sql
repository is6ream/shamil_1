ALTER TABLE recurring_subscription ADD COLUMN checkout_url TEXT,
  ADD COLUMN provider_evidence TEXT,
  ADD COLUMN reconciliation_reason TEXT,
  ADD COLUMN last_reconciled_at TIMESTAMPTZ(3);
ALTER TABLE recurring_attempt ADD COLUMN reconciliation_reason TEXT,
  ADD COLUMN last_reconciled_at TIMESTAMPTZ(3);
CREATE TABLE recurring_heartbeat (id TEXT PRIMARY KEY, last_started_at TIMESTAMPTZ(3) NOT NULL,
  last_completed_at TIMESTAMPTZ(3));
CREATE FUNCTION protect_recurring_runtime() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.provider_evidence IS NOT NULL AND NEW.provider_evidence IS DISTINCT FROM OLD.provider_evidence THEN
    RAISE EXCEPTION 'Recurring provider evidence is immutable';
  END IF;
  IF OLD.checkout_url IS NOT NULL AND NEW.checkout_url IS DISTINCT FROM OLD.checkout_url THEN
    RAISE EXCEPTION 'Recurring checkout result is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recurring_runtime_immutable BEFORE UPDATE ON recurring_subscription
FOR EACH ROW EXECUTE FUNCTION protect_recurring_runtime();
