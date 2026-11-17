-- Additive foundation. No historical email matching or fabricated consent.
CREATE TABLE donor_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized VARCHAR(254) NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ(3) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT donor_email_normalized CHECK (email_normalized = lower(btrim(email_normalized)) AND length(email_normalized) > 3)
);
CREATE TABLE donor_email_challenge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized VARCHAR(254) NOT NULL,
  code_hash VARCHAR(64) NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  consumed_at TIMESTAMPTZ(3),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX donor_email_challenge_email_normalized_created_at_idx ON donor_email_challenge(email_normalized, created_at);
CREATE INDEX donor_email_challenge_expires_at_idx ON donor_email_challenge(expires_at);
CREATE TABLE donor_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL REFERENCES donor_identity(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  revoked_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX donor_session_donor_id_expires_at_idx ON donor_session(donor_id, expires_at);
CREATE INDEX donor_session_expires_at_idx ON donor_session(expires_at);

ALTER TABLE recurring_subscription
  ALTER COLUMN key_hash DROP NOT NULL,
  ADD COLUMN owner_id UUID REFERENCES donor_identity(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN checkout_key UUID,
  ADD COLUMN checkout_request_hash VARCHAR(64),
  ADD COLUMN consent_verified_at TIMESTAMPTZ(3),
  ADD COLUMN legacy_claimed_at TIMESTAMPTZ(3),
  ADD COLUMN created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  ADD COLUMN cancelled_at TIMESTAMPTZ(3),
  ADD CONSTRAINT recurring_subscription_owner_id_checkout_key_key UNIQUE (owner_id, checkout_key),
  ADD CONSTRAINT recurring_checkout_identity CHECK (
    (checkout_key IS NULL AND checkout_request_hash IS NULL)
    OR (owner_id IS NOT NULL AND checkout_key IS NOT NULL AND checkout_request_hash IS NOT NULL
        AND checkout_request_hash ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT recurring_access_present CHECK (key_hash IS NOT NULL OR owner_id IS NOT NULL);
CREATE INDEX recurring_subscription_owner_id_created_at_id_idx ON recurring_subscription(owner_id, created_at, id);

-- Existing consent time is the best available historical creation time.
UPDATE recurring_subscription SET created_at = consented_at;
-- Freeze historical schedules until evidence is actually reviewed. Preserve keys,
-- invoices, attempts, consent snapshots and cancelled state.
UPDATE recurring_subscription SET state = 'review', next_at = NULL WHERE state = 'active';
ALTER TABLE recurring_subscription ADD CONSTRAINT recurring_activation_evidence CHECK (
  state <> 'active' OR (owner_id IS NOT NULL AND consent_verified_at IS NOT NULL AND terms_snapshot IS NOT NULL)
);

-- Keep the previous consent/cancellation trigger unchanged.
CREATE FUNCTION protect_recurring_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.owner_id IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Recurring owner cannot be replaced';
  END IF;
  IF (NEW.checkout_key, NEW.checkout_request_hash) IS DISTINCT FROM (OLD.checkout_key, OLD.checkout_request_hash) THEN
    RAISE EXCEPTION 'Recurring checkout evidence is immutable';
  END IF;
  IF NEW.legacy_claimed_at IS DISTINCT FROM OLD.legacy_claimed_at
     AND NOT (OLD.owner_id IS NULL AND NEW.owner_id IS NOT NULL
              AND OLD.legacy_claimed_at IS NULL AND NEW.legacy_claimed_at IS NOT NULL AND OLD.key_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'Recurring claim evidence is immutable';
  END IF;
  IF OLD.consent_verified_at IS NOT NULL AND NEW.consent_verified_at IS DISTINCT FROM OLD.consent_verified_at THEN
    RAISE EXCEPTION 'Verified recurring consent is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recurring_owner_immutable BEFORE UPDATE ON recurring_subscription
FOR EACH ROW EXECUTE FUNCTION protect_recurring_owner();
