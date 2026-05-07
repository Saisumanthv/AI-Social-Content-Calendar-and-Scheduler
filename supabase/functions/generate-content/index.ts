import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GenerateContentPayload {
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

interface GeneratedPost {
  day: number;
  post_date: string;
  hook: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  platform: string;
}

function buildPrompt(payload: GenerateContentPayload): string {
  const pillarsStr = payload.content_pillars.join(", ");
  const platformsStr = payload.platforms.join(", ");
  const count = payload.count && payload.count > 0 ? payload.count : 1;
  const total = payload.platforms.length * count;
  return `You are a professional social media strategist. Generate exactly ${total} social media posts.

Brand Name: ${payload.brand_name}
Brand Tone: ${payload.brand_tone}
Content Pillars: ${pillarsStr}
Target Audience: ${payload.target_audience}
Selected Date: ${payload.start_date}
User Idea: ${payload.idea}
Selected Platforms: ${platformsStr}

Return ONLY a valid JSON array with exactly ${total} objects. No markdown, no explanation, just the JSON array.

Each object must have these exact fields:
- "day": integer (1)
- "post_date": ISO 8601 date string (YYYY-MM-DD) matching ${payload.start_date}
- "hook": string (attention-grabbing opening line, max 10 words)
- "caption": string (full post caption, 80-120 words, platform-optimized for the platform)
- "hashtags": array of strings (5-8 relevant hashtags, no # prefix)
- "image_prompt": string (brief AI image prompt, 15-25 words)
- "platform": string (one of: ${platformsStr})

Use the uploaded image at ${payload.asset_url} as the associated media reference.

Create ${count} post(s) per selected platform. Make each post reflect the user idea: ${payload.idea}. Tailor the tone, hook, format, and caption to each platform while keeping the selected date and brand consistent.`;
}

async function callGroq(prompt: string, apiKey: string): Promise<GeneratedPost[]> {
  const model = Deno.env.get("GROQ_MODEL") ?? "llama-3.1-8b-instant";

  const response = await fetch(
    `https://api.groq.com/openai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 900,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GROQ API error: ${response.status} - ${err}`);
  }

  const result = await response.json();
  const text: string = result.choices?.[0]?.message?.content ?? "";

  return parseAndValidateJson(text);
}

function localToUTC(dateStr: string, timeStr: string): string {
  // Convert user's local IST time to UTC
  // IST is UTC+5:30, so we subtract 5:30 to get UTC
  // Example: May 6 23:40 IST = May 6 18:10 UTC
  
  const localDateTime = new Date(`${dateStr}T${timeStr}:00`);
  
  // Format this datetime as if it were in IST timezone to get the offset
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(localDateTime);
  const toValue = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  
  // This is what the localDateTime looks like when formatted in IST
  const formattedDate = new Date(
    toValue('year'),
    toValue('month') - 1,
    toValue('day'),
    toValue('hour'),
    toValue('minute'),
    toValue('second')
  );
  
  // Calculate timezone offset
  const offsetMs = localDateTime.getTime() - formattedDate.getTime();
  
  // Apply offset to get actual UTC time
  const utcTime = new Date(localDateTime.getTime() + offsetMs);
  
  return utcTime.toISOString();
}

function parseAndValidateJson(raw: string): GeneratedPost[] {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON array
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error("LLM_JSON_PARSE_FAILED: Could not extract JSON array from response");
    }
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("LLM_VALIDATION_FAILED: Response is not an array");
  }

  const posts = parsed as Record<string, unknown>[];
  const required = ["day", "post_date", "hook", "caption", "hashtags", "image_prompt", "platform"];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    for (const field of required) {
      if (post[field] === undefined || post[field] === null) {
        throw new Error(`LLM_VALIDATION_FAILED: Post ${i + 1} missing field: ${field}`);
      }
    }
    if (!Array.isArray(post.hashtags)) {
      throw new Error(`LLM_VALIDATION_FAILED: Post ${i + 1} hashtags must be an array`);
    }
  }

  return posts as unknown as GeneratedPost[];
}

