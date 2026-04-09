import { describe, it, expect } from "vitest";
import {
  computeBenchmarks,
  percentile,
  type BenchmarkInput,
} from "./compute-benchmarks";
import type { CampaignType } from "@/lib/campaign-classifier";

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
    videoDurationSeconds: null,
    cpa: 0,
    cpm: 0,
    campaignType: "evergreen",
    ...overrides,
  };
}

/**
 * Build a creative row with realistic eligible metrics. Accepts overrides
 * for format (`creativeType`) and `campaignType` so tests can assemble
 * mixed-segment datasets.
 */
function mkRow(
  opts: {
    id?: string;
    format?: "image" | "video";
    campaign_type?: CampaignType;
    n?: number;
  } = {}
): BenchmarkInput {
  const n = opts.n ?? 1;
  const linkClicks = 50 + 20 * n;
  return makeInput({
    creativeType: opts.format ?? "image",
    spend: 1000,
    impressions: 10_000,
    clicks: linkClicks + 10,
    linkClicks,
    purchases: n,
    purchaseRevenue: 5000 * n,
    cpa: 1000 / n,
    cpm: 100 + n,
    campaignType: opts.campaign_type ?? "evergreen",
  });
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
    return Array.from({ length: 15 }, (_, i) => mkRow({ n: i + 1 }));
  }

  it("emits no rows when sample size < 15", () => {
    const input = Array.from({ length: 14 }, (_, i) => mkRow({ n: i + 1 }));
    const result = computeBenchmarks(input, cpaTarget);
    // `all` with < 15 specific-segment eligible; everything still skipped
    // because each metric requires MIN_SAMPLE_SIZE finite values.
    expect(
      result.find((r) => r.format === "image" && r.campaign_type === "all")
    ).toBeUndefined();
  });

  it("computes percentiles for image format with 15+ eligible creatives", () => {
    const result = computeBenchmarks(make15Images(), cpaTarget);
    const allImage = result.filter(
      (r) => r.format === "image" && r.campaign_type === "all"
    );
    expect(allImage.find((r) => r.metric === "ctr_link")).toBeDefined();
    expect(allImage.find((r) => r.metric === "cpa")).toBeDefined();
  });

  it("CPA thresholds are inverted (top = lowest)", () => {
    const result = computeBenchmarks(make15Images(), cpaTarget);
    const cpa = result.find(
      (r) =>
        r.format === "image" && r.campaign_type === "all" && r.metric === "cpa"
    );
    expect(cpa).toBeDefined();
    expect(cpa!.top).toBeLessThan(cpa!.fail);
    expect(cpa!.top).toBeLessThan(cpa!.good);
  });

  it("CTR thresholds are non-inverted (top = highest)", () => {
    const result = computeBenchmarks(make15Images(), cpaTarget);
    const ctr = result.find(
      (r) =>
        r.format === "image" &&
        r.campaign_type === "all" &&
        r.metric === "ctr_link"
    );
    expect(ctr).toBeDefined();
    expect(ctr!.top).toBeGreaterThan(ctr!.fail);
  });

  it("filters out creatives that don't meet minimum spend/clicks", () => {
    const eligible = make15Images();
    const ineligible = Array.from({ length: 100 }, () =>
      makeInput({ spend: 10, linkClicks: 2, purchases: 0 })
    );
    const result = computeBenchmarks([...eligible, ...ineligible], cpaTarget);
    expect(
      result.find((r) => r.format === "image" && r.campaign_type === "all")
    ).toBeDefined();
  });

  it("drops `all` segment to empty when < 15 eligible after filtering", () => {
    const input = Array.from({ length: 14 }, (_, i) => mkRow({ n: i + 1 }));
    input.push(makeInput({ spend: 5, linkClicks: 2, purchases: 0 }));
    const result = computeBenchmarks(input, cpaTarget);
    expect(
      result.find((r) => r.format === "image" && r.campaign_type === "all")
    ).toBeUndefined();
  });
});

describe("computeBenchmarks with segmentation", () => {
  const cpaTarget = 300;

  it("computes separate benchmarks per segment when sample >= 15", () => {
    const creatives = [
      ...Array.from({ length: 20 }, (_, i) =>
        mkRow({
          id: `s${i}`,
          format: "video",
          campaign_type: "sale",
          n: i + 1,
        })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        mkRow({
          id: `e${i}`,
          format: "video",
          campaign_type: "evergreen",
          n: i + 1,
        })
      ),
    ];
    const result = computeBenchmarks(creatives, cpaTarget);
    expect(
      result.find((r) => r.format === "video" && r.campaign_type === "sale")
    ).toBeDefined();
    expect(
      result.find(
        (r) => r.format === "video" && r.campaign_type === "evergreen"
      )
    ).toBeDefined();
    expect(
      result.find((r) => r.format === "video" && r.campaign_type === "all")
    ).toBeDefined();
  });

  it("skips segment under 15 but still produces all", () => {
    const creatives = [
      ...Array.from({ length: 3 }, (_, i) =>
        mkRow({
          id: `s${i}`,
          format: "video",
          campaign_type: "sale",
          n: i + 1,
        })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        mkRow({
          id: `e${i}`,
          format: "video",
          campaign_type: "evergreen",
          n: i + 1,
        })
      ),
    ];
    const result = computeBenchmarks(creatives, cpaTarget);
    expect(
      result.find((r) => r.format === "video" && r.campaign_type === "sale")
    ).toBeUndefined();
    expect(
      result.find(
        (r) => r.format === "video" && r.campaign_type === "evergreen"
      )
    ).toBeDefined();
    expect(
      result.find((r) => r.format === "video" && r.campaign_type === "all")
    ).toBeDefined();
  });
});
