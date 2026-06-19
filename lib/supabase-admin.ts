import { createClient } from "@supabase/supabase-js";

// Server-only — this file must NEVER be imported in client components
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder_key";

// Admin client — uses service role key, bypasses RLS
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
