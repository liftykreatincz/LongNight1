"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export interface SnapshotEntry {
  snapshotAt: string;
  rowCount: number;
}

export function useDriftState(shopId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const driftQuery = useQuery({
    queryKey: ["shop-drift", shopId],
    staleTime: 30_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("shops")
        .select("drift_detected_at")
        .eq("id", shopId)
        .maybeSingle();
      if (error) throw error;
      return data?.drift_detected_at ?? null;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["benchmark-history", shopId],
    staleTime: 60_000,
    enabled: driftQuery.data != null, // only fetch when drift is active
    queryFn: async (): Promise<SnapshotEntry[]> => {
      const res = await fetch(`/api/benchmarks/history?shopId=${shopId}`);
      if (!res.ok) throw new Error("History fetch failed");
      const json = await res.json();
      return json.snapshots ?? [];
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/benchmarks/accept-drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });
      if (!res.ok) throw new Error("Accept failed");
    },
    onSuccess: () => {
      queryClient.setQueryData(["shop-drift", shopId], null);
      toast.success("Drift přijat");
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (snapshotAt: string) => {
      const res = await fetch("/api/benchmarks/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, snapshotAt }),
      });
      if (!res.ok) throw new Error("Rollback failed");
    },
    onSuccess: () => {
      queryClient.setQueryData(["shop-drift", shopId], null);
      queryClient.invalidateQueries({ queryKey: ["shop-benchmarks", shopId] });
      queryClient.invalidateQueries({
        queryKey: ["creative-analysis", shopId],
      });
      toast.success("Benchmarky vráceny na snapshot");
    },
  });

  return {
    driftDetectedAt: driftQuery.data ?? null,
    isLoading: driftQuery.isLoading,
    snapshots: historyQuery.data ?? [],
    accept: acceptMutation.mutate,
    rollback: rollbackMutation.mutate,
    isAccepting: acceptMutation.isPending,
    isRollingBack: rollbackMutation.isPending,
  };
}
