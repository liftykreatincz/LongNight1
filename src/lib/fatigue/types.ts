export type FatigueSignal = "none" | "rising" | "fatigued" | "critical";

export interface DailyRow {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  spend: number;
  frequency: number;
  purchases: number;
  link_clicks: number;
}

export interface FatigueResult {
  score: number | null;
  signal: FatigueSignal | null;
  ctrChange: number | null;   // ratio: last15 / first15 (e.g. 0.7 = 30% drop)
  avgFrequency: number | null; // last 7 days
}
