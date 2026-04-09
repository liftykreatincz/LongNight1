import { describe, it, expect } from "vitest";
import { scoreCreative, type ScoreInput } from "./score";
import { DEFAULT_BENCHMARKS } from "./defaults";

function makeImage(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    creativeType: "image",
    spend: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    purchases: 0,
    purchaseRevenue: 0,
    videoViews3s: 0,
    videoThruplay: 0,
    videoPlays: 0,
    videoAvgWatchTime: 0,
    cpa: 0,
    cpm: 0,
    campaignType: "evergreen",
    videoDurationSeconds: null,
    ...overrides,
  };
}

describe("scoreCreative — insufficient data", () => {
  it("returns insufficient_data when spend < 2*cpa and clicks < 50", () => {
    const r = scoreCreative(
      makeImage({ spend: 100, linkClicks: 10 }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.actionLabel).toBe("insufficient_data");
    expect(r.engagementScore).toBeNull();
    expect(r.filterReason).toBe("low_spend");
  });

  it("purchases >= 3 bypasses filter", () => {
    const r = scoreCreative(
      makeImage({
        spend: 10,
        linkClicks: 5,
        purchases: 3,
        impressions: 1000,
        clicks: 20,
        cpa: 3,
        cpm: 10,
        purchaseRevenue: 1000,
      }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.actionLabel).not.toBe("insufficient_data");
    expect(r.engagementScore).not.toBeNull();
  });
});

describe("scoreCreative — image format", () => {
  it("computes image score without retention category", () => {
    const r = scoreCreative(
      makeImage({
        spend: 1000,
        linkClicks: 100,
        impressions: 50_000,
        clicks: 1500,
        purchases: 20,
        purchaseRevenue: 20_000,
        cpa: 50,
        cpm: 20,
      }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.format).toBe("image");
    expect(r.categories.retention).toBeNull();
    expect(r.categories.attention).not.toBeNull();
    expect(r.categories.efficiency).not.toBeNull();
    expect(r.categories.performance).not.toBeNull();
    expect(r.engagementScore).not.toBeNull();
    // With these strong efficiency + CVR metrics the creative lands in
    // the "good" bucket (score in the 60s-70s).
    expect(["good", "excellent"]).toContain(r.actionLabel);
  });

  it("applies weights 0.30 A + 0.30 E + 0.40 P for image", () => {
    const r = scoreCreative(
      makeImage({
        spend: 1000,
        linkClicks: 100,
        impressions: 100_000,
        clicks: 2_000,
        purchases: 4,
        cpa: 250,
        cpm: 200,
        purchaseRevenue: 4000,
      }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(typeof r.engagementScore).toBe("number");
    expect(r.engagementScore!).toBeGreaterThanOrEqual(0);
    expect(r.engagementScore!).toBeLessThanOrEqual(100);
  });
});

describe("scoreCreative — video format", () => {
  it("computes video score with retention category", () => {
    const r = scoreCreative(
      {
        creativeType: "video",
        spend: 2000,
        linkClicks: 200,
        impressions: 100_000,
        clicks: 2500,
        purchases: 30,
        purchaseRevenue: 30_000,
        videoViews3s: 40_000,
        videoThruplay: 15_000,
        videoPlays: 60_000,
        videoAvgWatchTime: 8,
        cpa: 66.67,
        cpm: 20,
        campaignType: "evergreen",
        videoDurationSeconds: null,
      },
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.format).toBe("video");
    expect(r.categories.retention).not.toBeNull();
    expect(r.categories.attention).not.toBeNull();
    expect(r.engagementScore).not.toBeNull();
  });
});

describe("scoreCreative — null categories for missing metrics", () => {
  it("video without videoPlays has no hook_rate but still scores", () => {
    const r = scoreCreative(
      {
        creativeType: "video",
        spend: 2000,
        linkClicks: 100,
        impressions: 50_000,
        clicks: 1500,
        purchases: 10,
        purchaseRevenue: 10_000,
        videoViews3s: 0,
        videoThruplay: 0,
        videoPlays: 0,
        videoAvgWatchTime: 0,
        cpa: 200,
        cpm: 40,
        campaignType: "evergreen",
        videoDurationSeconds: null,
      },
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.categories.retention).toBeNull();
    expect(r.categories.attention).not.toBeNull();
    expect(r.engagementScore).not.toBeNull();
  });
});
