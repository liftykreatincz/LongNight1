import { describe, it, expect } from "vitest";
import { computeAlerts } from "./compute";
import type { AlertInput } from "./types";

function makeInput(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    adId: "ad1",
    adName: "Test Ad",
    spend: 100,
    purchases: 5,
    roas: 2.0,
    fatigueSignal: null,
    ctrChange: null,
    ...overrides,
  };
}

describe("computeAlerts", () => {
  it("returns empty for empty inputs", () => {
    expect(computeAlerts({ inputs: [], cpaTarget: 200 })).toEqual([]);
  });

  it("detects critical fatigue", () => {
    const alerts = computeAlerts({
      inputs: [makeInput({ fatigueSignal: "critical" })],
      cpaTarget: 200,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].alert_type).toBe("fatigue");
    expect(alerts[0].severity).toBe("high");
  });

  it("does not alert on non-critical fatigue", () => {
    const alerts = computeAlerts({
      inputs: [makeInput({ fatigueSignal: "rising" })],
      cpaTarget: 200,
    });
    expect(alerts.filter((a) => a.alert_type === "fatigue")).toHaveLength(0);
  });

  it("detects top performer", () => {
    const inputs = [
      makeInput({ adId: "a1", roas: 1.0, spend: 100 }),
      makeInput({ adId: "a2", roas: 1.0, spend: 100 }),
      makeInput({ adId: "a3", roas: 5.0, spend: 200 }),
    ];
    const alerts = computeAlerts({ inputs, cpaTarget: 200 });
    const topPerf = alerts.filter((a) => a.alert_type === "top_performer");
    expect(topPerf).toHaveLength(1);
    expect(topPerf[0].ad_id).toBe("a3");
  });

  it("detects spend without results", () => {
    const alerts = computeAlerts({
      inputs: [makeInput({ spend: 300, purchases: 0 })],
      cpaTarget: 200,
    });
    const noResult = alerts.filter((a) => a.alert_type === "spend_no_results");
    expect(noResult).toHaveLength(1);
    expect(noResult[0].severity).toBe("high");
  });

  it("does not alert spend_no_results if spend below CPA target", () => {
    const alerts = computeAlerts({
      inputs: [makeInput({ spend: 100, purchases: 0 })],
      cpaTarget: 200,
    });
    expect(alerts.filter((a) => a.alert_type === "spend_no_results")).toHaveLength(0);
  });

  it("detects rising star", () => {
    const alerts = computeAlerts({
      inputs: [
        makeInput({ adId: "a1", ctrChange: 1.5, spend: 300 }),
        makeInput({ adId: "a2", spend: 50 }),
      ],
      cpaTarget: 200,
    });
    const rising = alerts.filter((a) => a.alert_type === "rising_star");
    expect(rising).toHaveLength(1);
    expect(rising[0].ad_id).toBe("a1");
  });

  it("does not alert rising star if CTR change below 30%", () => {
    const alerts = computeAlerts({
      inputs: [makeInput({ ctrChange: 1.2 })],
      cpaTarget: 200,
    });
    expect(alerts.filter((a) => a.alert_type === "rising_star")).toHaveLength(0);
  });
});
