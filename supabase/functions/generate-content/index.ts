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
  platform: string;
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
  return `You are a professional social media strategist. Generate a 30-day content calendar for the following brand.

Brand Name: ${payload.brand_name}
Brand Tone: ${payload.brand_tone}
Content Pillars: ${pillarsStr}
Target Audience: ${payload.target_audience}
Platform: ${payload.platform}
Start Date: ${payload.start_date}

Return ONLY a valid JSON array of exactly 30 objects. No markdown, no explanation, just the JSON array.

Each object must have these exact fields:
- "day": integer (1-30)
- "post_date": ISO 8601 date string (YYYY-MM-DD) starting from ${payload.start_date} and incrementing daily
- "hook": string (attention-grabbing opening line, max 15 words)
- "caption": string (full post caption, 150-300 words, platform-optimized for ${payload.platform})
- "hashtags": array of strings (10-15 relevant hashtags, no # prefix)
- "image_prompt": string (detailed prompt for AI image generation, 30-50 words)
- "platform": string ("${payload.platform}")

Distribute content across all pillars: ${pillarsStr}. Vary post types (educational, entertaining, promotional, user-story, behind-scenes). Make each post unique.`;
}

async function callGroq(prompt: string, apiKey: string): Promise<GeneratedPost[]> {
  const response = await fetch(
    `https://api.groq.com/openai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 16384,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${err}`);
  }

  const result = await response.json();
  const text: string = result.choices?.[0]?.message?.content ?? "";

  return parseAndValidateJson(text);
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

Please fix the JSON and return ONLY the valid JSON array. Ensure all 30 posts have all required fields.`;

    try {
      const posts = await callGroq(prompt, apiKey);
      if (posts.length !== 30) {
        throw new Error(`LLM_VALIDATION_FAILED: Expected 30 posts, got ${posts.length}`);
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
    const GROQ_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GEMINI_API_KEY secret not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload: GenerateContentPayload = await req.json();
    const { brand_id, start_date, platform } = payload;

    if (!brand_id || !start_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: brand_id, start_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate 30 posts with self-correction
    const generatedPosts = await callGroqWithSelfCorrection(payload, GROQ_API_KEY);

    // Atomic transaction: delete existing draft posts for this brand, then insert all 30
    const { error: deleteError } = await supabase
      .from("content_calendar")
      .delete()
      .eq("brand_id", brand_id)
      .eq("status", "draft");

    if (deleteError) throw deleteError;

    const rows = generatedPosts.map((p) => ({
      brand_id,
      post_date: new Date(`${p.post_date}T09:00:00Z`).toISOString(),
      hook: p.hook,
      caption: p.caption,
      hashtags: p.hashtags,
      image_prompt: p.image_prompt,
      platform: platform || p.platform,
      status: "draft" as const,
      asset_url: null,
      scheduled_time: "09:00:00",
    }));

    const { data, error: insertError } = await supabase
      .from("content_calendar")
      .insert(rows)
      .select();

    if (insertError) {
      throw new Error(`Atomic insert failed: ${insertError.message}. Rolled back.`);
    }

    if (!data || data.length !== 30) {
      // Rollback: delete any partial inserts
      const insertedIds = data?.map((r: { id: string }) => r.id) ?? [];
      if (insertedIds.length > 0) {
        await supabase.from("content_calendar").delete().in("id", insertedIds);
      }
      throw new Error("Atomic insert incomplete. Rolled back batch to prevent partial calendar.");
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
