CREATE TABLE recurring_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,
  merchant_id TEXT NOT NULL,
  first_donation_id UUID NOT NULL UNIQUE REFERENCES donation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'every_friday', 'monthly')),
  terms_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  preview_date TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'cancelled', 'failed', 'review')),
  anchor_day INTEGER CHECK (anchor_day BETWEEN 1 AND 31),
  next_at TIMESTAMPTZ(3),
  next_check_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CHECK (state <> 'active' OR (anchor_day IS NOT NULL AND next_at IS NOT NULL))
);
CREATE INDEX recurring_subscription_state_next_at_idx ON recurring_subscription(state, next_at);
CREATE INDEX recurring_subscription_state_next_check_at_idx ON recurring_subscription(state, next_check_at);

CREATE TABLE recurring_attempt (
  subscription_id UUID NOT NULL REFERENCES recurring_subscription(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  period TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ(3) NOT NULL,
  donation_id UUID NOT NULL UNIQUE REFERENCES donation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'accepted', 'unknown', 'failed', 'paid', 'skipped', 'review')),
  next_check_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, period)
);
CREATE INDEX recurring_attempt_state_next_check_at_idx ON recurring_attempt(state, next_check_at);
