import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Apikey, X-Client-Info',
};

Deno.serve((req: Request) => handle(req));

async function handle(req: Request) {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Grace window in milliseconds (10 minutes)
    const GRACE_MS = 10 * 60 * 1000;
    const now = Date.now();

    // `post_date` is the canonical UTC due timestamp for scheduled posts.
    const { data: posts, error } = await supabase
      .from('content_calendar')
      .select('id,post_date')
      .eq('status', 'scheduled')
      .order('post_date', { ascending: true })
      .limit(200);

    if (error) throw error;

    let processed = 0;

    for (const p of posts ?? []) {
      const dueMs = new Date(p.post_date).getTime();

      if (Number.isFinite(dueMs) && now > dueMs + GRACE_MS) {
        await supabase.from('content_calendar').update({
          status: 'failed',
          last_error: 'Post missed its scheduled publish window before the publishing job ran.',
        }).eq('id', p.id);
        processed += 1;
      }
    }

    return new Response(JSON.stringify({ success: true, processed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fail-overdue error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
