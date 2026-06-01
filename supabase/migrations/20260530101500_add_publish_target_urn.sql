-- Add publish_target_urn to platform_connections
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS publish_target_urn text;
