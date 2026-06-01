import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { Queue, Worker } from 'bullmq';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load local .env if present (supporting both local runner and root workspace .env)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });
dotenv.config({ override: true });

// Provide a WebSocket implementation for Node < 22 so supabase realtime initialization doesn't fail.
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION || '202605';
console.log('LinkedIn API version resolved to:', LINKEDIN_API_VERSION);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TOKEN_ENCRYPTION_KEY) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or TOKEN_ENCRYPTION_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function bufferToUint8(buf) {
  return new Uint8Array(buf);
}

async function decrypt(encryptedB64, keyB64) {
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
  const registerRes = await timeoutFetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: ownerUrn,
      },
    }),
  }, 20000);

  if (!registerRes.ok) {
    const errorBody = await registerRes.text().catch(() => '');
    throw new Error(`LinkedIn initializeUpload failed (${registerRes.status}): ${errorBody}`);
  }
  const registerJson = await registerRes.json();
  const uploadUrl = registerJson?.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = registerJson?.value?.image;
  if (!uploadUrl || !asset) throw new Error('LinkedIn initializeUpload missing data');

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
  const ownerUrn = accountId.startsWith('urn:li:') ? accountId : `urn:li:person:${accountId}`;
  const textParts = [caption?.trim(), hashtags?.length ? hashtags.map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ') : ''].filter(Boolean);
  const commentary = textParts.join('\n\n') || hook || '';

  let assetUrn = null;
  if (assetUrl) {
    assetUrn = await uploadLinkedInImage(accessToken, ownerUrn, assetUrl);
  }

  const postBody = {
    author: ownerUrn,
    commentary: commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    ...(assetUrn ? {
      content: {
        media: {
          id: assetUrn
        }
      }
    } : {})
  };

  const publishRes = await timeoutFetch('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': LINKEDIN_API_VERSION,
    },
    body: JSON.stringify(postBody),
  }, 20000);

  if (!publishRes.ok) {
    const body = await publishRes.text().catch(() => '');
    throw new Error(`LinkedIn post publish failed (${publishRes.status}): ${body}`);
  }
  return publishRes.headers.get('x-restli-id') || publishRes.headers.get('location') || null;
}

async function getLinkedInConnection(brandId) {
  return await supabase
    .from('platform_connections')
    .select('id,encrypted_token,account_id,account_name,expires_at,needs_reauth,status,scopes,publish_target_urn')
    .eq('brand_id', brandId)
    .eq('platform_name', 'linkedin')
    .maybeSingle();
}

async function updateLinkedInConnection(connectionId, updates) {
  await supabase.from('platform_connections').update(updates).eq('id', connectionId);
}

// -------------------------------------------------------------
// REDIS & BULLMQ CONFIG
// -------------------------------------------------------------

console.log('Connecting to Redis at:', REDIS_URL);
const queue = new Queue('publish-queue', { connection: { url: REDIS_URL } });

const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '5', 10);
const RATE_LIMIT_DURATION_MS = parseInt(process.env.RATE_LIMIT_DURATION_MS || '60000', 10);
const RETRY_ATTEMPTS = parseInt(process.env.RETRY_ATTEMPTS || '3', 10);
const RETRY_BACKOFF_DELAY_MS = parseInt(process.env.RETRY_BACKOFF_DELAY_MS || '5000', 10);

console.log(`Worker active rate limit: Max ${RATE_LIMIT_MAX} posts per ${RATE_LIMIT_DURATION_MS}ms`);
console.log(`Worker active retry configuration: Attempts=${RETRY_ATTEMPTS}, BackoffBaseDelay=${RETRY_BACKOFF_DELAY_MS}ms`);

