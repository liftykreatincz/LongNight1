import { describe, it, expect } from "vitest";
import { aggregateMetrics, groupIntoTree } from "./creative-aggregation";
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";

function makeCreative(overrides: Partial<CreativeRow> = {}): CreativeRow {
  return {
    adId: "ad1",
    adName: "Ad 1",
    campaignId: "c1",
    campaignName: "Campaign 1",
    adsetId: "as1",
    adsetName: "Ad Set 1",
    status: "ACTIVE",
    thumbnailUrl: null,
    creativeType: "image",
    videoUrl: null,
    body: null,
    dateStart: null,
    dateStop: null,
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    purchases: 0,
    costPerPurchase: 0,
    roas: 0,
    purchaseRevenue: 0,
    addToCart: 0,
    costPerAddToCart: 0,
    initiateCheckout: 0,
    linkClicks: 0,
    landingPageViews: 0,
    videoViews3s: 0,
    videoThruplay: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    syncedAt: "2026-04-09T00:00:00Z",
    aiAnalysis: null,
    ...overrides,
  };
}

describe("aggregateMetrics", () => {
  it("returns zeros for counters and null for ratios on empty input", () => {
    const m = aggregateMetrics([]);
    expect(m.spend).toBe(0);
    expect(m.impressions).toBe(0);
    expect(m.ctr).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.cpm).toBeNull();
    expect(m.roas).toBeNull();
    expect(m.costPerPurchase).toBeNull();
  });

  it("sums raw counters", () => {
    const m = aggregateMetrics([
      makeCreative({
        spend: 100,
        impressions: 1000,
        clicks: 50,
        purchases: 2,
        purchaseRevenue: 300,
      }),
      makeCreative({
        spend: 200,
        impressions: 4000,
        clicks: 150,
        purchases: 3,
        purchaseRevenue: 900,
      }),
    ]);
    expect(m.spend).toBe(300);
    expect(m.impressions).toBe(5000);
    expect(m.clicks).toBe(200);
    expect(m.purchases).toBe(5);
    expect(m.purchaseRevenue).toBe(1200);
  });

  it("computes CTR as weighted SUM(clicks)/SUM(impressions)*100", () => {
    // Ad A: 10 clicks / 1000 impr = 1% CTR
    // Ad B: 100 clicks / 1000 impr = 10% CTR
    // Simple average would be 5.5%, weighted is (110/2000)*100 = 5.5%
    // Let's use uneven weights to distinguish:
    // Ad A: 10 clicks / 10000 impr = 0.1% CTR
    // Ad B: 100 clicks / 1000 impr = 10% CTR
    // Simple avg: 5.05%. Weighted: 110/11000 * 100 = 1.0%
    const m = aggregateMetrics([
      makeCreative({ clicks: 10, impressions: 10000 }),
      makeCreative({ clicks: 100, impressions: 1000 }),
    ]);
    expect(m.ctr).toBeCloseTo(1.0, 5);
  });

  it("computes ROAS as SUM(revenue)/SUM(spend)", () => {
    const m = aggregateMetrics([
      makeCreative({ spend: 100, purchaseRevenue: 500 }),
      makeCreative({ spend: 400, purchaseRevenue: 1500 }),
    ]);
    // 2000 / 500 = 4.0x (simple avg of 5 and 3.75 would be 4.375)
    expect(m.roas).toBeCloseTo(4.0, 5);
  });

  it("computes CPA as SUM(spend)/SUM(purchases)", () => {
    const m = aggregateMetrics([
      makeCreative({ spend: 100, purchases: 1 }),
      makeCreative({ spend: 500, purchases: 9 }),
    ]);
    // 600 / 10 = 60
    expect(m.costPerPurchase).toBe(60);
  });

  it("returns null for ratios when denominator is zero (not misleading 0)", () => {
    const m = aggregateMetrics([
      makeCreative({ spend: 100, impressions: 0, clicks: 0, purchases: 0 }),
    ]);
    expect(m.ctr).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.cpm).toBeNull();
    expect(m.costPerPurchase).toBeNull();
    // ROAS: spend=100, revenue=0 → 0/100 = 0 (legitimate zero, not null)
    expect(m.roas).toBe(0);
  });
});

