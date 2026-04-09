import { describe, it, expect } from "vitest";
import { resolveBenchmarks } from "./resolve-benchmarks";
import type { BenchmarkSet, CreativeFormat } from "./types";

function makeSet(
  sample_size: number,
  format: CreativeFormat = "video",
  marker = "X"
): BenchmarkSet {
  return {
    format,
    sample_size,
    metrics: { ctr_link: { fail: 1, hranice: 2, good: 3, top: 4 } },
    // marker kept on the object for debugging the cache key chosen
    // in test expectations (not part of BenchmarkSet)
    ...({ __marker: marker } as Record<string, unknown>),
  } as BenchmarkSet;
}

describe("resolveBenchmarks", () => {
  it("returns primary when sample_size >= 15", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:sale", makeSet(20, "video", "sale"));
    map.set("video:all", makeSet(100, "video", "all"));
    const r = resolveBenchmarks(map, "video", "sale");
    expect(r.usedFallback).toBe(false);
    expect(r.effectiveCampaignType).toBe("sale");
  });

  it("falls back to all when primary sample too small", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:sale", makeSet(5, "video", "sale"));
    map.set("video:all", makeSet(100, "video", "all"));
    const r = resolveBenchmarks(map, "video", "sale");
    expect(r.usedFallback).toBe(true);
    expect(r.effectiveCampaignType).toBe("all");
    expect(r.fallbackReason).toContain("sale");
  });

  it("falls back to all when primary missing entirely", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:all", makeSet(100, "video", "all"));
    const r = resolveBenchmarks(map, "video", "seasonal");
    expect(r.usedFallback).toBe(true);
    expect(r.effectiveCampaignType).toBe("all");
  });

  it("marks unknown campaign type with specific reason", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:all", makeSet(100, "video", "all"));
    const r = resolveBenchmarks(map, "video", "unknown");
    expect(r.usedFallback).toBe(true);
    expect(r.fallbackReason).toContain("klasifikov");
  });

  it("returns default agency benchmark when all is missing", () => {
    const map = new Map<string, BenchmarkSet>();
    const r = resolveBenchmarks(map, "video", "sale");
    expect(r.usedFallback).toBe(true);
    expect(r.effectiveCampaignType).toBe("all");
    expect(r.fallbackReason).toContain("Výchozí");
  });
});
