import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// Provide a WebSocket implementation for Node < 22 so supabase realtime initialization doesn't fail.
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TOKEN_ENCRYPTION_KEY,
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  BATCH_SIZE = '10',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TOKEN_ENCRYPTION_KEY) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or TOKEN_ENCRYPTION_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { realtime: { enabled: false } });

function bufferToUint8(buf) {
  return new Uint8Array(buf);
}

async function decrypt(encryptedB64, keyB64) {
  // encryptedB64 is base64 of binary string that is iv (12 bytes) + ciphertext
  const combined = Buffer.from(encryptedB64, 'base64');
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const keyRaw = Buffer.from(keyB64, 'base64');
  const cryptoKey = await crypto.subtle.importKey('raw', bufferToUint8(keyRaw), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bufferToUint8(iv) }, cryptoKey, bufferToUint8(ciphertext));
  return new TextDecoder().decode(plain);
}

async function timeoutFetch(input, init = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const merged = { ...init, signal: controller.signal };
    return await fetch(input, merged);
  } finally {
    clearTimeout(id);
  }
}

async function refreshLinkedInToken(refreshToken) {
  if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET || !OAUTH_REDIRECT_URI) throw new Error('LinkedIn client config missing');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: LINKEDIN_CLIENT_ID,
    client_secret: LINKEDIN_CLIENT_SECRET,
    redirect_uri: OAUTH_REDIRECT_URI,
  });
  const res = await timeoutFetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body: params }, 15000);
  if (!res.ok) throw new Error(`LinkedIn token refresh failed (${res.status})`);
  return await res.json();
}

async function uploadLinkedInImage(accessToken, ownerUrn, assetUrl) {
  const registerBody = {
    registerUploadRequest: {
      owner: ownerUrn,
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
    },
  };

  const registerRes = await timeoutFetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(registerBody),
  }, 20000);

  if (!registerRes.ok) throw new Error(`LinkedIn registerUpload failed (${registerRes.status})`);
  const registerJson = await registerRes.json();
  const uploadUrl = registerJson?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = registerJson?.value?.asset;
  if (!uploadUrl || !asset) throw new Error('LinkedIn registerUpload missing data');

  const mediaRes = await timeoutFetch(assetUrl, {}, 20000);
  if (!mediaRes.ok) throw new Error(`Failed to download post media (${mediaRes.status})`);
  const mediaBytes = await mediaRes.arrayBuffer();
  const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';

  const uploadRes = await timeoutFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: mediaBytes,
  }, 20000);
  if (!uploadRes.ok) throw new Error(`LinkedIn media upload failed (${uploadRes.status})`);
  return asset;
}

async function publishToLinkedIn({ accessToken, accountId, caption, hashtags = [], assetUrl = null, hook }) {
  const ownerUrn = `urn:li:person:${accountId}`;
  const textParts = [caption?.trim(), hashtags?.length ? hashtags.map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ') : ''].filter(Boolean);
  const commentary = textParts.join('\n\n') || hook || '';

  let mediaCategory = 'NONE';
  let mediaItems;
  if (assetUrl) {
    const assetUrn = await uploadLinkedInImage(accessToken, ownerUrn, assetUrl);
    mediaCategory = 'IMAGE';
    mediaItems = [{ status: 'READY', media: assetUrn, title: { text: hook || 'Scheduled post' } }];
  }

  const postBody = {
    author: ownerUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: commentary },
        shareMediaCategory: mediaCategory,
        ...(mediaItems ? { media: mediaItems } : {}),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const publishRes = await timeoutFetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  }, 20000);

  if (!publishRes.ok) {
    const body = await publishRes.text();
    throw new Error(`LinkedIn post publish failed (${publishRes.status}): ${body}`);
  }
  return publishRes.headers.get('x-restli-id') || publishRes.headers.get('location') || null;
}

async function getLinkedInConnection(brandId) {
  return await supabase
    .from('platform_connections')
    .select('id,encrypted_token,account_id,account_name,expires_at,needs_reauth,status,scopes')
    .eq('brand_id', brandId)
    .eq('platform_name', 'linkedin')
    .maybeSingle();
}

