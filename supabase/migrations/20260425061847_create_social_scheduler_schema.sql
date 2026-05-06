/*
  # AI Social Media Content Calendar Schema

  1. New Tables
    - `brand_profiles` - Stores brand identity and configuration per user
      - id (uuid, primary key)
      - user_id (uuid, references auth.users)
      - brand_name (text)
      - brand_tone (text) - voice/tone description
      - content_pillars (text[]) - array of content themes
      - target_audience (text)
      - timezone (text) - IANA timezone string
      - created_at / updated_at timestamps

    - `content_calendar` - Individual posts in the 30-day plan
      - id (uuid, primary key)
      - brand_id (uuid, references brand_profiles)
      - post_date (timestamptz UTC)
      - hook (text) - attention-grabbing opening line
      - caption (text) - full post caption
      - hashtags (text[]) - array of hashtags
      - image_prompt (text) - AI image generation prompt
      - asset_url (text, nullable) - uploaded media URL
      - status (enum: draft, scheduled, published, failed)
      - platform (text) - target platform
      - scheduled_time (time) - local time for posting
      - created_at / updated_at timestamps

    - `platform_connections` - Social media account tokens
      - id (uuid, primary key)
      - brand_id (uuid, references brand_profiles)
      - platform_name (text)
      - encrypted_token (text)
      - account_id (text)
      - account_name (text)
      - expires_at (timestamptz, nullable)
      - created_at / updated_at timestamps

  2. Security
    - RLS enabled on all tables
    - Users can only access their own brand profiles
    - Content calendar and platform connections scoped to owned brand profiles

  3. Performance
    - Indexes on user_id, brand_id, post_date, and status columns
*/

-- Create post status enum
DO $$ BEGIN
  CREATE TYPE post_status AS ENUM ('draft', 'scheduled', 'published', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- brand_profiles table
CREATE TABLE IF NOT EXISTS brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text NOT NULL DEFAULT '',
  brand_tone text NOT NULL DEFAULT '',
  content_pillars text[] NOT NULL DEFAULT '{}',
  target_audience text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand profiles"
  ON brand_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand profiles"
  ON brand_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brand profiles"
  ON brand_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brand profiles"
  ON brand_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS brand_profiles_user_id_idx ON brand_profiles(user_id);

-- content_calendar table
CREATE TABLE IF NOT EXISTS content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  post_date timestamptz NOT NULL,
  hook text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  hashtags text[] NOT NULL DEFAULT '{}',
  image_prompt text NOT NULL DEFAULT '',
  asset_url text,
  status post_status NOT NULL DEFAULT 'draft',
  platform text NOT NULL DEFAULT 'instagram',
  scheduled_time time NOT NULL DEFAULT '09:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar posts"
  ON content_calendar FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = content_calendar.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own calendar posts"
  ON content_calendar FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = content_calendar.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own calendar posts"
  ON content_calendar FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = content_calendar.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = content_calendar.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own calendar posts"
  ON content_calendar FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = content_calendar.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS content_calendar_brand_id_idx ON content_calendar(brand_id);
CREATE INDEX IF NOT EXISTS content_calendar_post_date_idx ON content_calendar(post_date);
CREATE INDEX IF NOT EXISTS content_calendar_status_idx ON content_calendar(status);

-- platform_connections table
CREATE TABLE IF NOT EXISTS platform_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  platform_name text NOT NULL,
  encrypted_token text NOT NULL DEFAULT '',
  account_id text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own platform connections"
  ON platform_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = platform_connections.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own platform connections"
  ON platform_connections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = platform_connections.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own platform connections"
  ON platform_connections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = platform_connections.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = platform_connections.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own platform connections"
  ON platform_connections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brand_profiles
      WHERE brand_profiles.id = platform_connections.brand_id
      AND brand_profiles.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS platform_connections_brand_id_idx ON platform_connections(brand_id);

-- Force overdue scheduled posts to fail so past dates never remain scheduled.
CREATE OR REPLACE FUNCTION fail_overdue_scheduled_posts(p_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  UPDATE content_calendar
  SET status = 'failed'
  WHERE brand_id = p_brand_id
    AND status = 'scheduled'
    AND post_date < now();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION fail_overdue_scheduled_posts(uuid) TO authenticated;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_brand_profiles_updated_at ON brand_profiles;
CREATE TRIGGER update_brand_profiles_updated_at
  BEFORE UPDATE ON brand_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_content_calendar_updated_at ON content_calendar;
CREATE TRIGGER update_content_calendar_updated_at
  BEFORE UPDATE ON content_calendar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_connections_updated_at ON platform_connections;
CREATE TRIGGER update_platform_connections_updated_at
  BEFORE UPDATE ON platform_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
