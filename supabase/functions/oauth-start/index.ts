import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildLinkedInAuthorizeUrl(state: string) {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID');
  const redirectUri = Deno.env.get('OAUTH_REDIRECT_URI');

  if (!clientId || !redirectUri) {
    throw new Error('LINKEDIN_CLIENT_ID or OAUTH_REDIRECT_URI not configured');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'w_member_social r_liteprofile',
    state,
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

Deno.serve((req) => handle(req));

async function handle(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const platform = (url.searchParams.get('platform') || body.platform || 'linkedin').toLowerCase();
    const state = url.searchParams.get('state') || body.state || '';

    if (platform !== 'linkedin') {
      return new Response(JSON.stringify({ error: 'Unsupported platform' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authorizeUrl = buildLinkedInAuthorizeUrl(state);
    return new Response(JSON.stringify({ url: authorizeUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}