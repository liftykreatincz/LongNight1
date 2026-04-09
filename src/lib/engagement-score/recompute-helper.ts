import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBenchmarks, type BenchmarkInput } from "./compute-benchmarks";
import { DEFAULT_BENCHMARKS } from "./defaults";
import type { Format, MetricKey, MetricThresholds } from "./types";

export interface RecomputeResult {
  updated: number;
  image: { sampleSize: number; isDefault: boolean };
  video: { sampleSize: number; isDefault: boolean };
}

interface BenchmarkRow {
  shop_id: string;
  format: Format;
  campaign_type: "all";
  metric: MetricKey;
  fail: number;
  hranice: number;
  good: number;
  top: number;
  sample_size: number;
  is_default: boolean;
  computed_at: string;
}

/**
 * Recompute frozen benchmarks for a shop and upsert them into
 * `shop_benchmarks`. Uses rolling 30-day window, falls back to all-time
 * if the window is empty, and to agency defaults when sample size < 15.
 */
export async function recomputeBenchmarksForShop(
  supabase: SupabaseClient,
  shopId: string
): Promise<RecomputeResult> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Try rolling window
  let { data: rows } = await supabase
    .from("meta_ad_creatives")
    .select(
      "creative_type, spend, impressions, clicks, link_clicks, purchases, purchase_revenue, video_views_3s, video_thruplay, video_plays, video_avg_watch_time, cost_per_purchase, cpm, date_stop"
    )
    .eq("shop_id", shopId)
    .gte("date_stop", thirtyDaysAgo);

  // Fallback: all-time (select same columns so TS inference matches)
  if (!rows || rows.length === 0) {
    const allTime = await supabase
      .from("meta_ad_creatives")
      .select(
        "creative_type, spend, impressions, clicks, link_clicks, purchases, purchase_revenue, video_views_3s, video_thruplay, video_plays, video_avg_watch_time, cost_per_purchase, cpm, date_stop"
      )
      .eq("shop_id", shopId);
    rows = allTime.data ?? [];
  }

  // 2. Get CPA target
  const { data: shopRow } = await supabase
    .from("shops")
    .select("cpa_target_czk")
    .eq("id", shopId)
    .maybeSingle();

  const cpaTarget = Number(shopRow?.cpa_target_czk) || 300;

  // 3. Map to BenchmarkInput
  const inputs: BenchmarkInput[] = (rows ?? []).map((r) => ({
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
    cpa: Number(r.cost_per_purchase) || 0,
    cpm: Number(r.cpm) || 0,
  }));

  // 4. Compute per format, fall back to defaults
  const imageResult = computeBenchmarks(inputs, "image", cpaTarget);
  const videoResult = computeBenchmarks(inputs, "video", cpaTarget);

  const imageEligible = inputs.filter(
    (r) => r.creativeType !== "video"
  ).length;
  const videoEligible = inputs.filter((r) => r.creativeType === "video").length;

  const imageThresholds: MetricThresholds =
    imageResult ?? DEFAULT_BENCHMARKS.image;
  const videoThresholds: MetricThresholds =
    videoResult ?? DEFAULT_BENCHMARKS.video;

  const isImageDefault = imageResult === null;
  const isVideoDefault = videoResult === null;

  // 5. Build upsert rows
  const now = new Date().toISOString();
  const upsertRows: BenchmarkRow[] = [];

  for (const [metric, t] of Object.entries(imageThresholds) as Array<
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
      is_default: isImageDefault,
      computed_at: now,
    });
  }
  for (const [metric, t] of Object.entries(videoThresholds) as Array<
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
      is_default: isVideoDefault,
      computed_at: now,
    });
  }

  // 6. Upsert (unique on shop_id, format, campaign_type, metric)
  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("shop_benchmarks")
      .upsert(upsertRows, {
        onConflict: "shop_id,format,campaign_type,metric",
      });
    if (error) throw error;
  }

  return {
    updated: upsertRows.length,
    image: { sampleSize: imageEligible, isDefault: isImageDefault },
    video: { sampleSize: videoEligible, isDefault: isVideoDefault },
  };
}
