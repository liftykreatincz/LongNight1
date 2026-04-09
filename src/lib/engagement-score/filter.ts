import type { FilterReason } from "./types";

export interface FilterInput {
  spend: number;
  linkClicks: number;
  purchases: number;
}

export interface FilterResult {
  ok: boolean;
  reason: FilterReason;
}

/**
 * Decide whether a creative has enough data for a meaningful engagement
 * score (metodika section 2).
 *
 * Pass conditions (BOTH required unless purchases override):
 *   spend >= 2 * cpa_target
 *   linkClicks >= 50
 *
 * Override: purchases >= 3 bypasses both filters (conversions are a
 * stronger signal than click volume).
 */
export function hasEnoughData(
  input: FilterInput,
  cpaTarget: number
): FilterResult {
  if (input.purchases >= 3) return { ok: true, reason: null };
  if (input.spend < 2 * cpaTarget) return { ok: false, reason: "low_spend" };
  if (input.linkClicks < 50) return { ok: false, reason: "low_clicks" };
  return { ok: true, reason: null };
}