describe("groupIntoTree", () => {
  it("groups by campaign then ad set", () => {
    const creatives = [
      makeCreative({ adId: "1", campaignId: "c1", adsetId: "as1", spend: 50 }),
      makeCreative({ adId: "2", campaignId: "c1", adsetId: "as1", spend: 30 }),
      makeCreative({ adId: "3", campaignId: "c1", adsetId: "as2", spend: 100 }),
      makeCreative({ adId: "4", campaignId: "c2", adsetId: "as3", spend: 200 }),
    ];

    const tree = groupIntoTree(creatives);

    expect(tree).toHaveLength(2);
    // Sorted by spend desc → c2 (200) first, then c1 (180)
    expect(tree[0].campaignId).toBe("c2");
    expect(tree[0].metrics.spend).toBe(200);
    expect(tree[1].campaignId).toBe("c1");
    expect(tree[1].metrics.spend).toBe(180);

    // c1 should have 2 ad sets
    expect(tree[1].adsets).toHaveLength(2);
    // Sorted by spend desc → as2 (100) first, then as1 (80)
    expect(tree[1].adsets[0].adsetId).toBe("as2");
    expect(tree[1].adsets[0].metrics.spend).toBe(100);
    expect(tree[1].adsets[1].adsetId).toBe("as1");
    expect(tree[1].adsets[1].metrics.spend).toBe(80);

    // as1 has 2 ads, sorted by spend desc
    expect(tree[1].adsets[1].ads).toHaveLength(2);
    expect(tree[1].adsets[1].ads[0].creative.adId).toBe("1");
    expect(tree[1].adsets[1].ads[1].creative.adId).toBe("2");
  });

  it("buckets creatives with missing campaign/adset ids into synthetic groups", () => {
    const creatives = [
      makeCreative({ adId: "1", campaignId: "", adsetId: "", spend: 10 }),
      makeCreative({ adId: "2", campaignId: "c1", adsetId: "", spend: 20 }),
    ];

    const tree = groupIntoTree(creatives);

    expect(tree).toHaveLength(2);
    const names = tree.map((t) => t.campaignName).sort();
    expect(names).toContain("(bez kampaně)");

    const c1 = tree.find((t) => t.campaignId === "c1");
    expect(c1).toBeDefined();
    expect(c1!.adsets[0].adsetName).toBe("(bez ad setu)");
  });

  it("handles empty input", () => {
    expect(groupIntoTree([])).toEqual([]);
  });

  it("campaign metrics equal sum of child ad set metrics", () => {
    const creatives = [
      makeCreative({
        adId: "1",
        campaignId: "c1",
        adsetId: "as1",
        spend: 100,
        impressions: 1000,
        clicks: 50,
        purchases: 2,
        purchaseRevenue: 300,
      }),
      makeCreative({
        adId: "2",
        campaignId: "c1",
        adsetId: "as2",
        spend: 200,
        impressions: 4000,
        clicks: 100,
        purchases: 4,
        purchaseRevenue: 800,
      }),
    ];

    const [c1] = groupIntoTree(creatives);
    expect(c1.metrics.spend).toBe(300);
    expect(c1.metrics.impressions).toBe(5000);
    expect(c1.metrics.clicks).toBe(150);
    expect(c1.metrics.purchases).toBe(6);
    expect(c1.metrics.purchaseRevenue).toBe(1100);
    // Weighted CTR = 150/5000 * 100 = 3%
    expect(c1.metrics.ctr).toBeCloseTo(3, 5);
    // ROAS = 1100/300 ≈ 3.6667
    expect(c1.metrics.roas).toBeCloseTo(3.6667, 3);
  });
});
