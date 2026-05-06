import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

// Simple scheduled publisher stub. Should be run on a schedule (cron) and will:
// - find due posts with status='scheduled' and scheduled_time <= now
// - for each post, decrypt platform token, call platform API to publish, and update status

interface PlatformTokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

function base64ToUint8Array(b64: string) {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function decrypt(encryptedB64: string, keyB64: string) {
  const combined = atob(encryptedB64);
  const combinedArr = new Uint8Array(combined.length);
  for (let i = 0; i < combined.length; i++) combinedArr[i] = combined.charCodeAt(i);
  const iv = combinedArr.slice(0, 12);
  const ciphertext = combinedArr.slice(12);
  const keyRaw = base64ToUint8Array(keyB64);
  const cryptoKey = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plain);
}

async function encrypt(plaintext: string, keyB64: string) {
  const keyRaw = base64ToUint8Array(keyB64);
  const cryptoKey = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  let s = '';
  for (let i = 0; i < combined.length; i++) s += String.fromCharCode(combined[i]);
  return btoa(s);
}

async function refreshLinkedInToken(refreshToken: string): Promise<PlatformTokenPayload> {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')!;
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
  const redirectUri = Deno.env.get('OAUTH_REDIRECT_URI')!;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    body: params,
  });

  if (!res.ok) {
    throw new Error(`LinkedIn token refresh failed (${res.status})`);
  }

  return await res.json();
}

async function getLinkedInConnection(supabase: ReturnType<typeof createClient>, brandId: string) {
  return await supabase
    .from('platform_connections')
    .select('id,encrypted_token,account_id,account_name,expires_at,needs_reauth,status,scopes')
    .eq('brand_id', brandId)
    .eq('platform_name', 'linkedin')
    .maybeSingle();
}

async function updateLinkedInConnection(supabase: ReturnType<typeof createClient>, connectionId: string, updates: Record<string, unknown>) {
  await supabase
    .from('platform_connections')
    .update(updates)
    .eq('id', connectionId);
}

async function uploadLinkedInImage(accessToken: string, ownerUrn: string, assetUrl: string) {
  const registerBody = {
    registerUploadRequest: {
      owner: ownerUrn,
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
    },
  };

  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(registerBody),
  });

  if (!registerRes.ok) {
    throw new Error(`LinkedIn registerUpload failed (${registerRes.status})`);
  }

  const registerJson = await registerRes.json();
  const uploadUrl = registerJson?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = registerJson?.value?.asset;

  if (!uploadUrl || !asset) {
    throw new Error('LinkedIn registerUpload response missing upload url or asset urn');
  }

  const mediaRes = await fetch(assetUrl);
  if (!mediaRes.ok) {
    throw new Error(`Failed to download post media (${mediaRes.status})`);
  }

  const mediaBytes = await mediaRes.arrayBuffer();
  const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: mediaBytes,
  });

  if (!uploadRes.ok) {
    throw new Error(`LinkedIn media upload failed (${uploadRes.status})`);
  }

  return asset as string;
}

async function publishToLinkedIn(params: {
  accessToken: string;
  accountId: string;
  caption: string;
  hashtags: string[];
  assetUrl: string | null;
  hook: string;
}) {
  const ownerUrn = `urn:li:person:${params.accountId}`;
  const textParts = [params.caption?.trim(), params.hashtags?.length ? params.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ') : '']
    .filter(Boolean);
  const commentary = textParts.join('\n\n') || params.hook || '';

  let mediaCategory: 'NONE' | 'IMAGE' = 'NONE';
  let mediaItems: Array<Record<string, unknown>> | undefined;

  if (params.assetUrl) {
    const assetUrn = await uploadLinkedInImage(params.accessToken, ownerUrn, params.assetUrl);
    mediaCategory = 'IMAGE';
    mediaItems = [{
      status: 'READY',
      media: assetUrn,
      title: { text: params.hook || 'Scheduled post' },
    }];
  }

  const postBody: Record<string, unknown> = {
    author: ownerUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: commentary },
        shareMediaCategory: mediaCategory,
        ...(mediaItems ? { media: mediaItems } : {}),
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  });

  if (!publishRes.ok) {
    const body = await publishRes.text();
    throw new Error(`LinkedIn post publish failed (${publishRes.status}): ${body}`);
  }

  return publishRes.headers.get('x-restli-id') || publishRes.headers.get('location') || null;
}

