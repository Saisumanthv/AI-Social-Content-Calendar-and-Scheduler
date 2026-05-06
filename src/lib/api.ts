import { supabase } from './supabase';
import type {
  BrandProfile,
  ContentCalendarPost,
  PlatformConnection,
  GenerateContentPayload,
  TriggerWebhookPayload,
} from '../types/database';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function edgeFetch<T>(
  functionName: string,
  body: unknown,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Apikey: SUPABASE_ANON_KEY,
  };

  // Only send Authorization when we have a real user JWT.
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Edge function ${functionName} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// Brand Profiles
export async function getBrandProfile(userId: string): Promise<BrandProfile | null> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertBrandProfile(
  profile: Partial<BrandProfile> & { user_id: string },
): Promise<BrandProfile> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Content Calendar
export async function getCalendarPosts(brandId: string): Promise<ContentCalendarPost[]> {
  const { data, error } = await supabase
    .from('content_calendar')
    .select('*')
    .eq('brand_id', brandId)
    .order('post_date', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function updatePostStatus(
  postId: string,
  status: ContentCalendarPost['status'],
): Promise<void> {
  const { error } = await supabase
    .from('content_calendar')
    .update({ status })
    .eq('id', postId);

  if (error) throw error;
}

export async function updatePost(
  postId: string,
  updates: Partial<ContentCalendarPost>,
): Promise<ContentCalendarPost> {
  const { data, error } = await supabase
    .from('content_calendar')
    .update(updates)
    .eq('id', postId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Fallback safety: scheduled posts in the past should never remain scheduled.
export async function failOverdueScheduledPosts(brandId: string): Promise<{ updated: number }> {
  const { data, error } = await supabase.rpc('fail_overdue_scheduled_posts', {
    p_brand_id: brandId,
  });

  if (error) throw error;
  return { updated: Number(data ?? 0) };
}

// Trigger post status transitions (scheduled → published/failed)
export async function triggerPostStatusTransitions(): Promise<{ processed: number }> {
  const { data, error } = await supabase.functions.invoke('publish-scheduled', {
    body: { action: 'check_and_transition' },
  });

  if (error) throw new Error(error.message);
  return (data as { processed?: number } | null) && typeof (data as { processed?: number }).processed === 'number'
    ? { processed: (data as { processed: number }).processed }
    : { processed: 0 };
}

export async function deleteCalendarPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('content_calendar')
    .delete()
    .eq('id', postId);

  if (error) throw error;
}

export async function deleteCalendarForBrand(brandId: string): Promise<void> {
  const { error } = await supabase
    .from('content_calendar')
    .delete()
    .eq('brand_id', brandId);

  if (error) throw error;
}

// Platform Connections
export async function getPlatformConnections(brandId: string): Promise<PlatformConnection[]> {
  const { data, error } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('brand_id', brandId);

  if (error) throw error;
  return data ?? [];
}

export async function upsertPlatformConnection(
  conn: Partial<PlatformConnection> & { brand_id: string; platform_name: string },
): Promise<PlatformConnection> {
  const { data, error } = await supabase
    .from('platform_connections')
    .upsert(conn, { onConflict: 'brand_id,platform_name' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePlatformConnection(brandId: string, platformName: string): Promise<void> {
  const { error } = await supabase
    .from('platform_connections')
    .delete()
    .eq('brand_id', brandId)
    .eq('platform_name', platformName);

  if (error) throw error;
}

export async function getOAuthStartUrl(platform: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/oauth-start?platform=${encodeURIComponent(platform)}`, {
    method: 'GET',
    headers: {
      Apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Failed to start OAuth flow');
  }

  const data = await res.json() as { url?: string };
  if (!data.url) throw new Error('OAuth start response missing url');
  return data.url;
}

// Edge Functions
export async function generateContentCalendar(
  payload: GenerateContentPayload,
): Promise<{ posts: ContentCalendarPost[] }> {
  return edgeFetch('generate-content', payload);
}

export async function triggerWebhook(
  payload: TriggerWebhookPayload,
): Promise<{ success: boolean; message?: string }> {
  return edgeFetch('trigger-webhook', payload);
}
