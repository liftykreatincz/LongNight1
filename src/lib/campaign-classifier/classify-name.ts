import type { CampaignType } from "./types";
import { SALE_KEYWORDS, SEASONAL_KEYWORDS, DISCOUNT_REGEX } from "./keywords";

export function classifyByName(name: string): CampaignType | null {
  if (!name) return null;
  const upper = name.toUpperCase().replace(/[\s-]+/g, "_");

  // Seasonal has priority (BF_SALE_2025 = seasonal, not sale)
  if (SEASONAL_KEYWORDS.some((k) => upper.includes(k))) return "seasonal";

  if (
    SALE_KEYWORDS.some((k) => upper.includes(k)) ||
    DISCOUNT_REGEX.test(name)
  ) {
    return "sale";
  }

  return null;
}