addEventListener('fetch', (evt) => {
  evt.respondWith(handle(evt.request));
});

async function handle(req: Request) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    
    await req.json().catch(() => ({}));

    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
    if (!encryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY not configured');

    const BATCH_SIZE = 100;
    let processed = 0;

    // Process due posts in batches so older posts are not left in scheduled.
    while (true) {
      const now = new Date().toISOString();
      const { data: posts, error: postsErr } = await supabase
        .from('content_calendar')
        .select('id,brand_id,platform,asset_url,caption,hook,hashtags,post_date')
        .lte('post_date', now)
        .eq('status', 'scheduled')
        .order('post_date', { ascending: true })
        .limit(BATCH_SIZE);

      if (postsErr) throw postsErr;
      if (!posts || posts.length === 0) break;

      for (const p of posts) {
        try {
          if (p.platform !== 'linkedin') {
            console.log('Skipping real publish for unsupported platform', p.platform, 'post', p.id);
            await supabase.from('content_calendar').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', p.id);
            processed += 1;
            continue;
          }

          const { data: conn, error: connErr } = await getLinkedInConnection(supabase, p.brand_id);

          if (connErr || !conn) {
            await supabase.from('content_calendar').update({ status: 'failed', last_error: 'LinkedIn connection not found' }).eq('id', p.id);
            processed += 1;
            continue;
          }

          const decrypted = JSON.parse(await decrypt(conn.encrypted_token, encryptionKey)) as PlatformTokenPayload;
          let accessToken = decrypted.access_token;
          let tokenToStore = decrypted;

          const expiryTime = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
          const shouldRefresh = conn.needs_reauth || (expiryTime > 0 && expiryTime - Date.now() < 5 * 60 * 1000);

          if (shouldRefresh && decrypted.refresh_token) {
            const refreshed = await refreshLinkedInToken(decrypted.refresh_token);
            accessToken = refreshed.access_token;
            tokenToStore = {
              ...decrypted,
              ...refreshed,
              refresh_token: refreshed.refresh_token ?? decrypted.refresh_token,
            };

            await updateLinkedInConnection(supabase, conn.id, {
              encrypted_token: await encrypt(JSON.stringify(tokenToStore), encryptionKey),
              expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : conn.expires_at,
              needs_reauth: false,
              status: 'connected',
            });
          }

          const externalPostId = await publishToLinkedIn({
            accessToken,
            accountId: conn.account_id,
            caption: p.caption,
            hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
            assetUrl: p.asset_url,
            hook: p.hook,
          });

          await supabase.from('content_calendar').update({
            status: 'published',
            published_at: new Date().toISOString(),
            external_post_id: externalPostId,
            last_error: null,
          }).eq('id', p.id);
          processed += 1;
        } catch (innerErr) {
          console.error('publish error for post', p.id, innerErr);
          const errorMessage = (innerErr as Error).message;
          await supabase.from('content_calendar').update({
            status: 'failed',
            last_error: errorMessage,
          }).eq('id', p.id);

          if (errorMessage.toLowerCase().includes('linkedin') || errorMessage.includes('401') || errorMessage.includes('403')) {
            const { data: failedConn } = await getLinkedInConnection(supabase, p.brand_id);
            if (failedConn?.id) {
              await updateLinkedInConnection(supabase, failedConn.id, { needs_reauth: true, status: 'error' });
            }
          }

          processed += 1;
        }
      }

      if (posts.length < BATCH_SIZE) break;
    }

    return new Response(JSON.stringify({ success: true, processed }), { status: 200 });
  } catch (err) {
    console.error('publish-scheduled error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
}