async function updateLinkedInConnection(connectionId, updates) {
  await supabase.from('platform_connections').update(updates).eq('id', connectionId);
}

async function runOnce() {
  console.log('publish-runner start');
  const now = new Date().toISOString();
  const batch = parseInt(BATCH_SIZE, 10) || 10;
  const { data: posts, error: postsErr } = await supabase
    .from('content_calendar')
    .select('id,brand_id,platform,asset_url,caption,hook,hashtags,post_date')
    .lte('post_date', now)
    .eq('status', 'scheduled')
    .order('post_date', { ascending: true })
    .limit(batch);

  if (postsErr) {
    console.error('Failed to load scheduled posts', postsErr);
    process.exit(2);
  }
  if (!posts || posts.length === 0) {
    console.log('No scheduled posts to process');
    return;
  }

  for (const p of posts) {
    try {
      if (p.platform !== 'linkedin') {
        console.log('Skipping unsupported platform', p.platform, p.id);
        await supabase.from('content_calendar').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', p.id);
        continue;
      }

      const { data: conn, error: connErr } = await getLinkedInConnection(p.brand_id);
      if (connErr || !conn) {
        await supabase.from('content_calendar').update({ status: 'failed', last_error: 'LinkedIn connection not found' }).eq('id', p.id);
        continue;
      }

      const decrypted = JSON.parse(await decrypt(conn.encrypted_token, TOKEN_ENCRYPTION_KEY));
      let accessToken = decrypted.access_token;
      let tokenToStore = decrypted;

      const expiryTime = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
      const shouldRefresh = conn.needs_reauth || (expiryTime > 0 && expiryTime - Date.now() < 5 * 60 * 1000);

      if (shouldRefresh && decrypted.refresh_token) {
        const refreshed = await refreshLinkedInToken(decrypted.refresh_token);
        accessToken = refreshed.access_token;
        tokenToStore = { ...decrypted, ...refreshed, refresh_token: refreshed.refresh_token ?? decrypted.refresh_token };
        // re-encrypt on server side using supplied key; here we store plaintext encryption using same format as edge function
        const keyRaw = Buffer.from(TOKEN_ENCRYPTION_KEY, 'base64');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(JSON.stringify(tokenToStore));
        const cryptoKey = await crypto.subtle.importKey('raw', bufferToUint8(keyRaw), 'AES-GCM', false, ['encrypt']);
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc));
        const combined = new Uint8Array(iv.length + ciphertext.length);
        combined.set(iv, 0);
        combined.set(ciphertext, iv.length);
        const encryptedB64 = Buffer.from(combined).toString('base64');

        await updateLinkedInConnection(conn.id, {
          encrypted_token: encryptedB64,
          expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : conn.expires_at,
          needs_reauth: false,
          status: 'connected',
        });
      }

      if (p.asset_url) {
        // This runner supports media; attempt publish with media
      }

      const externalPostId = await publishToLinkedIn({
        accessToken,
        accountId: conn.account_id,
        caption: p.caption,
        hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
        assetUrl: p.asset_url,
        hook: p.hook,
      });

      await supabase.from('content_calendar').update({ status: 'published', published_at: new Date().toISOString(), external_post_id: externalPostId, last_error: null }).eq('id', p.id);
      console.log('Published post', p.id, 'external id', externalPostId);
    } catch (err) {
      console.error('Error publishing post', p.id, err);
      const message = err?.message || String(err);
      await supabase.from('content_calendar').update({ status: 'failed', last_error: message }).eq('id', p.id);

      if (String(message).toLowerCase().includes('401') || String(message).toLowerCase().includes('403') || String(message).toLowerCase().includes('linkedin')) {
        const { data: failedConn } = await getLinkedInConnection(p.brand_id);
        if (failedConn?.id) await updateLinkedInConnection(failedConn.id, { needs_reauth: true, status: 'error' });
      }
    }
  }
}

runOnce().catch((e) => {
  console.error('publish-runner fatal', e);
  process.exit(1);
});
