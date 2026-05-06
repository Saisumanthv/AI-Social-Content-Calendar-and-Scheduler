export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface BrandProfile {
  id: string;
  user_id: string;
  brand_name: string;
  brand_tone: string;
  content_pillars: string[];
  target_audience: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ContentCalendarPost {
  id: string;
  brand_id: string;
  post_date: string;
  hook: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  asset_url: string | null;
  status: PostStatus;
  platform: string;
  scheduled_time: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformConnection {
  id: string;
  brand_id: string;
  platform_name: string;
  encrypted_token: string;
  account_id: string;
  account_name: string;
  scopes: string[] | null;
  status: string;
  needs_reauth: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPost {
  day: number;
  post_date: string;
  hook: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  platform: string;
}

export interface GenerateContentPayload {
  brand_id: string;
  brand_name: string;
  brand_tone: string;
  content_pillars: string[];
  target_audience: string;
  timezone: string;
  start_date: string;
  scheduled_time: string;
  idea: string;
  platforms: string[];
  count?: number;
  asset_url: string;
}

export interface TriggerWebhookPayload {
  post_id: string;
  brand_id: string;
  caption: string;
  hashtags: string[];
  asset_url: string;
  platform: string;
  scheduled_utc: string;
  hook: string;
}
