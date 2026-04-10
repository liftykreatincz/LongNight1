import { createClient as supabaseCreateClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client with service-role privileges.
 * Use only in trusted server contexts (cron jobs, webhooks) where
 * there is no user session / cookie context.
 */
export function createServiceRoleClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  }

  return supabaseCreateClient(url, key);
}
