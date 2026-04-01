CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS events (
  global_position BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  aggregate_id VARCHAR(255) NOT NULL,
  aggregate_type VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  event_number INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT events_event_id_unique UNIQUE (event_id),
  CONSTRAINT events_aggregate_event_number_unique UNIQUE (aggregate_id, event_number)
);

CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON events (aggregate_id);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id VARCHAR(255) NOT NULL UNIQUE,
  snapshot_data JSONB NOT NULL,
  last_event_number INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_id ON snapshots (aggregate_id);

CREATE TABLE IF NOT EXISTS account_summaries (
  account_id VARCHAR(255) PRIMARY KEY,
  owner_name VARCHAR(255) NOT NULL,
  balance DECIMAL(19, 4) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL,
  version BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_history (
  transaction_id VARCHAR(255) PRIMARY KEY,
  account_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(19, 4) NOT NULL,
  description TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_history_account_id ON transaction_history (account_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_account_id_timestamp ON transaction_history (account_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS projection_checkpoints (
  projection_name VARCHAR(100) PRIMARY KEY,
  last_processed_global_position BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
  projection_name VARCHAR(100) NOT NULL,
  event_id UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (projection_name, event_id)
);

INSERT INTO projection_checkpoints (projection_name, last_processed_global_position)
VALUES ('AccountSummaries', 0), ('TransactionHistory', 0)
ON CONFLICT (projection_name) DO NOTHING;
