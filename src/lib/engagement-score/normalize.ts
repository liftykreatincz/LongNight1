import type { Thresholds } from "./types";

/**
 * Linear interpolation between benchmark thresholds → 0-100 score.
 *
 * Pre-normalization: value and thresholds must be in the same unit
 * (e.g. CTR both as % — don't mix 0.021 and 2.1).
 *
 * Non-inverted (higher = better): TOP→100, GOOD→75, HRANICE→40, FAIL→10,
 * below FAIL→fixed 10, above TOP→fixed 100.
 *
 * Inverted (lower = better, e.g. CPA/PNO/CPM): same mapping but reversed
 * direction — values below TOP are best (100), above FAIL are worst (10).
 *
 * See metodika section 6 for the exact formula and worked examples.
 */
export function normalize(
  value: number,
  t: Thresholds,
  inverted: boolean
): number {
  if (!Number.isFinite(value)) return 10;

  if (inverted) {
    if (value <= t.top) return 100;
    if (value <= t.good) {
      return 75 + ((t.good - value) / (t.good - t.top)) * 25;
    }
    if (value <= t.hranice) {
      return 40 + ((t.hranice - value) / (t.hranice - t.good)) * 35;
    }
    if (value <= t.fail) {
      return 10 + ((t.fail - value) / (t.fail - t.hranice)) * 30;
    }
    return 10;
  }

  if (value >= t.top) return 100;
  if (value >= t.good) {
    return 75 + ((value - t.good) / (t.top - t.good)) * 25;
  }
  if (value >= t.hranice) {
    return 40 + ((value - t.hranice) / (t.good - t.hranice)) * 35;
  }
  if (value >= t.fail) {
    return 10 + ((value - t.fail) / (t.hranice - t.fail)) * 30;
  }
  return 10;
}
