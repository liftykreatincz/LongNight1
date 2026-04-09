"use client";

import { cn } from "@/lib/utils";
import type {
  CategoryScores,
  EngagementResult,
} from "@/lib/engagement-score";
import { colorForAction } from "@/lib/engagement-score/colors";
import type { CampaignType } from "@/lib/campaign-classifier";

interface Props {
  result: EngagementResult;
  size?: "sm" | "md" | "lg";
  showCategoryBars?: boolean;
  className?: string;
  campaignType?: CampaignType;
}

const SIZES = {
  sm: { w: 32, text: "text-[11px]", stroke: 2 },
  md: { w: 40, text: "text-[13px] font-bold", stroke: 2.5 },
  lg: { w: 56, text: "text-[17px] font-extrabold", stroke: 3 },
} as const;

function tooltipText(r: EngagementResult, campaignType?: CampaignType): string {
  const lines: string[] = [];
  if (r.actionLabel === "insufficient_data") {
    if (r.filterReason === "low_spend") lines.push("Sbírání dat · málo útraty");
    else if (r.filterReason === "low_clicks")
      lines.push("Sbírání dat · málo kliků");
    else lines.push("Sbírání dat");
  } else {
    const parts: string[] = [];
    if (r.categories.attention !== null)
      parts.push(`A ${Math.round(r.categories.attention)}`);
    if (r.categories.retention !== null)
      parts.push(`R ${Math.round(r.categories.retention)}`);
    if (r.categories.efficiency !== null)
      parts.push(`E ${Math.round(r.categories.efficiency)}`);
    if (r.categories.performance !== null)
      parts.push(`P ${Math.round(r.categories.performance)}`);
    lines.push(parts.join(" · "));
  }
  if (campaignType) {
    lines.push(`Typ: ${campaignType}`);
  }
  if (r.usedFallback) {
    lines.push(
      `Benchmark: ${r.effectiveCampaignType} (${r.fallbackReason ?? "fallback"})`
    );
  }
  return lines.join("\n");
}

function CategoryBars({ cats }: { cats: CategoryScores }) {
  const rows: Array<[string, number | null]> = [
    ["A", cats.attention],
    ["R", cats.retention],
    ["E", cats.efficiency],
    ["P", cats.performance],
  ];
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-col items-center"
          title={`${label}: ${value === null ? "—" : Math.round(value)}`}
        >
          <div className="h-1 w-6 rounded-full bg-[#e5e5ea] overflow-hidden">
            {value !== null && (
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, value))}%`,
                  backgroundColor:
                    value >= 81
                      ? "#34c759"
                      : value >= 61
                        ? "#a3e635"
                        : value >= 31
                          ? "#ff9f0a"
                          : "#ff3b30",
                }}
              />
            )}
          </div>
          <span className="mt-0.5 text-[9px] font-semibold text-[#86868b]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EngagementBadge({
  result,
  size = "md",
  showCategoryBars = false,
  className,
  campaignType,
}: Props) {
  const color = colorForAction(result.actionLabel);
  const { w, text } = SIZES[size];
  const label =
    result.engagementScore === null
      ? "—"
      : String(Math.round(result.engagementScore));

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center shadow-sm border",
          text
        )}
        style={{
          width: w,
          height: w,
          backgroundColor: color.bg,
          color: color.fg,
          borderColor: color.border,
        }}
        title={tooltipText(result, campaignType)}
      >
        {label}
      </div>
      {showCategoryBars && <CategoryBars cats={result.categories} />}
    </div>
  );
}
