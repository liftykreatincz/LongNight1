"use client";

import { useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  Flame,
  Star,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { AlertRow } from "@/hooks/useCreativeAlerts";
import type { AlertType } from "@/lib/alerts/types";

interface Props {
  alerts: AlertRow[];
  onDismiss: (alertId: string) => void;
}

const ALERT_ICONS: Record<AlertType, typeof AlertTriangle> = {
  fatigue: Flame,
  top_performer: Star,
  spend_no_results: AlertTriangle,
  rising_star: TrendingUp,
};

const ALERT_COLORS: Record<AlertType, { bg: string; border: string; text: string; icon: string }> = {
  fatigue: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: "text-red-500" },
  top_performer: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", icon: "text-emerald-500" },
  spend_no_results: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: "text-amber-500" },
  rising_star: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: "text-blue-500" },
};

const MAX_VISIBLE = 3;

export function AlertsBanner({ alerts, onDismiss }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const visible = expanded ? alerts : alerts.slice(0, MAX_VISIBLE);
  const hasMore = alerts.length > MAX_VISIBLE;

  return (
    <div className="space-y-1.5">
      {visible.map((alert) => {
        const Icon = ALERT_ICONS[alert.alert_type];
        const colors = ALERT_COLORS[alert.alert_type];

        return (
          <div
            key={alert.id}
            className={`flex items-center gap-2 rounded-xl ${colors.bg} border ${colors.border} px-4 py-2 text-[13px] ${colors.text}`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${colors.icon}`} />
            <span className="flex-1">{alert.message}</span>
            <button
              onClick={() => onDismiss(alert.id)}
              className="p-0.5 rounded hover:bg-black/5 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-[12px] text-[#86868b] hover:text-[#1d1d1f] font-medium transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Skrýt
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Zobrazit dalších {alerts.length - MAX_VISIBLE}
            </>
          )}
        </button>
      )}
    </div>
  );
}
