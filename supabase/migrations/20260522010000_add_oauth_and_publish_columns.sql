/*
  Add fields used by LinkedIn OAuth and scheduled publishing.

  - platform_connections.status / needs_reauth / scopes
  - content_calendar.published_at / external_post_id / last_error
*/

ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected',
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}';

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_post_id text,
  ADD COLUMN IF NOT EXISTS last_error text;