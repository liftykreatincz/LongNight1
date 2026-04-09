import type { CampaignType } from "@/lib/campaign-classifier";
import type { Format, MetricKey, Thresholds } from "./types";
import { INVERTED_METRICS } from "./types";
import { hasEnoughData } from "./filter";

/** Input row for benchmark computation — structural subset of CreativeRow. */
export interface BenchmarkInput {
  creativeType: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  purchaseRevenue: number;
  videoViews3s: number;
  videoThruplay: number;
  videoPlays: number;
  videoAvgWatchTime: number;
  videoDurationSeconds?: number | null;
  cpa: number;
  cpm: number;
  /** Campaign segmentation — "unknown" | "evergreen" | "sale" | "seasonal". */
  campaignType?: CampaignType;
}

/**
 * One benchmark row emitted by `computeBenchmarks`, ready to be written to
 * the `shop_benchmarks` table (missing only shop_id + computed_at).
 */
export interface BenchmarkOutputRow {
  format: Format;
  campaign_type: CampaignType | "all";
  metric: MetricKey;
  fail: number;
  hranice: number;
  good: number;
  top: number;
  sample_size: number;
  is_default: boolean;
}

const SEGMENTS: Array<CampaignType | "all"> = [
  "all",
  "evergreen",
  "sale",
  "seasonal",
];

export const MIN_SAMPLE_SIZE = 15;

/**
 * Linear-interpolation percentile (type 7 / Excel default).
 * Matches metodika expectations for threshold derivation.
 */
export function percentile(values: number[], p: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function derivedValue(row: BenchmarkInput, metric: MetricKey): number {
  switch (metric) {
    case "ctr_link":
      return row.impressions > 0
        ? (row.linkClicks / row.impressions) * 100
        : NaN;
    case "ctr_all":
      return row.impressions > 0
        ? (row.clicks / row.impressions) * 100
        : NaN;
    case "hook_rate":
      return row.videoPlays > 0
        ? (row.videoViews3s / row.videoPlays) * 100
        : NaN;
    case "thumb_stop":
      return row.impressions > 0
        ? (row.videoPlays / row.impressions) * 100
        : NaN;
    case "avg_watch_pct": {
      if (row.videoAvgWatchTime <= 0) return NaN;
      const dur = row.videoDurationSeconds;
      if (dur != null && dur > 0) {
        return (row.videoAvgWatchTime / dur) * 100;
      }
      // Phase 1 proxy fallback: assume 15s average video length
      return (row.videoAvgWatchTime / 15) * 100;
    }
    case "thruplay_rate":
      return row.impressions > 0 && row.videoPlays > 0
        ? (row.videoThruplay / row.impressions) * 100
        : NaN;
    case "hold_rate":
      return row.videoViews3s > 0
        ? (row.videoThruplay / row.videoViews3s) * 100
        : NaN;
    case "cpa":
      return row.cpa > 0 ? row.cpa : NaN;
    case "pno":
      return row.purchaseRevenue > 0
        ? (row.spend / row.purchaseRevenue) * 100
        : NaN;
    case "cpm":
      return row.cpm > 0 ? row.cpm : NaN;
    case "cvr":
      return row.linkClicks > 0
        ? (row.purchases / row.linkClicks) * 100
        : NaN;
    case "konv_per_1k":
      return row.impressions > 0
        ? (row.purchases / row.impressions) * 1000
        : NaN;
  }
}

/** Which metrics are relevant for a given format. */
const METRICS_PER_FORMAT: Record<Format, MetricKey[]> = {
  image: ["ctr_link", "ctr_all", "cpa", "pno", "cpm", "cvr", "konv_per_1k"],
  video: [
    "ctr_link",
    "hook_rate",
    "thumb_stop",
    "avg_watch_pct",
    "thruplay_rate",
    "hold_rate",
    "cpa",
    "pno",
    "cpm",
    "cvr",
    "konv_per_1k",
  ],
};

function formatOf(row: BenchmarkInput): Format {
  return row.creativeType === "video" ? "video" : "image";
}

function percentilesForMetric(
  values: number[],
  metric: MetricKey
): Thresholds {
  const inverted = INVERTED_METRICS.has(metric);
  if (inverted) {
    return {
      top: percentile(values, 10),
      good: percentile(values, 25),
      hranice: percentile(values, 60),
      fail: percentile(values, 75),
    };
  }
  return {
    fail: percentile(values, 25),
    hranice: percentile(values, 40),
    good: percentile(values, 75),
    top: percentile(values, 90),
  };
}

function buildSegmentRows(
  eligible: BenchmarkInput[],
  format: Format,
  segment: CampaignType | "all"
): BenchmarkOutputRow[] {
  const out: BenchmarkOutputRow[] = [];
  for (const metric of METRICS_PER_FORMAT[format]) {
    const values = eligible
      .map((r) => derivedValue(r, metric))
      .filter(Number.isFinite) as number[];

    if (values.length < MIN_SAMPLE_SIZE) continue;
    const t = percentilesForMetric(values, metric);
    out.push({
      format,
      campaign_type: segment,
      metric,
      fail: t.fail,
      hranice: t.hranice,
      good: t.good,
      top: t.top,
      sample_size: eligible.length,
      is_default: false,
    });
  }
  return out;
}

/**
 * Compute per-shop benchmark rows segmented by `(format × campaign_type)`.
 *
 * For each format it always emits an `all` segment (even if the eligible
 * sample is under 15 — downstream `resolveBenchmarks` will fall through to
 * the agency defaults when that happens). For each specific segment
 * (`evergreen`, `sale`, `seasonal`) it only emits rows when the eligible
 * filtered sample is ≥ 15.
 *
 * The return shape is an array of flat rows, ready to be written to the
 * `shop_benchmarks` table (caller attaches shop_id + computed_at).
 */
export function computeBenchmarks(
  rows: BenchmarkInput[],
  cpaTarget = 300
): BenchmarkOutputRow[] {
  const output: BenchmarkOutputRow[] = [];
  const formatEligible: Record<Format, BenchmarkInput[]> = {
    image: [],
    video: [],
  };

  for (const r of rows) {
    if (
      !hasEnoughData(
        { spend: r.spend, linkClicks: r.linkClicks, purchases: r.purchases },
        cpaTarget
      ).ok
    ) {
      continue;
    }
    formatEligible[formatOf(r)].push(r);
  }

  for (const format of ["image", "video"] as const) {
    const eligible = formatEligible[format];
    for (const segment of SEGMENTS) {
      const segmentRows =
        segment === "all"
          ? eligible
          : eligible.filter((r) => (r.campaignType ?? "unknown") === segment);

      // `all` is always emitted (even if empty/small) so downstream
      // resolution chain has a terminal fallback key; specific segments
      // below MIN_SAMPLE_SIZE are skipped.
      if (segment !== "all" && segmentRows.length < MIN_SAMPLE_SIZE) continue;
      if (segment === "all" && segmentRows.length === 0) continue;

      output.push(...buildSegmentRows(segmentRows, format, segment));
    }
  }

  return output;
}
