-- Idempotency for simulation trade creation. Existing trades remain valid with null keys.
ALTER TABLE simulated_trades
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

ALTER TABLE simulated_trades
  ADD CONSTRAINT simulated_trades_idempotency_key_format
  CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$');

ALTER TABLE simulated_trades
  ADD CONSTRAINT simulated_trades_request_fingerprint_format
  CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS simulated_trades_user_idempotency_idx
  ON simulated_trades (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
