CREATE TABLE IF NOT EXISTS telegram_link_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS telegram_link_challenges_user_idx
  ON telegram_link_challenges (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS telegram_link_challenges_expiry_idx
  ON telegram_link_challenges (expires_at)
  WHERE consumed_at IS NULL;
