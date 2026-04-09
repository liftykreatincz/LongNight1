import type { BenchmarkSet, Benchmarks, Format } from "./types";

/**
 * Agency default thresholds for CZ e-commerce, Phase 1 starting point.
 * Used when a shop has < 15 creatives per format and we cannot compute
 * per-shop percentiles. Override via the benchmarks recompute endpoint.
 *
 * FAIL = ~25th percentile (worst quartile)
 * HRANICE = ~40th percentile (average)
 * GOOD = ~75th percentile (top quartile)
 * TOP = ~90th percentile (top decile)
 *
 * For inverted metrics (CPA, PNO, CPM): TOP is the LOWEST (cheapest)
 * value, FAIL is the HIGHEST.
 */
export const DEFAULT_BENCHMARKS: Benchmarks = {
  image: {
    ctr_link: { fail: 1.0, hranice: 1.8, good: 2.5, top: 3.5 },
    ctr_all: { fail: 1.2, hranice: 2.0, good: 3.0, top: 4.0 },
    cpa: { fail: 300, hranice: 220, good: 160, top: 110 },
    pno: { fail: 40, hranice: 32, good: 25, top: 18 },
    cpm: { fail: 350, hranice: 240, good: 160, top: 100 },
    cvr: { fail: 1.0, hranice: 1.8, good: 2.8, top: 4.0 },
    konv_per_1k: { fail: 0.3, hranice: 0.6, good: 1.1, top: 1.8 },
  },
  video: {
    ctr_link: { fail: 1.0, hranice: 1.8, good: 2.5, top: 3.5 },
    hook_rate: { fail: 25, hranice: 40, good: 55, top: 70 },
    thumb_stop: { fail: 3, hranice: 6, good: 10, top: 15 },
    avg_watch_pct: { fail: 15, hranice: 25, good: 40, top: 55 },
    thruplay_rate: { fail: 6, hranice: 10, good: 15, top: 22 },
    hold_rate: { fail: 15, hranice: 25, good: 40, top: 55 },
    cpa: { fail: 300, hranice: 220, good: 160, top: 110 },
    pno: { fail: 40, hranice: 32, good: 25, top: 18 },
    cpm: { fail: 350, hranice: 240, good: 160, top: 100 },
    cvr: { fail: 1.0, hranice: 1.8, good: 2.8, top: 4.0 },
    konv_per_1k: { fail: 0.3, hranice: 0.6, good: 1.1, top: 1.8 },
  },
};

/**
 * Default agency benchmarks expressed as BenchmarkSet per format, used as
 * the last-resort fallback when neither the requested segment nor the
 * shared `all` segment is available in the resolution chain.
 */
export const DEFAULT_AGENCY_BENCHMARKS: Record<Format, BenchmarkSet> = {
  image: {
    format: "image",
    metrics: DEFAULT_BENCHMARKS.image,
    sample_size: 0,
  },
  video: {
    format: "video",
    metrics: DEFAULT_BENCHMARKS.video,
    sample_size: 0,
  },
};
