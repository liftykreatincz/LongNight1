import { describe, it, expect } from "vitest";
import { classifyByDateRange } from "./classify-date";

describe("classifyByDateRange", () => {
  it("returns null when startedAt is missing", () => {
    expect(classifyByDateRange(null, null)).toBeNull();
    expect(classifyByDateRange(undefined, new Date("2025-11-20"))).toBeNull();
  });

  it("returns null for an active evergreen campaign (no end)", () => {
    const start = new Date("2025-01-01");
    expect(classifyByDateRange(start, null)).toBeNull();
  });

  it("detects seasonal campaign starting in November ≤ 45 days", () => {
    const start = new Date("2025-11-20");
    const end = new Date("2025-12-10");
    expect(classifyByDateRange(start, end)).toBe("seasonal");
  });

  it("detects seasonal campaign starting in December ≤ 45 days", () => {
    const start = new Date("2025-12-01");
    const end = new Date("2025-12-26");
    expect(classifyByDateRange(start, end)).toBe("seasonal");
  });

  it("does NOT detect seasonal in January", () => {
    const start = new Date("2025-01-05");
    const end = new Date("2025-01-15");
    expect(classifyByDateRange(start, end)).toBe("sale");
  });

  it("detects sale for campaign ≤ 14 days", () => {
    const start = new Date("2025-06-01");
    const end = new Date("2025-06-10");
    expect(classifyByDateRange(start, end)).toBe("sale");
  });

  it("returns null for long-lived campaign that ended", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2025-01-01");
    expect(classifyByDateRange(start, end)).toBeNull();
  });

  it("returns null for seasonal November window that was > 45 days", () => {
    const start = new Date("2025-11-01");
    const end = new Date("2026-01-15");
    expect(classifyByDateRange(start, end)).toBeNull();
  });
});
