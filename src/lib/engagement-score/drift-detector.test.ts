import { describe, it, expect } from "vitest";
import { detectDrift, type BenchmarkRowLite } from "./drift-detector";

function makeRow(overrides: Partial<BenchmarkRowLite> = {}): BenchmarkRowLite {
  return {
    format: "image",
    campaign_type: "all",
    metric: "ctr_link",
    fail: 100,
    hranice: 200,
    good: 300,
    top: 400,
    ...overrides,
  };
}

describe("detectDrift", () => {
  it("returns false when there is no change", () => {
    const rows = [makeRow()];
    expect(detectDrift(rows, rows)).toBe(false);
  });

  it("returns true when one metric has 21% relative change", () => {
    const prev = [makeRow({ fail: 100 })];
    const curr = [makeRow({ fail: 121 })]; // 21% change
    expect(detectDrift(prev, curr)).toBe(true);
  });

  it("returns false when change is 19% (below threshold)", () => {
    const prev = [makeRow({ fail: 100 })];
    const curr = [makeRow({ fail: 119 })]; // 19% change
    expect(detectDrift(prev, curr)).toBe(false);
  });

  it("ignores previous value of 0 (no false positive)", () => {
    const prev = [makeRow({ fail: 0 })];
    const curr = [makeRow({ fail: 999 })];
    expect(detectDrift(prev, curr)).toBe(false);
  });

  it("ignores metric present only in previous (removed)", () => {
    const prev = [makeRow({ metric: "ctr_link" }), makeRow({ metric: "cpm" })];
    const curr = [makeRow({ metric: "ctr_link" })];
    expect(detectDrift(prev, curr)).toBe(false);
  });

  it("ignores metric present only in current (added)", () => {
    const prev = [makeRow({ metric: "ctr_link" })];
    const curr = [makeRow({ metric: "ctr_link" }), makeRow({ metric: "cpm", fail: 999 })];
    expect(detectDrift(prev, curr)).toBe(false);
  });

  it("returns true when any metric in multi-row set crosses threshold", () => {
    const prev = [
      makeRow({ metric: "ctr_link", fail: 100 }),
      makeRow({ metric: "cpm", fail: 50 }),
    ];
    const curr = [
      makeRow({ metric: "ctr_link", fail: 100 }), // no change
      makeRow({ metric: "cpm", fail: 61 }),         // 22% change → drift
    ];
    expect(detectDrift(prev, curr)).toBe(true);
  });
});
