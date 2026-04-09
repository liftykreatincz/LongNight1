import type { CreativeRow } from "@/hooks/useCreativeAnalysis";
import type { ScoreInput } from "./score";

export function creativeRowToScoreInput(row: CreativeRow): ScoreInput {
  return {
    creativeType: row.creativeType,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    purchases: row.purchases,
    purchaseRevenue: row.purchaseRevenue,
    videoViews3s: row.videoViews3s,
    videoThruplay: row.videoThruplay,
    videoPlays: row.videoPlays,
    videoAvgWatchTime: row.videoAvgWatchTime,
    cpa: row.costPerPurchase,
    cpm: row.cpm,
  };
}
