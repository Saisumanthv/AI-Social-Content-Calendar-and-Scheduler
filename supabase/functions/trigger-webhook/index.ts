import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TriggerWebhookPayload {
  post_id: string;
  brand_id: string;
  caption: string;
  hashtags: string[];
  asset_url: string | null;
  platform: string;
  scheduled_utc: string;
  hook: string;
}

function convertToUtc(localTime: string, timezone: string, postDate: string): string {
  try {
    const [hours, minutes] = localTime.split(":").map(Number);
    const [year, month, day] = postDate.split("T")[0].split("-").map(Number);

    // Use Intl to get timezone offset
    const localDate = new Date(year, month - 1, day, hours, minutes, 0);
    const utcDate = new Date(
      localDate.toLocaleString("en-US", { timeZone: "UTC" })
    );
    const tzDate = new Date(
      localDate.toLocaleString("en-US", { timeZone: timezone })
    );
    const offset = utcDate.getTime() - tzDate.getTime();
    const scheduledUtc = new Date(localDate.getTime() + offset);
    return scheduledUtc.toISOString();
  } catch {
    return new Date(postDate).toISOString();
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const N8N_WEBHOOK_URL = Deno.env.get("N8N_WEBHOOK_URL");
    const N8N_SECRET_TOKEN = Deno.env.get("N8N_SECRET_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);

    const payload: TriggerWebhookPayload = await req.json();
    const { post_id, brand_id } = payload;

    if (!post_id || !brand_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: post_id, brand_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch brand profile for timezone
    const { data: brand, error: brandError } = await supabase
      .from("brand_profiles")
      .select("timezone")
      .eq("id", brand_id)
      .maybeSingle();

    if (brandError || !brand) {
      throw new Error("Brand profile not found");
    }

    // Fetch post for scheduled_time
    const { data: post, error: postError } = await supabase
      .from("content_calendar")
      .select("scheduled_time, post_date, asset_url, status, image_prompt")
      .eq("id", post_id)
      .maybeSingle();

    if (postError || !post) {
      throw new Error("Post not found");
    }

    // Convert local time to UTC
    const scheduledUtc = convertToUtc(post.scheduled_time, brand.timezone, post.post_date);

    // Update post status to scheduled
    const { error: updateError } = await supabase
      .from("content_calendar")
      .update({ status: "scheduled" })
      .eq("id", post_id);

    if (updateError) throw updateError;

    let webhookStatus = "not_configured";
    let webhookError: string | null = null;

    // Fire n8n webhook if configured (non-blocking - don't fail the request if webhook fails)
    if (N8N_WEBHOOK_URL) {
      try {
        const webhookBody = {
          post_id,
          brand_id: payload.brand_id,
          caption: payload.caption,
          hashtags: payload.hashtags,
          asset_url: payload.asset_url ?? null,
          platform: payload.platform,
          hook: payload.hook,
          post_date: post.post_date,
          image_prompt: post.image_prompt,
          scheduled_utc: scheduledUtc,
          timestamp: new Date().toISOString(),
        };

        const n8nRes = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(N8N_SECRET_TOKEN ? {
              "Authorization": `Bearer ${N8N_SECRET_TOKEN}`,
              "X-N8N-Token": N8N_SECRET_TOKEN,
            } : {}),
          },
          body: JSON.stringify(webhookBody),
        });

        if (!n8nRes.ok) {
          const n8nErr = await n8nRes.text();
          console.error(`n8n webhook failed: ${n8nRes.status} - ${n8nErr}`);

          // Track webhook failure
          if (n8nRes.status === 401) {
            webhookStatus = "token_expired";
            webhookError = "Social platform token expired. Post scheduled but auto-posting may not work.";
          } else {
            webhookStatus = "failed";
            webhookError = `Webhook error: ${n8nRes.status}`;
          }
        } else {
          webhookStatus = "success";
        }
      } catch (webhookErr) {
        // Log webhook error but don't fail the request - post is already scheduled
        console.error("Error calling n8n webhook:", webhookErr);
        webhookStatus = "error";
        webhookError = (webhookErr as Error).message;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        post_id,
        scheduled_utc: scheduledUtc,
        message: N8N_WEBHOOK_URL
          ? "Post scheduled and webhook triggered."
          : "Post scheduled. Configure N8N_WEBHOOK_URL to enable auto-posting.",
        webhook_status: webhookStatus,
        webhook_error: webhookError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("trigger-webhook error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
