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

export const getAiSpend = cache(async (): Promise<{
  today: number;
  month: number;
}> => {
  const user = await getCurrentUser();
  if (!user) return { today: 0, month: 0 };

  // Server runs in fra1 (see vercel.json) → Europe/Berlin, close enough to
  // Europe/Prague. Month start is the 1st of the current month at local midnight,
  // day start is today at local midnight.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select("cost_usd, created_at")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());

  if (error) {
    console.error("[getAiSpend]", error);
    return { today: 0, month: 0 };
  }

  let today = 0;
  let month = 0;
  for (const row of data ?? []) {
    const cost = Number(row.cost_usd ?? 0);
    month += cost;
    if (new Date(row.created_at as string) >= dayStart) {
      today += cost;
    }
  }
  return { today, month };
});