async function callGroqWithSelfCorrection(
  payload: GenerateContentPayload,
  apiKey: string,
  maxAttempts = 3,
): Promise<GeneratedPost[]> {
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = attempt === 1
      ? buildPrompt(payload)
      : `${buildPrompt(payload)}

PREVIOUS ATTEMPT FAILED WITH ERROR: ${lastError}

Please fix the JSON and return ONLY the valid JSON array. Ensure all posts have all required fields and match the selected platform list.`;

    try {
      const posts = await callGroq(prompt, apiKey);
      const count = payload.count && payload.count > 0 ? payload.count : 1;
      const expected = payload.platforms.length * count;
      if (posts.length !== expected) {
        throw new Error(`LLM_VALIDATION_FAILED: Expected ${expected} posts, got ${posts.length}`);
      }
      return posts;
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt === maxAttempts) throw err;
      console.warn(`Attempt ${attempt} failed: ${lastError}. Retrying...`);
    }
  }

  throw new Error("Max self-correction attempts exceeded");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY secret not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload: GenerateContentPayload = await req.json();
    const { brand_id, start_date, platforms, idea, asset_url } = payload;

    if (!brand_id || !start_date || !idea?.trim() || !platforms?.length || !asset_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: brand_id, start_date, idea, platforms, asset_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side per-day cap to avoid over-scheduling
    const PER_DAY_LIMIT = 30;
    const count = payload.count && payload.count > 0 ? payload.count : 1;
    const totalRequested = platforms.length * count;

    // Count existing scheduled/published posts for the same brand and UTC day
    const dayStart = `${start_date}T00:00:00.000Z`;
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const { data: existing, error: existingErr } = await supabase
      .from('content_calendar')
      .select('id')
      .eq('brand_id', brand_id)
      .gte('post_date', dayStart)
      .lt('post_date', nextDay.toISOString())
      .in('status', ['scheduled', 'published']);

    if (existingErr) throw existingErr;
    const existingCount = (existing || []).length;
    if (existingCount + totalRequested > PER_DAY_LIMIT) {
      return new Response(
        JSON.stringify({ error: `Per-day scheduling limit exceeded for ${start_date}. ${PER_DAY_LIMIT - existingCount} slots remaining.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate posts (totalRequested) with self-correction
    const generatedPosts = await callGroqWithSelfCorrection(payload, GROQ_API_KEY);

    // Atomic transaction: delete existing draft posts for this brand, then insert all generated posts
    const { error: deleteError } = await supabase
      .from("content_calendar")
      .delete()
      .eq("brand_id", brand_id)
      .eq("status", "draft");

    if (deleteError) throw deleteError;

    const scheduledTime = payload.scheduled_time || "09:00:00";

    const rows = generatedPosts.map((p) => ({
      brand_id,
      post_date: localToUTC(p.post_date, scheduledTime.substring(0, 5)),
      hook: p.hook,
      caption: p.caption,
      hashtags: p.hashtags,
      image_prompt: p.image_prompt,
      platform: p.platform,
      status: "scheduled" as const,
      asset_url,
      scheduled_time: scheduledTime,
    }));

    const { data, error: insertError } = await supabase
      .from("content_calendar")
      .insert(rows)
      .select();

    if (insertError) {
      throw new Error(`Atomic insert failed: ${insertError.message}. Rolled back.`);
    }

    if (!data || data.length !== generatedPosts.length) {
      // Rollback: delete any partial inserts
      const insertedIds = data?.map((r: { id: string }) => r.id) ?? [];
      if (insertedIds.length > 0) {
        await supabase.from("content_calendar").delete().in("id", insertedIds);
      }
      throw new Error("Atomic insert incomplete. Rolled back to prevent partial post.");
    }

    return new Response(
      JSON.stringify({ posts: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-content error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
