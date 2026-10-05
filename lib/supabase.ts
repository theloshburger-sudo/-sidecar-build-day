import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** Browser client with the public anon key, or null when accounts aren't configured (guest-only deploy). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
