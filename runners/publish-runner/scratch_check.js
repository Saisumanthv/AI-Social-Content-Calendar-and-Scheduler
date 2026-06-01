import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ws from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

if (!globalThis.WebSocket) globalThis.WebSocket = ws;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data: posts, error } = await supabase
    .from('content_calendar')
    .select('*')
    .eq('id', 'bd693a65-b2f4-48e1-9ca8-521ce75e1bed')
    .maybeSingle();

  if (error) {
    console.error("DB error:", error);
    process.exit(1);
  }

  console.log("Current time:", new Date().toISOString());
  console.log("Post details:", JSON.stringify(posts, null, 2));
}

check();
