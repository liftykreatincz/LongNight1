import type { ClassificationResult, ClassifyInput } from "./types";
import { classifyByName } from "./classify-name";
import { classifyByDateRange } from "./classify-date";

export function classifyCampaign(input: ClassifyInput): ClassificationResult {
  const byName = classifyByName(input.name);
  if (byName) {
    return { type: byName, source: "auto", matchedBy: "name" };
  }

  const byDate = classifyByDateRange(input.started_at, input.ended_at);
  if (byDate) {
    return { type: byDate, source: "auto", matchedBy: "date" };
  }

  return { type: "evergreen", source: "auto", matchedBy: "default" };
}
