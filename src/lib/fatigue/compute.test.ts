import { describe, it, expect } from "vitest";
import { computeFatigue } from "./compute";
import type { DailyRow } from "./types";

function makeDay(date: string, ctr: number, frequency: number): DailyRow {
  return { date, impressions: 1000, clicks: Math.round(ctr * 10), ctr, cpm: 50, spend: 50, frequency, purchases: 1, link_clicks: 10 };
}

function makeDays(count: number, ctrFirst: number, ctrLast: number, freq: number): DailyRow[] {
  const rows: DailyRow[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const progress = count > 1 ? (count - 1 - i) / (count - 1) : 1;
    const ctr = ctrFirst + (ctrLast - ctrFirst) * progress;
    rows.push(makeDay(d.toISOString().split("T")[0], ctr, freq));
  }
  return rows;
}

describe("computeFatigue", () => {
  it("returns null for less than 7 days of data", () => {
    const result = computeFatigue(makeDays(5, 2.0, 2.0, 1.0));
    expect(result.score).toBeNull();
    expect(result.signal).toBeNull();
  });

  it("returns score 0 / signal none for stable CTR and low frequency", () => {
    const result = computeFatigue(makeDays(30, 2.0, 2.0, 1.0));
    expect(result.score).toBe(0);
    expect(result.signal).toBe("none");
  });

  it("returns high score for CTR drop + high frequency", () => {
    const result = computeFatigue(makeDays(30, 2.0, 1.0, 5.0));
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThan(50);
    expect(result.signal).toBe("fatigued");
  });

  it("frequency alone drives fatigue even with stable CTR", () => {
    const result = computeFatigue(makeDays(30, 2.0, 2.0, 6.0));
    expect(result.score!).toBeGreaterThanOrEqual(25);
    expect(result.signal).toBe("rising");
  });

  it("CTR increase means base = 0", () => {
    const result = computeFatigue(makeDays(30, 1.0, 3.0, 1.0));
    expect(result.ctrChange!).toBeGreaterThan(1);
    expect(result.score!).toBeLessThan(26);
    expect(result.signal).toBe("none");
  });

  it("skips days with 0 impressions", () => {
    const days = makeDays(30, 2.0, 2.0, 1.0);
    days[10].impressions = 0;
    days[10].ctr = 0;
    const result = computeFatigue(days);
    expect(result.score).not.toBeNull();
  });

  it("caps score at 100", () => {
    const result = computeFatigue(makeDays(30, 4.0, 0.5, 10.0));
    expect(result.score).toBe(100);
  });

  it("returns ctrChange and avgFrequency in result", () => {
    const result = computeFatigue(makeDays(30, 2.0, 1.0, 3.0));
    expect(result.ctrChange).not.toBeNull();
    expect(result.avgFrequency).not.toBeNull();
    expect(result.ctrChange!).toBeLessThan(1);
    expect(result.avgFrequency!).toBeCloseTo(3.0, 0);
  });
});
