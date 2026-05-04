/*
  # Add unique constraints for upsert operations

  1. Changes
    - Add UNIQUE constraint on brand_profiles.user_id (one profile per user)
    - Add UNIQUE constraint on platform_connections(brand_id, platform_name) (one connection per platform per brand)
*/

ALTER TABLE brand_profiles
  ADD CONSTRAINT brand_profiles_user_id_key UNIQUE (user_id);

ALTER TABLE platform_connections
  ADD CONSTRAINT platform_connections_brand_platform_key UNIQUE (brand_id, platform_name);
