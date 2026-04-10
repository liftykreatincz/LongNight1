"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type {
  CategoryScores,
  EngagementResult,
  MetricDetail,
} from "@/lib/engagement-score";
import { METRIC_LABELS, CATEGORY_LABELS } from "@/lib/engagement-score";
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

function scoreColor(score: number): string {
  if (score >= 81) return "#34c759";
  if (score >= 61) return "#a3e635";
  if (score >= 31) return "#ff9f0a";
  return "#ff3b30";
}

function formatValue(value: number, unit: string): string {
  if (unit === "Kč") return `${Math.round(value)} Kč`;
  if (unit === "/ 1k") return value.toFixed(2);
  return `${value.toFixed(1)} %`;
}

function actionLabelCz(label: string): string {
  switch (label) {
    case "excellent":
      return "Excelentní";
    case "good":
      return "Dobrý";
    case "average":
      return "Průměrný";
    case "weak":
      return "Slabý";
    default:
      return "Nedostatek dat";
  }
}

function ScoreBreakdown({
  result,
  campaignType,
}: {
  result: EngagementResult;
  campaignType?: CampaignType;
}) {
  if (result.actionLabel === "insufficient_data") {
    return (
      <div className="space-y-2">
        <div className="text-[13px] font-semibold text-[#1d1d1f]">
          Nedostatek dat
        </div>
        <p className="text-[12px] text-[#86868b] leading-relaxed">
          {result.filterReason === "low_spend"
            ? "Kreativa nemá dostatek útraty pro výpočet skóre. Potřeba: útrata ≥ 2× CPA cíl."
            : result.filterReason === "low_clicks"
              ? "Kreativa nemá dostatek kliků pro výpočet skóre. Potřeba: ≥ 50 link kliků."
              : "Kreativa nemá dostatek dat pro výpočet skóre."}
        </p>
      </div>
    );
  }

  const categoryOrder: Array<keyof CategoryScores> =
    result.format === "video"
      ? ["attention", "retention", "efficiency", "performance"]
      : ["attention", "efficiency", "performance"];

  // Group metrics by category
  const byCategory = new Map<keyof CategoryScores, MetricDetail[]>();
  for (const d of result.metricDetails) {
    const arr = byCategory.get(d.category) || [];
    arr.push(d);
    byCategory.set(d.category, arr);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold text-[#1d1d1f]">
          Skóre: {Math.round(result.engagementScore!)}
          <span className="ml-1.5 text-[11px] font-normal text-[#86868b]">
            ({actionLabelCz(result.actionLabel)})
          </span>
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: scoreColor(result.engagementScore!) + "20",
            color: scoreColor(result.engagementScore!),
          }}
        >
          {result.format === "video" ? "Video" : "Obrázek"}
        </span>
      </div>

      {/* Category breakdown */}
      {categoryOrder.map((cat) => {
        const catScore = result.categories[cat];
        if (catScore === null) return null;
        const metrics = byCategory.get(cat) || [];
        const weight = result.categoryWeights[cat];
        const weightPct = weight ? Math.round(weight * 100) : 0;

        return (
          <div key={cat} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#1d1d1f] uppercase tracking-wide">
                {CATEGORY_LABELS[cat]}
                <span className="ml-1 font-normal text-[#86868b] normal-case tracking-normal">
                  ({weightPct} %)
                </span>
              </span>
              <span
                className="text-[12px] font-bold tabular-nums"
                style={{ color: scoreColor(Math.round(catScore)) }}
              >
                {Math.round(catScore)}
              </span>
            </div>
            {/* Bar */}
            <div className="h-1.5 w-full rounded-full bg-[#f5f5f7] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, catScore))}%`,
                  backgroundColor: scoreColor(Math.round(catScore)),
                }}
              />
            </div>
            {/* Metrics */}
            <div className="space-y-0.5 pl-1">
              {metrics.map((m) => (
                <div
                  key={m.metric}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-[#86868b]">
                    {METRIC_LABELS[m.metric]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#1d1d1f] tabular-nums">
                      {formatValue(m.rawValue, m.unit)}
                    </span>
                    <span
                      className="font-semibold tabular-nums w-6 text-right"
                      style={{
                        color: scoreColor(Math.round(m.normalizedScore)),
                      }}
                    >
                      {Math.round(m.normalizedScore)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Footer info */}
      <div className="border-t border-[#e5e5ea] pt-2 space-y-0.5">
        {campaignType && (
          <div className="text-[10px] text-[#86868b]">
            Kampaň: {campaignType}
          </div>
        )}
        {result.usedFallback && (
          <div className="text-[10px] text-[#86868b]">
            Benchmark: {result.effectiveCampaignType}{" "}
            ({result.fallbackReason ?? "fallback"})
          </div>
        )}
      </div>
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

  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div
      className={cn("inline-flex flex-col items-center relative", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className={cn(
          "rounded-full flex items-center justify-center shadow-sm border cursor-pointer",
          text
        )}
        style={{
          width: w,
          height: w,
          backgroundColor: color.bg,
          color: color.fg,
          borderColor: color.border,
        }}
      >
        {label}
      </div>
      {showCategoryBars && <CategoryBars cats={result.categories} />}

      {/* Hover popover */}
      {open && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-white rounded-xl shadow-xl border border-[#e5e5ea] animate-in fade-in-0 zoom-in-95 duration-100"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <ScoreBreakdown result={result} campaignType={campaignType} />
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2.5 h-2.5 bg-white border-r border-b border-[#e5e5ea] rotate-45 -translate-y-1.5" />
          </div>
        </div>
      )}
    </div>
  );
}
