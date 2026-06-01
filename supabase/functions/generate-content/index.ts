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
  platforms: string[];
  scheduled_time: string;
  initial_idea: string;
  idea?: string;
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

function convertToUtc(scheduledTime: string, timezone: string, postDate: string): string {
  try {
    const [hours, minutes] = scheduledTime.split(":").map(Number);
    const [year, month, day] = postDate.split("T")[0].split("-").map(Number);

    // 1. Construct a date object representing the target year-month-day at hours:minutes in UTC.
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    // 2. Format this UTC date back to check what local time it represents in the target timezone.
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });

    const parts = formatter.formatToParts(utcDate);
    const partValues: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        partValues[part.type] = Number(part.value);
      }
    }

    // 3. Create a representation of this local time as if it were in UTC.
    const formattedLocal = new Date(Date.UTC(
      partValues.year,
      partValues.month - 1,
      partValues.day,
      partValues.hour === 24 ? 0 : partValues.hour,
      partValues.minute,
      partValues.second || 0
    ));

    // 4. The difference tells us the exact offset in ms for that timezone at that specific date/time.
    const offsetMs = utcDate.getTime() - formattedLocal.getTime();

    // 5. Adjust the target date by the offset to get the correct UTC time.
    const scheduledUtc = new Date(utcDate.getTime() + offsetMs);
    return scheduledUtc.toISOString();
  } catch (err) {
    console.error("convertToUtc failed, fallback to default parse:", err);
    return new Date(postDate).toISOString();
  }
}

function buildPrompt(payload: GenerateContentPayload): string {
  const pillarsStr = payload.content_pillars.join(", ");
  const platformsStr = payload.platforms.join(", ");
  const initialIdea = payload.initial_idea || payload.idea || "None provided";
  return `You are a professional social media strategist. Generate exactly 1 social media post for the following brand.

Brand Name: ${payload.brand_name}
Brand Tone: ${payload.brand_tone}
Content Pillars: ${pillarsStr}
Target Audience: ${payload.target_audience}
Target Platforms: ${platformsStr}
Start Date: ${payload.start_date}
Initial Idea: ${initialIdea}
Preferred Posting Time: ${payload.scheduled_time}

Return ONLY a valid JSON array of exactly 1 object. No markdown, no explanation, just the JSON array.

Each object must have these exact fields:
- "day": integer (1)
- "post_date": ISO 8601 date string (YYYY-MM-DD) starting from ${payload.start_date} and incrementing daily
- "hook": string (attention-grabbing opening line, max 15 words)
- "caption": string (full post caption, 150-300 words, platform-optimized for one of: ${platformsStr})
- "hashtags": array of strings (10-15 relevant hashtags, no # prefix)
- "image_prompt": string (detailed prompt for AI image generation, 30-50 words)
- "platform": string (must be one of: ${platformsStr})

Distribute content across all pillars: ${pillarsStr}. Vary post types (educational, entertaining, promotional, user-story, behind-scenes). Use the initial idea as the creative seed, if provided. Make each post unique and distribute the posts across the selected platforms as evenly as possible.`;
}

async function callGemini(prompt: string, apiKey: string): Promise<GeneratedPost[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 16384,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${err}`);
  }

  const result = await response.json();
  const text: string = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";

  return parseAndValidateJson(text);
}

function parseAndValidateJson(raw: string): GeneratedPost[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
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

async function callGeminiWithSelfCorrection(
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

Please fix the JSON and return ONLY the valid JSON array. Ensure the single post has all required fields.`;

    try {
      const posts = await callGemini(prompt, apiKey);
      if (posts.length !== 1) {
        throw new Error(`LLM_VALIDATION_FAILED: Expected 1 post, got ${posts.length}`);
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY secret not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload: GenerateContentPayload = await req.json();
    const { brand_id, start_date, platforms, scheduled_time, initial_idea, idea } = payload;

    if (!brand_id || !start_date || !scheduled_time || !Array.isArray(platforms) || platforms.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: brand_id, start_date, scheduled_time, platforms" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { count: activeCount, error: activeCountError } = await supabase
      .from("content_calendar")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand_id)
      .in("status", ["draft", "scheduled"]);

    if (activeCountError) throw activeCountError;
    if ((activeCount ?? 0) >= 5) {
      return new Response(
        JSON.stringify({ error: "You can only have 5 active posts at a time. Publish, complete, or fail one first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    payload.initial_idea = initial_idea || idea || "";

    const generatedPosts = await callGeminiWithSelfCorrection(payload, GEMINI_API_KEY);

    const post = generatedPosts[0];
    const row = {
      brand_id,
      post_date: convertToUtc(scheduled_time, payload.timezone, post.post_date),
      hook: post.hook,
      caption: post.caption,
      hashtags: post.hashtags,
      image_prompt: post.image_prompt,
      platform: platforms.includes(post.platform) ? post.platform : platforms[0],
      status: "draft" as const,
      asset_url: null,
      scheduled_time: `${scheduled_time}:00`,
    };

    const { data, error: insertError } = await supabase
      .from("content_calendar")
      .insert(row)
      .select();

    if (insertError) {
      throw new Error(`Atomic insert failed: ${insertError.message}. Rolled back.`);
    }

    if (!data || data.length !== 1) {
      throw new Error("Atomic insert incomplete.");
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