-- Historical rows stay NULL: their accepted text cannot be reconstructed by assumption.
ALTER TABLE recurring_subscription ADD COLUMN terms_snapshot TEXT;

CREATE FUNCTION protect_recurring_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.key_hash, NEW.first_donation_id, NEW.merchant_id, NEW.frequency,
      NEW.terms_version, NEW.terms_snapshot, NEW.consented_at, NEW.preview_date)
     IS DISTINCT FROM
     (OLD.key_hash, OLD.first_donation_id, OLD.merchant_id, OLD.frequency,
      OLD.terms_version, OLD.terms_snapshot, OLD.consented_at, OLD.preview_date) THEN
    RAISE EXCEPTION 'Recurring consent evidence is immutable';
  END IF;
  IF OLD.state = 'cancelled' AND NEW.state <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled recurring subscription cannot resume';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recurring_consent_immutable BEFORE UPDATE ON recurring_subscription
FOR EACH ROW EXECUTE FUNCTION protect_recurring_consent();
