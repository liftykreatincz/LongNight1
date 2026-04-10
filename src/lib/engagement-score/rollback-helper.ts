import type { SupabaseClient } from "@supabase/supabase-js";

export interface RollbackResult {
  restored: number;
}

/**
 * Restore shop benchmarks from a previous snapshot.
 *
 * 1. SELECT snapshot rows for (shopId, snapshotAt). Throw if empty.
 * 2. DELETE current shop_benchmarks for shop.
 * 3. INSERT snapshot rows into shop_benchmarks (strip id, snapshot_at).
 * 4. Clear shops.drift_detected_at.
 */
export async function rollbackBenchmarks(
  supabase: SupabaseClient,
  shopId: string,
  snapshotAt: string
): Promise<RollbackResult> {
  // 1. Fetch snapshot rows
  const { data: rows } = await supabase
    .from("shop_benchmark_snapshots")
    .select(
      "id, snapshot_at, format, campaign_type, metric, fail, hranice, good, top, sample_size, is_default, computed_at"
    )
    .eq("shop_id", shopId)
    .eq("snapshot_at", snapshotAt);

  if (!rows || rows.length === 0) {
    throw new Error("Snapshot not found");
  }

  // 2. Delete current benchmarks
  await supabase.from("shop_benchmarks").delete().eq("shop_id", shopId);

  // 3. Insert snapshot rows into shop_benchmarks (strip id, snapshot_at)
  const restoredRows = rows.map((r) => ({
    shop_id: shopId,
    format: r.format as string,
    campaign_type: r.campaign_type as string,
    metric: r.metric as string,
    fail: r.fail as number,
    hranice: r.hranice as number,
    good: r.good as number,
    top: r.top as number,
    sample_size: r.sample_size as number,
    is_default: r.is_default as boolean,
    computed_at: r.computed_at as string,
  }));

  await supabase.from("shop_benchmarks").insert(restoredRows);

  // 4. Clear drift flag
  await supabase
    .from("shops")
    .update({ drift_detected_at: null })
    .eq("id", shopId);

  return { restored: rows.length };
}
