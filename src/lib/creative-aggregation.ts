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
export interface AggregatedMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  purchases: number;
  purchaseRevenue: number;
  addToCart: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  costPerPurchase: number;
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

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const roas = spend > 0 ? purchaseRevenue / spend : 0;
  const costPerPurchase = purchases > 0 ? spend / purchases : 0;

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
