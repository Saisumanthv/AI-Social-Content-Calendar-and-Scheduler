import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Returns an authorization URL for the requested platform.
// Client should call this and redirect the user to the returned `url`.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apikey, X-Client-Info',
};

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    if (!platform) {
      return new Response(JSON.stringify({ error: 'platform required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Example: Build provider URLs from env vars. Make sure to set these in Supabase.
    const redirectUri = Deno.env.get('OAUTH_REDIRECT_URI') || '';

    let authUrl = '';

    switch (platform) {
      case 'linkedin': {
        const clientId = Deno.env.get('LINKEDIN_CLIENT_ID') || '';
        const scope = encodeURIComponent('openid profile email w_member_social');
        authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
        break;
      }
      case 'x': {
        const clientId = Deno.env.get('X_CLIENT_ID') || '';
        const scope = encodeURIComponent('tweet.write users.read offline.access');
        authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&code_challenge=challenge&code_challenge_method=plain`;
        break;
      }
      case 'instagram': {
        const clientId = Deno.env.get('FACEBOOK_CLIENT_ID') || '';
        const scope = encodeURIComponent('pages_manage_posts pages_read_engagement instagram_content_publish');
        authUrl = `https://www.facebook.com/v15.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: 'unsupported platform' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ url: authUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('oauth-start error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
