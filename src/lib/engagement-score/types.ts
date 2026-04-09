export type Format = "image" | "video";

export type MetricKey =
  | "ctr_link"
  | "ctr_all"
  | "hook_rate"
  | "thumb_stop"
  | "avg_watch_pct"
  | "thruplay_rate"
  | "hold_rate"
  | "cpa"
  | "pno"
  | "cpm"
  | "cvr"
  | "konv_per_1k";

export interface Thresholds {
  fail: number;
  hranice: number;
  good: number;
  top: number;
}

export type MetricThresholds = Partial<Record<MetricKey, Thresholds>>;

export type Benchmarks = Record<Format, MetricThresholds>;

export interface CategoryScores {
  attention: number | null;
  retention: number | null; // null for image (category unused)
  efficiency: number | null;
  performance: number | null;
}

export type ActionLabel =
  | "excellent" // 81-100
  | "good" // 61-80
  | "average" // 31-60
  | "weak" // 0-30
  | "insufficient_data";

export type FilterReason = "low_spend" | "low_clicks" | null;

export interface EngagementResult {
  engagementScore: number | null; // null ⇔ actionLabel === 'insufficient_data'
  categories: CategoryScores;
  actionLabel: ActionLabel;
  filterReason: FilterReason;
  format: Format;
}

/** Metrics for which a LOWER value is better (CPA, PNO, CPM). */
export const INVERTED_METRICS: ReadonlySet<MetricKey> = new Set([
  "cpa",
  "pno",
  "cpm",
]);
