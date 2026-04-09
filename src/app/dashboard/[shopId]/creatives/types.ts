import type { CreativeRow } from "@/hooks/useCreativeAnalysis";
import type { EngagementResult } from "@/lib/engagement-score";

export type ScoredCreativeRow = CreativeRow & { engagement: EngagementResult };
