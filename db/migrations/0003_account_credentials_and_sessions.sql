CREATE TABLE IF NOT EXISTS app_credentials (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email = lower(trim(email))),
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (length(password_hash) >= 32)
);

CREATE TABLE IF NOT EXISTS web_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS web_sessions_user_expiry_idx
  ON web_sessions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS web_sessions_expiry_idx
  ON web_sessions (expires_at)
  WHERE revoked_at IS NULL;