const worker = new Worker('publish-queue', async (job) => {
  const p = job.data;
  console.log(`Processing scheduled post ${p.id} for platform: ${p.platform}`);

  // Fetch the latest state of the post to ensure it was not deleted or unscheduled
  const { data: latestPost, error: postErr } = await supabase
    .from('content_calendar')
    .select('status')
    .eq('id', p.id)
    .maybeSingle();

  if (postErr || !latestPost || latestPost.status !== 'scheduled') {
    console.log(`Post ${p.id} skipped (current status: ${latestPost?.status || 'not found'})`);
    return;
  }

  if (p.platform !== 'linkedin') {
    console.log(`Skipping unsupported platform ${p.platform} for post ${p.id}`);
    await supabase.from('content_calendar').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', p.id);
    return;
  }

  const { data: conn, error: connErr } = await getLinkedInConnection(p.brand_id);
  if (connErr || !conn) {
    throw new Error('LinkedIn connection not found');
  }

  const decrypted = JSON.parse(await decrypt(conn.encrypted_token, TOKEN_ENCRYPTION_KEY));
  let accessToken = decrypted.access_token;
  let tokenToStore = decrypted;

  const expiryTime = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  const shouldRefresh = conn.needs_reauth || (expiryTime > 0 && expiryTime - Date.now() < 5 * 60 * 1000);

  if (shouldRefresh && decrypted.refresh_token) {
    console.log(`Refreshing access token for connection ${conn.id}`);
    const refreshed = await refreshLinkedInToken(decrypted.refresh_token);
    accessToken = refreshed.access_token;
    tokenToStore = { ...decrypted, ...refreshed, refresh_token: refreshed.refresh_token ?? decrypted.refresh_token };

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

  const externalPostId = await publishToLinkedIn({
    accessToken,
    accountId: conn.publish_target_urn || conn.account_id,
    caption: p.caption,
    hashtags: Array.isArray(p.hashtags) ? p.hashtags : [],
    assetUrl: p.asset_url,
    hook: p.hook,
  });

  await supabase.from('content_calendar').update({
    status: 'published',
    published_at: new Date().toISOString(),
    external_post_id: externalPostId,
    last_error: null
  }).eq('id', p.id);

  console.log(`Post ${p.id} successfully published. External ID: ${externalPostId}`);
}, {
  connection: { url: REDIS_URL },
  limiter: {
    max: RATE_LIMIT_MAX,
    duration: RATE_LIMIT_DURATION_MS
  }
});

// Enforce exponential backoff retries. Mark failed on database only after final attempt fails.
worker.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
  
  if (job.attemptsMade >= job.opts.attempts) {
    const post = job.data;
    console.error(`Job ${job.id} exhausted all attempts. Marking as failed in database.`);
    
    await supabase.from('content_calendar').update({
      status: 'failed',
      last_error: err.message
    }).eq('id', post.id);

    if (err.message.toLowerCase().includes('401') || err.message.toLowerCase().includes('403') || err.message.toLowerCase().includes('linkedin')) {
      const { data: failedConn } = await getLinkedInConnection(post.brand_id);
      if (failedConn?.id) await updateLinkedInConnection(failedConn.id, { needs_reauth: true, status: 'error' });
    }
  }
});

// Helper to schedule/update a job
async function schedulePostJob(post) {
  const delay = new Date(post.post_date).getTime() - Date.now();
  
  console.log(`Scheduling job for post ${post.id}. Delay: ${Math.max(0, delay)}ms (${post.post_date})`);
  
  await queue.add('publish-post', post, {
    jobId: post.id, // Enforce uniqueness: one active job per post ID
    delay: Math.max(0, delay),
    attempts: RETRY_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: RETRY_BACKOFF_DELAY_MS
    },
    removeOnComplete: true,
    removeOnFail: false
  });
}

// -------------------------------------------------------------
// SYNC & REALTIME SUBSCRIPTION
// -------------------------------------------------------------

async function start() {
  console.log('Worker daemon starting...');

  // 1. Initial Sync: Query all currently 'scheduled' posts
  const { data: posts, error } = await supabase
    .from('content_calendar')
    .select('id,brand_id,platform,asset_url,caption,hook,hashtags,post_date,status')
    .eq('status', 'scheduled');

  if (error) {
    console.error('Error during initial sync:', error);
    process.exit(1);
  }

  console.log(`Syncing ${posts?.length || 0} scheduled posts from database into Redis queue.`);
  for (const post of posts || []) {
    await schedulePostJob(post);
  }

  // 2. Realtime Synchronization via Supabase Replication Channel
  const channel = supabase
    .channel('content_calendar_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'content_calendar' }, async (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      
      console.log(`Realtime DB event received: ${eventType}, status: ${oldRow?.status} -> ${newRow?.status}`);

      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        if (newRow.status === 'scheduled') {
          // Add or reschedule the job
          await schedulePostJob(newRow);
        } else if (newRow.status !== 'scheduled' && oldRow?.status === 'scheduled') {
          // If status moved away from scheduled, cancel the job
          console.log(`Cancelling job for post ${newRow.id} (status changed to ${newRow.status})`);
          const job = await queue.getJob(newRow.id);
          if (job) await job.remove();
        }
      } else if (eventType === 'DELETE' && oldRow?.id) {
        // If post deleted, cancel job
        console.log(`Cancelling job for deleted post ${oldRow.id}`);
        const job = await queue.getJob(oldRow.id);
        if (job) await job.remove();
      }
    })
    .subscribe((status) => {
      console.log('Supabase realtime channel subscription status:', status);
    });
}

start().catch(err => {
  console.error('Daemon crashed:', err);
  process.exit(1);
});
