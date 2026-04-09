import type { ActionLabel } from "./types";

export interface BadgeColor {
  bg: string;
  fg: string;
  border: string;
}

export function colorForAction(label: ActionLabel): BadgeColor {
  switch (label) {
    case "excellent":
      return { bg: "#34c759", fg: "#ffffff", border: "#2ca14c" };
    case "good":
      return { bg: "#a3e635", fg: "#1d1d1f", border: "#84cc16" };
    case "average":
      return { bg: "#ff9f0a", fg: "#ffffff", border: "#d97706" };
    case "weak":
      return { bg: "#ff3b30", fg: "#ffffff", border: "#dc2626" };
    case "insufficient_data":
      return { bg: "#e5e5ea", fg: "#86868b", border: "#d2d2d7" };
  }
}
