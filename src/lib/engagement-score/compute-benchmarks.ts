import type { Format, MetricThresholds, MetricKey } from "./types";
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
  cpa: number;
  cpm: number;
}

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
    case "avg_watch_pct":
      // Phase 1 proxy: assume 15s average video length
      return row.videoAvgWatchTime > 0
        ? (row.videoAvgWatchTime / 15) * 100
        : NaN;
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

/**
 * Compute per-shop benchmark thresholds for a given format from a list of
 * raw creatives. Returns null if fewer than MIN_SAMPLE_SIZE eligible
 * creatives remain after filtering — caller should fall back to defaults.
 */
export function computeBenchmarks(
  rows: BenchmarkInput[],
  format: Format,
  cpaTarget: number
): MetricThresholds | null {
  const eligible = rows.filter(
    (r) =>
      formatOf(r) === format &&
      hasEnoughData(
        { spend: r.spend, linkClicks: r.linkClicks, purchases: r.purchases },
        cpaTarget
      ).ok
  );

  if (eligible.length < MIN_SAMPLE_SIZE) return null;

  const thresholds: MetricThresholds = {};

  for (const metric of METRICS_PER_FORMAT[format]) {
    const values = eligible
      .map((r) => derivedValue(r, metric))
      .filter(Number.isFinite) as number[];

    if (values.length < MIN_SAMPLE_SIZE) continue;

    const inverted = INVERTED_METRICS.has(metric);
    if (inverted) {
      thresholds[metric] = {
        top: percentile(values, 10),
        good: percentile(values, 25),
        hranice: percentile(values, 60),
        fail: percentile(values, 75),
      };
    } else {
      thresholds[metric] = {
        fail: percentile(values, 25),
        hranice: percentile(values, 40),
        good: percentile(values, 75),
        top: percentile(values, 90),
      };
    }
  }

  return thresholds;
}
