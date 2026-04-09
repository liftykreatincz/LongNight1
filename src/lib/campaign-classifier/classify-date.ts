import type { CampaignType } from "./types";

const DAY_MS = 86_400_000;
const SALE_MAX_DAYS = 14;
const SEASONAL_MAX_DAYS = 45;

export function classifyByDateRange(
  startedAt?: Date | null,
  endedAt?: Date | null
): CampaignType | null {
  if (!startedAt) return null;
  const end = endedAt ?? null;

  if (end) {
    const days = Math.round((end.getTime() - startedAt.getTime()) / DAY_MS);
    const startMonth = startedAt.getUTCMonth(); // Nov=10, Dec=11
    if ((startMonth === 10 || startMonth === 11) && days >= 0 && days <= SEASONAL_MAX_DAYS) {
      return "seasonal";
    }
    if (days >= 0 && days <= SALE_MAX_DAYS) {
      return "sale";
    }
  }

  return null;
}
