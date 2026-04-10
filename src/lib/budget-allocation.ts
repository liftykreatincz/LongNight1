import type { CreativeRow } from "@/hooks/useCreativeAnalysis";

export type Recommendation = "navysit" | "udrzet" | "snizit" | "vypnout";

export interface BudgetRow {
  adId: string;
  adName: string;
  thumbnailUrl: string | null;
  spend: number;
  roas: number;
  engagementScore: number;
  fatigueScore: number | null;
  fatigueSignal: CreativeRow["fatigueSignal"];
  purchases: number;
  budgetShare: number;
  recommendation: Recommendation;
  opportunityScore: number;
}

export function computeBudgetRows(creatives: CreativeRow[]): BudgetRow[] {
  const withSpend = creatives.filter((c) => c.spend > 0);
  if (withSpend.length === 0) return [];

  const totalSpend = withSpend.reduce((s, c) => s + c.spend, 0);
  const avgRoas =
    withSpend.reduce((s, c) => s + c.roas, 0) / withSpend.length;

  return withSpend.map((c) => {
    const budgetShare = totalSpend > 0 ? c.spend / totalSpend : 0;
    const fatigue = c.fatigueScore ?? 0;
    const engagement = c.aiAnalysis?.score ?? 50;
    const recommendation = getRecommendation(c.roas, avgRoas, fatigue, engagement, c.fatigueSignal);
    const opportunityScore = computeOpportunityScore(c.roas, avgRoas, fatigue, budgetShare);

    return {
      adId: c.adId,
      adName: c.adName,
      thumbnailUrl: c.thumbnailUrl,
      spend: c.spend,
      roas: c.roas,
      engagementScore: engagement,
      fatigueScore: c.fatigueScore,
      fatigueSignal: c.fatigueSignal,
      purchases: c.purchases,
      budgetShare,
      recommendation,
      opportunityScore,
    };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function getRecommendation(
  roas: number,
  avgRoas: number,
  fatigue: number,
  engagement: number,
  fatigueSignal: CreativeRow["fatigueSignal"],
): Recommendation {
  // Vypnout — very low ROAS or critical fatigue with below-average ROAS
  if (roas < 0.5 || (fatigueSignal === "critical" && roas < avgRoas)) {
    return "vypnout";
  }
  // Navysit — high ROAS, low fatigue, good engagement
  if (roas > avgRoas * 2 && fatigue < 50 && engagement > 60) {
    return "navysit";
  }
  // Snizit — below average ROAS or high fatigue
  if (roas < avgRoas || fatigue > 75) {
    return "snizit";
  }
  // Udrzet — everything else
  return "udrzet";
}

function computeOpportunityScore(
  roas: number,
  avgRoas: number,
  fatigue: number,
  budgetShare: number,
): number {
  // High ROAS + low fatigue + low budget share = high opportunity
  const roasFactor = avgRoas > 0 ? Math.min(roas / avgRoas, 5) : 1;
  const fatigueFactor = 1 - fatigue / 100;
  const budgetFactor = 1 - Math.min(budgetShare, 1);
  return roasFactor * fatigueFactor * budgetFactor * 100;
}
