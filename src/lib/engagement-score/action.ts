import type { ActionLabel } from "./types";

export function actionLabelFromScore(score: number | null): ActionLabel {
  if (score === null) return "insufficient_data";
  if (score >= 81) return "excellent";
  if (score >= 61) return "good";
  if (score >= 31) return "average";
  return "weak";
}
