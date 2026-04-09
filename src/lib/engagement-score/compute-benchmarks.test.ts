import { describe, it, expect } from "vitest";
import {
  computeBenchmarks,
  percentile,
  type BenchmarkInput,
} from "./compute-benchmarks";

function makeInput(overrides: Partial<BenchmarkInput> = {}): BenchmarkInput {
  return {
    creativeType: "image",
    spend: 0,
    linkClicks: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    purchaseRevenue: 0,
    videoViews3s: 0,
    videoThruplay: 0,
    videoPlays: 0,
    videoAvgWatchTime: 0,
    cpa: 0,
    cpm: 0,
    ...overrides,
  };
}

describe("percentile", () => {
  it("P50 of [1..9] = 5", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 50)).toBe(5);
  });

  it("P0 = min, P100 = max", () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it("linear interpolation between values", () => {
    // P50 of [10, 20] = 15
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it("filters non-finite values", () => {
    expect(percentile([1, NaN, 2, Infinity, 3], 50)).toBe(2);
  });

  it("empty input returns NaN", () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe("computeBenchmarks", () => {
  const cpaTarget = 300;

  function make15Images(): BenchmarkInput[] {
    // Vary CTR so percentiles are meaningful (not all identical):
    //   impressions constant, linkClicks = 50 + 20*n  → CTR 0.7%..3.5%
    return Array.from({ length: 15 }, (_, i) => {
      const n = i + 1;
      const linkClicks = 50 + 20 * n;
      return makeInput({
        creativeType: "image",
        spend: 1000,
        impressions: 10_000,
        clicks: linkClicks + 10,
        linkClicks,
        purchases: n,
        purchaseRevenue: 5000 * n,
        cpa: 1000 / n,
        cpm: 100 + n,
      });
    });
  }

  it("returns null when sample size < 15", () => {
    const input = Array.from({ length: 14 }, () =>
      makeInput({ spend: 1000, linkClicks: 100, purchases: 5 })
    );
    const result = computeBenchmarks(input, "image", cpaTarget);
    expect(result).toBeNull();
  });

  it("computes percentiles for image format with 15+ eligible creatives", () => {
    const result = computeBenchmarks(make15Images(), "image", cpaTarget);
    expect(result).not.toBeNull();
    expect(result!.ctr_link).toBeDefined();
    expect(result!.cpa).toBeDefined();
  });

  it("CPA thresholds are inverted (top = lowest)", () => {
    const result = computeBenchmarks(make15Images(), "image", cpaTarget);
    expect(result!.cpa!.top).toBeLessThan(result!.cpa!.fail);
    expect(result!.cpa!.top).toBeLessThan(result!.cpa!.good);
  });

  it("CTR thresholds are non-inverted (top = highest)", () => {
    const result = computeBenchmarks(make15Images(), "image", cpaTarget);
    expect(result!.ctr_link!.top).toBeGreaterThan(result!.ctr_link!.fail);
  });

  it("filters out creatives that don't meet minimum spend/clicks", () => {
    const eligible = make15Images();
    const ineligible = Array.from({ length: 100 }, () =>
      makeInput({ spend: 10, linkClicks: 2, purchases: 0 })
    );
    const result = computeBenchmarks(
      [...eligible, ...ineligible],
      "image",
      cpaTarget
    );
    expect(result).not.toBeNull();
  });

  it("drops to null when < 15 eligible after filtering", () => {
    const input = Array.from({ length: 14 }, () =>
      makeInput({ spend: 1000, linkClicks: 100, purchases: 5 })
    );
    input.push(makeInput({ spend: 5, linkClicks: 2, purchases: 0 }));
    const result = computeBenchmarks(input, "image", cpaTarget);
    expect(result).toBeNull();
  });
});
