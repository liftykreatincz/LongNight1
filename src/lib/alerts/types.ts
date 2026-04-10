export type AlertType = "fatigue" | "top_performer" | "spend_no_results" | "rising_star";
export type AlertSeverity = "high" | "medium" | "low";

export interface CreativeAlert {
  ad_id: string;
  alert_type: AlertType;
  message: string;
  severity: AlertSeverity;
}

export interface AlertInput {
  adId: string;
  adName: string;
  spend: number;
  purchases: number;
  roas: number;
  fatigueSignal: string | null;
  ctrChange: number | null; // from daily data: last7d avg / prev7d avg
}
