import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached per-request helpers for Supabase server queries.
 *
 * React's `cache()` dedupes calls within a single render pass so that
 * sibling layouts + pages share one network round-trip instead of each
 * doing their own. Without this, a single navigation re-runs
 * `supabase.auth.getUser()` in every layout and page (middleware + root
 * layout + shop layout + page), turning 1 click into 3–4 serial
 * validation calls to Supabase and visible lag.
 *
 * Use these helpers instead of calling `supabase.auth.getUser()` or
 * `supabase.from("shops").select(...)` directly in server components.
 */

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getShopById = cache(async (shopId: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .eq("user_id", user.id)
    .single();
  return data;
});

export const getUserShops = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
});
