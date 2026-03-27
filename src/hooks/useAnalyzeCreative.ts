"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useAnalyzeCreative(shopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (creativeAdId: string) => {
      const res = await fetch("/api/creatives/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, creativeAdId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Analysis failed");
      }
      const data = await res.json();
      return data.analysis;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["creative-analysis", shopId],
      });
    },
  });
}
