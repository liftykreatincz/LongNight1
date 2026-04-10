import type { CreativeAlert, AlertInput } from "./types";

interface ComputeAlertsOptions {
  inputs: AlertInput[];
  cpaTarget: number;
}

export function computeAlerts({ inputs, cpaTarget }: ComputeAlertsOptions): CreativeAlert[] {
  const alerts: CreativeAlert[] = [];

  if (inputs.length === 0) return alerts;

  // Compute averages for thresholds
  const withSpend = inputs.filter((i) => i.spend > 0);
  const avgRoas =
    withSpend.length > 0
      ? withSpend.reduce((s, i) => s + i.roas, 0) / withSpend.length
      : 0;
  const spends = withSpend.map((i) => i.spend).sort((a, b) => a - b);
  const medianSpend =
    spends.length > 0
      ? spends[Math.floor(spends.length / 2)]
      : 0;

  for (const input of inputs) {
    // Fatigue alert — critical fatigue
    if (input.fatigueSignal === "critical") {
      alerts.push({
        ad_id: input.adId,
        alert_type: "fatigue",
        message: `Kreativa "${input.adName}" vykazuje kritickou unavu.`,
        severity: "high",
      });
    }

    // Top performer — ROAS > 2× average AND spend >= median
    if (
      avgRoas > 0 &&
      input.roas > avgRoas * 2 &&
      input.spend >= medianSpend
    ) {
      alerts.push({
        ad_id: input.adId,
        alert_type: "top_performer",
        message: `Kreativa "${input.adName}" ma ROAS ${input.roas.toFixed(1)}× (2× nad prumerem).`,
        severity: "medium",
      });
    }

    // Spend without results — spend > CPA target, 0 purchases
    if (
      cpaTarget > 0 &&
      input.spend > cpaTarget &&
      input.purchases === 0
    ) {
      alerts.push({
        ad_id: input.adId,
        alert_type: "spend_no_results",
        message: `Kreativa "${input.adName}" utratila ${Math.round(input.spend)} Kc bez jedineho nakupu.`,
        severity: "high",
      });
    }

    // Rising star — CTR improved 30%+ AND spend >= median
    if (
      input.ctrChange !== null &&
      input.ctrChange > 1.3 &&
      input.spend >= medianSpend
    ) {
      alerts.push({
        ad_id: input.adId,
        alert_type: "rising_star",
        message: `Kreativa "${input.adName}" zlepsila CTR o ${Math.round((input.ctrChange - 1) * 100)} % za poslednich 7 dni.`,
        severity: "medium",
      });
    }
  }

  return alerts;
}
