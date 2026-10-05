import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * A database client acting as the signed-in student (their own JWT), so row-level security
 * applies exactly as it does in the browser. No service-role key anywhere.
 */
export async function userDb(req: Request): Promise<{ db: SupabaseClient; user: User } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const jwt = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!url || !key || !jwt) return null;
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return null;
  return { db, user: data.user };
}
