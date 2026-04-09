export type CampaignType = "unknown" | "evergreen" | "sale" | "seasonal";
export type ClassificationSource = "auto" | "manual";
export type ClassificationMatchedBy = "name" | "date" | "default";

export interface ClassificationResult {
  type: CampaignType;
  source: ClassificationSource;
  matchedBy: ClassificationMatchedBy;
}

export interface ClassifyInput {
  name: string;
  started_at?: Date | null;
  ended_at?: Date | null;
}
