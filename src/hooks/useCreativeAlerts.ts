"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { AlertType, AlertSeverity } from "@/lib/alerts/types";

export interface AlertRow {
  id: string;
  ad_id: string;
  alert_type: AlertType;
  message: string;
  severity: AlertSeverity;
  created_at: string;
}

export function useCreativeAlerts(shopId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["creative-alerts", shopId],
    staleTime: 60_000,
    queryFn: async (): Promise<AlertRow[]> => {
      const { data, error } = await supabase
        .from("creative_alerts")
        .select("id,ad_id,alert_type,message,severity,created_at")
        .eq("shop_id", shopId)
        .is("dismissed_at", null)
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        ad_id: r.ad_id as string,
        alert_type: r.alert_type as AlertType,
        message: r.message as string,
        severity: r.severity as AlertSeverity,
        created_at: r.created_at as string,
      }));
    },
  });
}

export function useDismissAlert(shopId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("creative_alerts")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["creative-alerts", shopId],
      });
    },
  });
}
