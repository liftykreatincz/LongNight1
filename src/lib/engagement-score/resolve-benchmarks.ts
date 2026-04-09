import type { CampaignType } from "@/lib/campaign-classifier";
import type { BenchmarkSet, CreativeFormat } from "./types";
import { DEFAULT_AGENCY_BENCHMARKS } from "./defaults";

export interface ResolvedBenchmarks {
  set: BenchmarkSet;
  usedFallback: boolean;
  fallbackReason: string | null;
  effectiveCampaignType: CampaignType | "all";
}

const MIN_SAMPLE_SIZE = 15;

/**
 * Picks the best benchmark set from the provided Map keyed by
 * `${format}:${campaign_type}`, with the fallback chain:
 *
 *   primary segment (sample_size >= 15)
 *     → `${format}:all`
 *     → DEFAULT_AGENCY_BENCHMARKS[format]
 *
 * Returns metadata describing whether a fallback was used and why, so the
 * UI can surface a "not enough data in this segment" explanation.
 */
export function resolveBenchmarks(
  benchmarks: Map<string, BenchmarkSet>,
  format: CreativeFormat,
  campaignType: CampaignType
): ResolvedBenchmarks {
  const primaryKey = `${format}:${campaignType}`;
  const primary = benchmarks.get(primaryKey);
  if (
    primary &&
    primary.sample_size >= MIN_SAMPLE_SIZE &&
    campaignType !== "unknown"
  ) {
    return {
      set: primary,
      usedFallback: false,
      fallbackReason: null,
      effectiveCampaignType: campaignType,
    };
  }

  const fallback = benchmarks.get(`${format}:all`);
  if (fallback) {
    const reason =
      campaignType === "unknown"
        ? "Kampaň není klasifikovaná"
        : `Málo dat v segmentu ${campaignType} (n=${primary?.sample_size ?? 0})`;
    return {
      set: fallback,
      usedFallback: true,
      fallbackReason: reason,
      effectiveCampaignType: "all",
    };
  }

  return {
    set: DEFAULT_AGENCY_BENCHMARKS[format],
    usedFallback: true,
    fallbackReason: "Výchozí agenturní benchmark",
    effectiveCampaignType: "all",
  };
}
