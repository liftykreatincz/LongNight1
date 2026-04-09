"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface MetaAnalysisResult {
  executive_summary: string;
  top_performers: Array<{
    ad_name: string;
    ad_id: string;
    why_works: string;
    key_lesson: string;
  }>;
  worst_performers: Array<{
    ad_name: string;
    ad_id: string;
    why_fails: string;
  }>;
  patterns: {
    visual_trends: string[];
    copy_trends: string[];
    format_trends: string[];
  };
  what_works: string[];
  what_to_avoid: string[];
  next_creative_blueprint: {
    concept: string;
    hook: string;
    visual_direction: string;
    copy_angle: string;
    cta: string;
    why_above_average: string;
  };
  key_takeaways: string[];
}

export interface MetaAnalysisRow {
  id: string;
  created_at: string;
  creatives_count: number;
  scope: "all" | "filtered";
  filter_context: Record<string, unknown> | null;
  ad_ids: string[];
  analysis: MetaAnalysisResult;
  model: string;
}

export interface RunMetaAnalysisArgs {
  shopId: string;
  scope: "all" | "filtered";
  adIds?: string[];
  filterContext?: Record<string, unknown>;
  minSpend?: number;
}

export function useRunMetaAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: RunMetaAnalysisArgs): Promise<MetaAnalysisRow> => {
      const res = await fetch("/api/creatives/meta-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: args.shopId,
          scope: args.scope,
          ad_ids: args.adIds,
          filter_context: args.filterContext ?? null,
          min_spend: typeof args.minSpend === "number" ? args.minSpend : 0,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Meta analysis failed");
      }

      const data = (await res.json()) as {
        success?: boolean;
        row?: MetaAnalysisRow;
        error?: string;
      };
      if (!data?.success || !data.row) {
        throw new Error(data?.error || "Meta analysis failed");
      }
      return data.row;
    },
    onSuccess: (_row, args) => {
      queryClient.invalidateQueries({
        queryKey: ["creative-meta-analyses", args.shopId],
      });
    },
  });
}
