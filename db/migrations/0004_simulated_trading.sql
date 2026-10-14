-- Durable simulation records. This migration deliberately creates no exchange-order capability.
CREATE TABLE IF NOT EXISTS simulated_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL CHECK (symbol ~ '^[A-Z0-9]{3,20}$'),
  side TEXT NOT NULL DEFAULT 'long' CHECK (side = 'long'),
  quantity NUMERIC(38, 18) NOT NULL CHECK (quantity > 0),
  entry_price NUMERIC(38, 18) NOT NULL CHECK (entry_price > 0),
  stop_loss_price NUMERIC(38, 18) CHECK (stop_loss_price IS NULL OR stop_loss_price > 0),
  take_profit_price NUMERIC(38, 18) CHECK (take_profit_price IS NULL OR take_profit_price > 0),
  trailing_stop_percent NUMERIC(8, 5) CHECK (trailing_stop_percent IS NULL OR (trailing_stop_percent > 0 AND trailing_stop_percent < 100)),
  high_watermark NUMERIC(38, 18) NOT NULL CHECK (high_watermark > 0),
  trailing_stop_price NUMERIC(38, 18) CHECK (trailing_stop_price IS NULL OR trailing_stop_price > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  exit_price NUMERIC(38, 18) CHECK (exit_price IS NULL OR exit_price > 0),
  exit_reason TEXT CHECK (exit_reason IS NULL OR exit_reason IN ('stop_loss', 'take_profit', 'trailing_stop', 'manual')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'open' AND exit_price IS NULL AND closed_at IS NULL) OR
         (status IN ('closed', 'cancelled') AND (exit_price IS NOT NULL OR status = 'cancelled') AND closed_at IS NOT NULL)),
  CHECK (stop_loss_price IS NULL OR stop_loss_price < entry_price),
  CHECK (take_profit_price IS NULL OR take_profit_price > entry_price)
);

CREATE INDEX IF NOT EXISTS simulated_trades_user_status_idx ON simulated_trades (user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS simulated_trades_symbol_status_idx ON simulated_trades (symbol, status) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS simulated_trade_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES simulated_trades(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('opened', 'price_observed', 'stop_updated', 'closed', 'cancelled')),
  observed_price NUMERIC(38, 18) CHECK (observed_price IS NULL OR observed_price > 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS simulated_trade_events_trade_created_idx ON simulated_trade_events (trade_id, created_at);
