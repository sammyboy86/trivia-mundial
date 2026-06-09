import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Public client — uses anon key, restricted by RLS to SELECT only
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
