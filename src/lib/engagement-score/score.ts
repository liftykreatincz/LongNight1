import type { CampaignType } from "@/lib/campaign-classifier";
import type {
  Benchmarks,
  CategoryScores,
  EngagementResult,
  Format,
  MetricKey,
} from "./types";
import { INVERTED_METRICS } from "./types";
import { normalize } from "./normalize";
import { hasEnoughData } from "./filter";
import { actionLabelFromScore } from "./action";

export interface ScoreInput {
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
  campaignType: CampaignType;
  videoDurationSeconds: number | null;
}

function formatOf(row: ScoreInput): Format {
  return row.creativeType === "video" ? "video" : "image";
}

function derivedValue(row: ScoreInput, metric: MetricKey): number {
  switch (metric) {
    case "ctr_link":
      return row.impressions > 0
        ? (row.linkClicks / row.impressions) * 100
        : NaN;
    case "ctr_all":
      return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : NaN;
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
      // Guard on videoPlays > 0: if the video was never played, thruplay
      // rate is not a meaningful signal (returns NaN → category skipped).
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

function categoryAverage(
  row: ScoreInput,
  benchmarks: Benchmarks,
  format: Format,
  metrics: MetricKey[]
): number | null {
  const scores: number[] = [];
  for (const metric of metrics) {
    const value = derivedValue(row, metric);
    if (!Number.isFinite(value)) continue;
    const thresholds = benchmarks[format][metric];
    if (!thresholds) continue;
    scores.push(normalize(value, thresholds, INVERTED_METRICS.has(metric)));
  }
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

const IMAGE_CATEGORIES: Record<
  "attention" | "efficiency" | "performance",
  MetricKey[]
> = {
  attention: ["ctr_link", "ctr_all"],
  efficiency: ["cpa", "pno", "cpm"],
  performance: ["cvr", "konv_per_1k"],
};

const VIDEO_CATEGORIES: Record<
  "attention" | "retention" | "efficiency" | "performance",
  MetricKey[]
> = {
  attention: ["ctr_link", "hook_rate", "thumb_stop"],
  retention: ["avg_watch_pct", "thruplay_rate", "hold_rate"],
  efficiency: ["cpa", "pno", "cpm"],
  performance: ["cvr", "konv_per_1k"],
};

/** Weights from metodika section 7. */
const IMAGE_WEIGHTS = { attention: 0.3, efficiency: 0.3, performance: 0.4 };
const VIDEO_WEIGHTS = {
  attention: 0.25,
  retention: 0.2,
  efficiency: 0.2,
  performance: 0.35,
};

function weightedScore(
  categories: CategoryScores,
  format: Format
): number | null {
  if (format === "image") {
    const entries: Array<[number | null, number]> = [
      [categories.attention, IMAGE_WEIGHTS.attention],
      [categories.efficiency, IMAGE_WEIGHTS.efficiency],
      [categories.performance, IMAGE_WEIGHTS.performance],
    ];
    return weightedAverage(entries);
  }
  const entries: Array<[number | null, number]> = [
    [categories.attention, VIDEO_WEIGHTS.attention],
    [categories.retention, VIDEO_WEIGHTS.retention],
    [categories.efficiency, VIDEO_WEIGHTS.efficiency],
    [categories.performance, VIDEO_WEIGHTS.performance],
  ];
  return weightedAverage(entries);
}

/** Renormalizes weights to skip null categories. */
function weightedAverage(
  entries: Array<[number | null, number]>
): number | null {
  let sum = 0;
  let totalWeight = 0;
  for (const [score, weight] of entries) {
    if (score === null) continue;
    sum += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return sum / totalWeight;
}

export function scoreCreative(
  row: ScoreInput,
  benchmarks: Benchmarks,
  cpaTarget: number
): EngagementResult {
  const format = formatOf(row);
  const filter = hasEnoughData(
    { spend: row.spend, linkClicks: row.linkClicks, purchases: row.purchases },
    cpaTarget
  );

  if (!filter.ok) {
    return {
      engagementScore: null,
      categories: {
        attention: null,
        retention: null,
        efficiency: null,
        performance: null,
      },
      actionLabel: "insufficient_data",
      filterReason: filter.reason,
      format,
    };
  }

  const cats: CategoryScores =
    format === "image"
      ? {
          attention: categoryAverage(
            row,
            benchmarks,
            format,
            IMAGE_CATEGORIES.attention
          ),
          retention: null,
          efficiency: categoryAverage(
            row,
            benchmarks,
            format,
            IMAGE_CATEGORIES.efficiency
          ),
          performance: categoryAverage(
            row,
            benchmarks,
            format,
            IMAGE_CATEGORIES.performance
          ),
        }
      : {
          attention: categoryAverage(
            row,
            benchmarks,
            format,
            VIDEO_CATEGORIES.attention
          ),
          retention: categoryAverage(
            row,
            benchmarks,
            format,
            VIDEO_CATEGORIES.retention
          ),
          efficiency: categoryAverage(
            row,
            benchmarks,
            format,
            VIDEO_CATEGORIES.efficiency
          ),
          performance: categoryAverage(
            row,
            benchmarks,
            format,
            VIDEO_CATEGORIES.performance
          ),
        };

  const rawScore = weightedScore(cats, format);
  const engagementScore =
    rawScore === null ? null : Math.round(rawScore * 10) / 10;

  return {
    engagementScore,
    categories: cats,
    actionLabel: actionLabelFromScore(engagementScore),
    filterReason: null,
    format,
  };
}
