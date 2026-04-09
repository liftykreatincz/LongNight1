import { describe, it, expect } from "vitest";
import { normalize } from "./normalize";
import type { Thresholds } from "./types";

describe("normalize (non-inverted)", () => {
  const t: Thresholds = { fail: 1.0, hranice: 1.8, good: 2.5, top: 3.5 };

  it("methodology example: CTR 2.1% → score 55", () => {
    // From metodika section 6:
    // 40 + (2.1 - 1.8) / (2.5 - 1.8) * 35 = 40 + 15 = 55
    expect(normalize(2.1, t, false)).toBeCloseTo(55, 5);
  });

  it("value >= TOP returns 100", () => {
    expect(normalize(3.5, t, false)).toBe(100);
    expect(normalize(5.0, t, false)).toBe(100);
  });

  it("value exactly at GOOD returns 75", () => {
    expect(normalize(2.5, t, false)).toBe(75);
  });

  it("value exactly at HRANICE returns 40", () => {
    expect(normalize(1.8, t, false)).toBe(40);
  });

  it("value exactly at FAIL returns 10", () => {
    expect(normalize(1.0, t, false)).toBe(10);
  });

  it("value below FAIL returns fixed 10", () => {
    expect(normalize(0.5, t, false)).toBe(10);
    expect(normalize(0, t, false)).toBe(10);
  });

  it("interpolates linearly between GOOD and TOP", () => {
    // 3.0 is midway: 75 + 0.5 * 25 = 87.5
    expect(normalize(3.0, t, false)).toBeCloseTo(87.5, 5);
  });
});

describe("normalize (inverted, e.g. CPA)", () => {
  const t: Thresholds = { fail: 300, hranice: 220, good: 160, top: 110 };

  it("value <= TOP returns 100 (lowest = best)", () => {
    expect(normalize(110, t, true)).toBe(100);
    expect(normalize(50, t, true)).toBe(100);
  });

  it("value exactly at GOOD returns 75", () => {
    expect(normalize(160, t, true)).toBe(75);
  });

  it("CPA 180 at these thresholds: between GOOD and HRANICE", () => {
    // 40 + (220 - 180) / (220 - 160) * 35 = 40 + 40/60*35 ≈ 63.33
    expect(normalize(180, t, true)).toBeCloseTo(63.333, 3);
  });

  it("value exactly at FAIL returns 10", () => {
    expect(normalize(300, t, true)).toBe(10);
  });

  it("value above FAIL returns fixed 10", () => {
    expect(normalize(500, t, true)).toBe(10);
  });
});
