ALTER TABLE recurring_subscription ADD COLUMN settlement_evidence TEXT;
CREATE FUNCTION protect_recurring_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settlement_evidence IS NOT NULL AND NEW.settlement_evidence IS DISTINCT FROM OLD.settlement_evidence THEN
    RAISE EXCEPTION 'Recurring settlement evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recurring_settlement_immutable BEFORE UPDATE ON recurring_subscription
FOR EACH ROW EXECUTE FUNCTION protect_recurring_settlement();
