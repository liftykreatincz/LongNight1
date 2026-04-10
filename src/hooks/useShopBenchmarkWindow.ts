"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export type WindowDays = 30 | 60 | 90 | null; // null = all-time

export function useShopBenchmarkWindow(shopId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["shop-benchmark-window", shopId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WindowDays> => {
      const { data, error } = await supabase
        .from("shops")
        .select("benchmark_window_days")
        .eq("id", shopId)
        .maybeSingle();
      if (error) throw error;
      const raw = data?.benchmark_window_days;
      if (raw === 30 || raw === 60 || raw === 90) return raw;
      if (raw === null || raw === undefined) return 30; // default
      return 30;
    },
  });

  const mutation = useMutation({
    mutationFn: async (windowDays: WindowDays) => {
      const { error } = await supabase
        .from("shops")
        .update({ benchmark_window_days: windowDays })
        .eq("id", shopId);
      if (error) throw error;

      // Trigger recompute so benchmarks reflect new window
      const res = await fetch("/api/benchmarks/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Recompute failed");
      }
      return res.json();
    },
    onSuccess: (_data, windowDays) => {
      queryClient.setQueryData(["shop-benchmark-window", shopId], windowDays);
      queryClient.invalidateQueries({ queryKey: ["shop-benchmarks", shopId] });
      queryClient.invalidateQueries({
        queryKey: ["creative-analysis", shopId],
      });
      toast.success("Benchmarky přepočítány s novým oknem");
    },
    onError: (error: Error) => {
      toast.error(`Chyba: ${error.message}`);
    },
  });

  return {
    windowDays: query.data ?? 30,
    isLoading: query.isLoading,
    setWindowDays: mutation.mutate,
    isSaving: mutation.isPending,
  };
}
