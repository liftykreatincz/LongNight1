import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeBenchmarks,
  type BenchmarkInput,
  type BenchmarkOutputRow,
} from "./compute-benchmarks";
import { DEFAULT_BENCHMARKS } from "./defaults";
import type { Format, MetricKey } from "./types";

export interface RecomputeResult {
  updated: number;
  image: { sampleSize: number; isDefault: boolean };
  video: { sampleSize: number; isDefault: boolean };
}

interface BenchmarkRow extends BenchmarkOutputRow {
  shop_id: string;
  computed_at: string;
}

/**
 * Recompute frozen benchmarks for a shop and upsert them into
 * `shop_benchmarks`. Uses rolling 30-day window, falls back to all-time
 * if the window is empty, and to agency defaults when sample size < 15
 * for the shared `all` segment. Segmented rows (`evergreen`/`sale`/
 * `seasonal`) are emitted only when the per-segment filtered sample is
 * ≥ 15. Campaign type + real video duration are pulled via nested JOIN
 * on `meta_ad_campaigns`.
 */
export async function recomputeBenchmarksForShop(
  supabase: SupabaseClient,
  shopId: string
): Promise<RecomputeResult> {
  // 0. Get shop settings (CPA target + rolling window config)
  const { data: shopRow } = await supabase
    .from("shops")
    .select("cpa_target_czk, benchmark_window_days")
    .eq("id", shopId)
    .maybeSingle();

  const cpaTarget = Number(shopRow?.cpa_target_czk) || 300;

  // benchmark_window_days: null → all-time, undefined/missing → 30, N → N
  const rawWindow = shopRow?.benchmark_window_days;
  const windowDays: number | null =
    rawWindow === null ? null : typeof rawWindow === "number" ? rawWindow : 30;

  const selectCols =
    "creative_type, spend, impressions, clicks, link_clicks, purchases, purchase_revenue, video_views_3s, video_thruplay, video_plays, video_avg_watch_time, video_duration_seconds, cost_per_purchase, cpm, date_stop, campaign_id";

  // 1. Fetch creatives with optional rolling window
  let rows: Record<string, unknown>[] | null;

  if (windowDays !== null) {
    const cutoffDate = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const result = await supabase
      .from("meta_ad_creatives")
      .select(selectCols)
      .eq("shop_id", shopId)
      .gte("date_stop", cutoffDate);
    rows = result.data;

    // Fallback: all-time if windowed query returned nothing
    if (!rows || rows.length === 0) {
      const allTime = await supabase
        .from("meta_ad_creatives")
        .select(selectCols)
        .eq("shop_id", shopId);
      rows = allTime.data ?? [];
    }
  } else {
    // null = all-time, no date filter
    const allTime = await supabase
      .from("meta_ad_creatives")
      .select(selectCols)
      .eq("shop_id", shopId);
    rows = allTime.data ?? [];
  }

  // 1b. Separately fetch campaign types (no FK in schema cache → can't use
  // nested select). Merge client-side by campaign_id.
  const { data: campaignRows } = await supabase
    .from("meta_ad_campaigns")
    .select("id, campaign_type")
    .eq("shop_id", shopId);
  const campaignTypeMap = new Map<string, string>();
  for (const c of campaignRows ?? []) {
    if (c.id && c.campaign_type) {
      campaignTypeMap.set(c.id as string, c.campaign_type as string);
    }
  }

  // 3. Map to BenchmarkInput (carrying campaignType + real duration)
  const inputs: BenchmarkInput[] = (rows ?? []).map((r) => {
    const campaignId = (r as { campaign_id?: string | null }).campaign_id;
    const campaignTypeRaw = campaignId
      ? campaignTypeMap.get(campaignId)
      : undefined;
    const campaignType =
      campaignTypeRaw === "evergreen" ||
      campaignTypeRaw === "sale" ||
      campaignTypeRaw === "seasonal"
        ? campaignTypeRaw
        : "unknown";
    return {
      creativeType: (r.creative_type as string) || "image",
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      linkClicks: Number(r.link_clicks) || 0,
      purchases: Number(r.purchases) || 0,
      purchaseRevenue: Number(r.purchase_revenue) || 0,
      videoViews3s: Number(r.video_views_3s) || 0,
      videoThruplay: Number(r.video_thruplay) || 0,
      videoPlays: Number(r.video_plays) || 0,
      videoAvgWatchTime: Number(r.video_avg_watch_time) || 0,
      videoDurationSeconds:
        (r as { video_duration_seconds?: number | null })
          .video_duration_seconds != null
          ? Number(
              (r as { video_duration_seconds?: number | null })
                .video_duration_seconds
            )
          : null,
      cpa: Number(r.cost_per_purchase) || 0,
      cpm: Number(r.cpm) || 0,
      campaignType,
    };
  });

  // 4. Compute segmented benchmark rows.
  const computed = computeBenchmarks(inputs, cpaTarget);

  const imageEligible = inputs.filter(
    (r) => r.creativeType !== "video"
  ).length;
  const videoEligible = inputs.filter((r) => r.creativeType === "video").length;

  const now = new Date().toISOString();
  const upsertRows: BenchmarkRow[] = computed.map((c) => ({
    ...c,
    shop_id: shopId,
    computed_at: now,
  }));

  function hasAllFor(format: Format): boolean {
    return upsertRows.some(
      (r) => r.format === format && r.campaign_type === "all"
    );
  }

  const isImageDefault = !hasAllFor("image");
  const isVideoDefault = !hasAllFor("video");

  // 5. Fall back to agency defaults for missing `all` rows per format.
  if (isImageDefault) {
    for (const [metric, t] of Object.entries(DEFAULT_BENCHMARKS.image) as Array<
      [MetricKey, { fail: number; hranice: number; good: number; top: number }]
    >) {
      upsertRows.push({
        shop_id: shopId,
        format: "image",
        campaign_type: "all",
        metric,
        fail: t.fail,
        hranice: t.hranice,
        good: t.good,
        top: t.top,
        sample_size: imageEligible,
        is_default: true,
        computed_at: now,
      });
    }
  }
  if (isVideoDefault) {
    for (const [metric, t] of Object.entries(DEFAULT_BENCHMARKS.video) as Array<
      [MetricKey, { fail: number; hranice: number; good: number; top: number }]
    >) {
      upsertRows.push({
        shop_id: shopId,
        format: "video",
        campaign_type: "all",
        metric,
        fail: t.fail,
        hranice: t.hranice,
        good: t.good,
        top: t.top,
        sample_size: videoEligible,
        is_default: true,
        computed_at: now,
      });
    }
  }

  // 6. Delete + reinsert: segmentation means a previously populated
  //    segment may disappear on recompute (sample drops below 15). A
  //    narrow-conflict upsert would leave those stale rows behind, so we
  //    do a wholesale replace per plan Appendix B (non-atomic but
  //    acceptable for the benchmark recompute cadence).
  if (upsertRows.length > 0) {
    const del = await supabase
      .from("shop_benchmarks")
      .delete()
      .eq("shop_id", shopId);
    if (del.error) throw del.error;
    const ins = await supabase.from("shop_benchmarks").insert(upsertRows);
    if (ins.error) throw ins.error;
  }

  return {
    updated: upsertRows.length,
    image: { sampleSize: imageEligible, isDefault: isImageDefault },
    video: { sampleSize: videoEligible, isDefault: isVideoDefault },
  };
}
