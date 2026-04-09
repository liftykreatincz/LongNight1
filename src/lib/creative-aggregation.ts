import type { CreativeRow } from "@/hooks/useCreativeAnalysis";

/**
 * Aggregated metrics for a group of creatives (e.g. a campaign or ad set).
 *
 * Ratio metrics (ctr, cpc, cpm, roas, costPerPurchase) are computed as
 * WEIGHTED AVERAGES — summing the underlying numerators and denominators
 * rather than averaging per-ad ratios. This matches how Meta Ads Manager
 * displays aggregate numbers and is the mathematically correct way to
 * combine these metrics.
 *
 *   CTR  = SUM(clicks)      / SUM(impressions)  * 100
 *   CPC  = SUM(spend)       / SUM(clicks)
 *   CPM  = SUM(spend)       / SUM(impressions)  * 1000
 *   CPA  = SUM(spend)       / SUM(purchases)
 *   ROAS = SUM(revenue)     / SUM(spend)
 */
/**
 * Ratio fields are `number | null`. `null` means "undefined for this group"
 * (e.g. CTR has no meaning when impressions=0), which the UI renders as "—"
 * rather than a misleading `0.00%`. Raw counter fields are always numbers.
 */
export interface AggregatedMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseRevenue: number;
  addToCart: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  costPerPurchase: number | null;
}

function safeDiv(num: number, denom: number): number | null {
  return denom > 0 ? num / denom : null;
}

export interface AdNode {
  kind: "ad";
  creative: CreativeRow;
}

export interface AdSetNode {
  kind: "adset";
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  metrics: AggregatedMetrics;
  ads: AdNode[];
}

export interface CampaignNode {
  kind: "campaign";
  campaignId: string;
  campaignName: string;
  metrics: AggregatedMetrics;
  adsets: AdSetNode[];
}

export function aggregateMetrics(creatives: CreativeRow[]): AggregatedMetrics {
  let spend = 0;
  let impressions = 0;
  let reach = 0;
  let clicks = 0;
  let purchases = 0;
  let purchaseRevenue = 0;
  let addToCart = 0;

  for (const c of creatives) {
    spend += Number(c.spend) || 0;
    impressions += Number(c.impressions) || 0;
    reach += Number(c.reach) || 0;
    clicks += Number(c.clicks) || 0;
    purchases += Number(c.purchases) || 0;
    purchaseRevenue += Number(c.purchaseRevenue) || 0;
    addToCart += Number(c.addToCart) || 0;
  }

  const ctrRatio = safeDiv(clicks, impressions);
  const ctr = ctrRatio === null ? null : ctrRatio * 100;
  const cpc = safeDiv(spend, clicks);
  const cpmRatio = safeDiv(spend, impressions);
  const cpm = cpmRatio === null ? null : cpmRatio * 1000;
  const roas = safeDiv(purchaseRevenue, spend);
  const costPerPurchase = safeDiv(spend, purchases);

  return {
    spend,
    impressions,
    reach,
    clicks,
    purchases,
    purchaseRevenue,
    addToCart,
    ctr,
    cpc,
    cpm,
    roas,
    costPerPurchase,
  };
}

/**
 * Group a flat list of creatives into a Campaign → Ad Set → Ad tree.
 *
 * Creatives missing a campaign_id/adset_id are bucketed into synthetic
 * "(bez kampaně)" / "(bez ad setu)" groups so that nothing is silently
 * dropped from the UI.
 *
 * Sorting: campaigns by spend desc, ad sets by spend desc within a campaign,
 * ads by spend desc within an ad set. Matches flat view ordering.
 */
export function groupIntoTree(creatives: CreativeRow[]): CampaignNode[] {
  const campaignMap = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      adsets: Map<
        string,
        {
          adsetId: string;
          adsetName: string;
          creatives: CreativeRow[];
        }
      >;
    }
  >();

  for (const c of creatives) {
    const campaignId = c.campaignId || "__no_campaign__";
    const campaignName = c.campaignId ? c.campaignName || "(bez názvu)" : "(bez kampaně)";
    const adsetId = c.adsetId || "__no_adset__";
    const adsetName = c.adsetId ? c.adsetName || "(bez názvu)" : "(bez ad setu)";

    let campaign = campaignMap.get(campaignId);
    if (!campaign) {
      campaign = {
        campaignId,
        campaignName,
        adsets: new Map(),
      };
      campaignMap.set(campaignId, campaign);
    }

    let adset = campaign.adsets.get(adsetId);
    if (!adset) {
      adset = { adsetId, adsetName, creatives: [] };
      campaign.adsets.set(adsetId, adset);
    }

    adset.creatives.push(c);
  }

  const campaigns: CampaignNode[] = [];
  for (const campaign of campaignMap.values()) {
    const adsets: AdSetNode[] = [];
    for (const adset of campaign.adsets.values()) {
      const sortedAds = [...adset.creatives].sort(
        (a, b) => (Number(b.spend) || 0) - (Number(a.spend) || 0)
      );
      adsets.push({
        kind: "adset",
        adsetId: adset.adsetId,
        adsetName: adset.adsetName,
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        metrics: aggregateMetrics(adset.creatives),
        ads: sortedAds.map((creative) => ({ kind: "ad", creative })),
      });
    }

    adsets.sort((a, b) => b.metrics.spend - a.metrics.spend);

    campaigns.push({
      kind: "campaign",
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      metrics: aggregateMetrics(
        Array.from(campaign.adsets.values()).flatMap((a) => a.creatives)
      ),
      adsets,
    });
  }

  campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);
  return campaigns;
}
