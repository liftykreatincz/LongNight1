import { describe, it, expect } from "vitest";
import { hasEnoughData, type FilterInput } from "./filter";

function makeInput(overrides: Partial<FilterInput> = {}): FilterInput {
  return {
    spend: 0,
    linkClicks: 0,
    purchases: 0,
    ...overrides,
  };
}

describe("hasEnoughData", () => {
  const cpaTarget = 300;

  it("passes when spend >= 2*cpa and linkClicks >= 50", () => {
    const r = hasEnoughData(
      makeInput({ spend: 600, linkClicks: 50 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("fails with low_spend when spend < 2*cpa", () => {
    const r = hasEnoughData(
      makeInput({ spend: 599, linkClicks: 100 }),
      cpaTarget
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("low_spend");
  });

  it("fails with low_clicks when spend ok but linkClicks < 50", () => {
    const r = hasEnoughData(
      makeInput({ spend: 1000, linkClicks: 49 }),
      cpaTarget
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("low_clicks");
  });

  it("purchases >= 3 overrides both filters", () => {
    const r = hasEnoughData(
      makeInput({ spend: 10, linkClicks: 5, purchases: 3 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("purchases = 2 does NOT override", () => {
    const r = hasEnoughData(
      makeInput({ spend: 10, linkClicks: 5, purchases: 2 }),
      cpaTarget
    );
    expect(r.ok).toBe(false);
  });

  it("boundary: spend exactly 2*cpa passes", () => {
    const r = hasEnoughData(
      makeInput({ spend: 600, linkClicks: 50 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
  });

  it("boundary: linkClicks exactly 50 passes", () => {
    const r = hasEnoughData(
      makeInput({ spend: 600, linkClicks: 50 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
  });
});
