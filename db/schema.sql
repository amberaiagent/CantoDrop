-- Canto Drop — orders schema
-- One row per drop order. The website only ever INSERTs (status='pending')
-- and SELECTs by reference. The bot is the writer for everything after funding.

CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,

  -- Unique short code the dev puts in the Solana transfer memo so the bot can
  -- match the incoming deposit to this exact order.
  reference       TEXT NOT NULL UNIQUE,

  -- Token being dropped (Solana SPL mint / "CA"), plus display metadata.
  token_mint      TEXT NOT NULL,
  token_name      TEXT NOT NULL,
  token_ticker    TEXT NOT NULL,

  -- What the dev commits to the drop.
  deposit_amount  NUMERIC(40, 0) NOT NULL,   -- whole token amount to be sent in
  supply_percent  NUMERIC(6, 3),             -- informational: % of total supply

  -- Trigger: first snapshot/drop happens when market cap (USD) reaches this.
  target_market_cap NUMERIC(20, 2) NOT NULL,

  -- Distribution rules (platform defaults; dev may override via advanced fields).
  holder_top_from   INT NOT NULL DEFAULT 50,     -- snapshot holders ranked from..
  holder_top_to     INT NOT NULL DEFAULT 200,    -- ..to (inclusive)
  cap_multiplier    NUMERIC(6, 3) NOT NULL DEFAULT 2,   -- new snapshot every xN of cap
  split_percent     NUMERIC(6, 3) NOT NULL DEFAULT 50,  -- % of remaining dropped per milestone

  -- Bookkeeping. Wallet is stored for the record even though it's shared.
  deposit_wallet  TEXT NOT NULL,

  -- pending  -> order created, waiting for deposit
  -- funded   -> bot saw the deposit land
  -- active   -> target cap reached, drops in progress
  -- completed-> all milestones distributed
  -- cancelled-> dev/admin cancelled
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','funded','active','completed','cancelled')),

  -- Filled in by the bot when the deposit is detected.
  funded_tx       TEXT,
  funded_amount   NUMERIC(40, 0),
  funded_at       TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_status_idx     ON orders (status);
CREATE INDEX IF NOT EXISTS orders_token_mint_idx ON orders (token_mint);

-- keep updated_at fresh on any UPDATE
CREATE OR REPLACE FUNCTION orders_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_touch_updated_at();
