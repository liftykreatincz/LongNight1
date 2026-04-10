import type { DailyRow, FatigueResult, FatigueSignal } from "./types";

const MIN_DAYS = 7;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function signalFromScore(score: number): FatigueSignal {
  if (score >= 76) return "critical";
  if (score >= 51) return "fatigued";
  if (score >= 26) return "rising";
  return "none";
}

export function computeFatigue(days: DailyRow[]): FatigueResult {
  const valid = days
    .filter((d) => d.impressions > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length < MIN_DAYS) {
    return { score: null, signal: null, ctrChange: null, avgFrequency: null };
  }

  const mid = Math.floor(valid.length / 2);
  const firstHalf = valid.slice(0, mid);
  const lastHalf = valid.slice(mid);

  const avgCtrFirst =
    firstHalf.reduce((s, d) => s + d.ctr, 0) / firstHalf.length;
  const avgCtrLast =
    lastHalf.reduce((s, d) => s + d.ctr, 0) / lastHalf.length;

  const ctrChange = avgCtrFirst > 0 ? avgCtrLast / avgCtrFirst : 1;

  const last7 = valid.slice(-7);
  const avgFrequency =
    last7.reduce((s, d) => s + d.frequency, 0) / last7.length;

  const base = clamp((1 - ctrChange) * 80, 0, 80);
  const freqBonus = Math.min(Math.max(avgFrequency - 1, 0) / 7, 1) * 60;

  const rawScore = base + freqBonus;
  const score = Math.round(clamp(rawScore, 0, 100));

  return {
    score,
    signal: signalFromScore(score),
    ctrChange: Math.round(ctrChange * 1000) / 1000,
    avgFrequency: Math.round(avgFrequency * 10) / 10,
  };
}
