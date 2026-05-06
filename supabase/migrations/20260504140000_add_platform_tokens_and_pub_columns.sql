-- Add encrypted token storage and publishing metadata

ALTER TABLE IF EXISTS platform_connections
  ADD COLUMN IF NOT EXISTS encrypted_token text,
  ADD COLUMN IF NOT EXISTS scopes text[],
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS content_calendar
  ADD COLUMN IF NOT EXISTS external_post_id text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS platform_connections_brand_idx ON platform_connections(brand_id);
CREATE INDEX IF NOT EXISTS content_calendar_status_idx ON content_calendar(status);
