import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

interface LinkedInProfileResponse {
  id: string;
  localizedFirstName?: string;
  localizedLastName?: string;
}

function base64ToUint8Array(b64: string) {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function encrypt(plaintext: string, keyB64: string) {
  const keyRaw = base64ToUint8Array(keyB64);
  const cryptoKey = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc));
  // store iv + ciphertext as base64
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  let s = '';
  for (let i = 0; i < combined.length; i++) s += String.fromCharCode(combined[i]);
  return btoa(s);
}

async function getLinkedInProfile(accessToken: string): Promise<LinkedInProfileResponse> {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`LinkedIn profile lookup failed (${res.status})`);
  }

  const data = await res.json();
  // Map userinfo response to our interface
  return {
    id: data.sub, // userinfo returns 'sub' instead of 'id'
    localizedFirstName: data.given_name,
    localizedLastName: data.family_name,
  };
}

function buildResultHtml(status: 'connected' | 'error', platform: string, message: string) {
  const safeMessage = message.replaceAll('</', '<\\/');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${status === 'connected' ? 'Connected' : 'Connection failed'}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; min-height: 100vh; display: grid; place-items: center; }
      .card { background: white; padding: 24px 28px; border-radius: 16px; box-shadow: 0 16px 50px rgba(15, 23, 42, 0.12); max-width: 420px; width: calc(100vw - 32px); }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0; line-height: 1.5; color: #334155; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${status === 'connected' ? 'LinkedIn connected' : 'LinkedIn connection failed'}</h1>
      <p>${safeMessage}</p>
    </div>
    <script>
      (function() {
        try {
          if (window.opener) {
            window.opener.postMessage(${JSON.stringify({ type: 'oauth-complete', platform, status, message })}, '*');
          }
        } catch (error) {}
        setTimeout(function() { window.close(); }, 250);
      })();
    </script>
  </body>
</html>`;
}

async function exchangeCodeForToken(platform: string, code: string) : Promise<TokenResponse> {
  // Implement platform-specific exchanges using env vars
  switch (platform) {
    case 'linkedin': {
      const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')!;
      const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
      const redirectUri = Deno.env.get('OAUTH_REDIRECT_URI')!;

      const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
      const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body: params });
      if (!res.ok) throw new Error('LinkedIn token exchange failed');
      return await res.json();
    }
    case 'x': {
      // X (Twitter) token exchange - adjust per your app's requirements
      const clientId = Deno.env.get('X_CLIENT_ID')!;
      const clientSecret = Deno.env.get('X_CLIENT_SECRET')!;
      const redirectUri = Deno.env.get('OAUTH_REDIRECT_URI')!;

      const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId });
      const res = await fetch('https://api.twitter.com/2/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` }, body: params });
      if (!res.ok) throw new Error('X token exchange failed');
      return await res.json();
    }
    case 'instagram': {
      const clientId = Deno.env.get('FACEBOOK_CLIENT_ID')!;
      const clientSecret = Deno.env.get('FACEBOOK_CLIENT_SECRET')!;
      const redirectUri = Deno.env.get('OAUTH_REDIRECT_URI')!;
      const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code });
      const res = await fetch(`https://graph.facebook.com/v15.0/oauth/access_token?${params.toString()}`);
      if (!res.ok) throw new Error('Instagram token exchange failed');
      return await res.json();
    }
    default:
      throw new Error('Unsupported platform');
  }
}

Deno.serve((req) => handle(req));

async function handle(req: Request) {
  try {
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') || 'linkedin';
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
      return new Response(JSON.stringify({ error: 'code required' }), { status: 400 });
    }

    const token = await exchangeCodeForToken(platform, code);

    let accountId = '';
    let accountName = '';

    if (platform === 'linkedin') {
      const profile = await getLinkedInProfile(token.access_token);
      accountId = profile.id;
      accountName = [profile.localizedFirstName, profile.localizedLastName].filter(Boolean).join(' ').trim() || 'LinkedIn user';
    }

    const encryptionKey = Deno.env.get('TOKEN_ENCRYPTION_KEY');
    if (!encryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY not configured');

    const encrypted = await encrypt(JSON.stringify(token), encryptionKey);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, serviceKey);

    // Upsert into platform_connections. Expect state to be brand_id or similar.
    const brandId = state || '';

    const { data, error } = await supabase
      .from('platform_connections')
      .upsert({
        brand_id: brandId,
        platform_name: platform,
        encrypted_token: encrypted,
        account_id: accountId,
        account_name: accountName,
        scopes: token.scope ? token.scope.split(' ').filter(Boolean) : [],
        status: 'connected',
        needs_reauth: false,
        expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      }, { onConflict: 'brand_id,platform_name' })
      .select()
      .single();

    if (error) throw error;

    return new Response(buildResultHtml('connected', platform, `${platform === 'linkedin' ? 'LinkedIn' : platform} account connected successfully.`), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('oauth-callback error', err);
    const message = (err as Error).message;
    const platform = new URL(req.url).searchParams.get('platform') || 'linkedin';
    return new Response(buildResultHtml('error', platform, message), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
