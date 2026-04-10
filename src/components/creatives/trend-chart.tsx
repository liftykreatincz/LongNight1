"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyInsightRow } from "@/hooks/useDailyInsights";

type MetricKey = keyof Omit<DailyInsightRow, "date">;

const METRIC_OPTIONS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "ctr", label: "CTR", unit: "%" },
  { key: "cpm", label: "CPM", unit: "Kč" },
  { key: "spend", label: "Útrata", unit: "Kč" },
  { key: "frequency", label: "Frekvence", unit: "×" },
  { key: "impressions", label: "Zobrazení", unit: "" },
  { key: "clicks", label: "Kliky", unit: "" },
  { key: "purchases", label: "Nákupy", unit: "" },
  { key: "link_clicks", label: "Link kliky", unit: "" },
];

interface Props {
  data: DailyInsightRow[];
  defaultMetric?: MetricKey;
  className?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function formatValue(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(2)} %`;
  if (unit === "Kč") return `${Math.round(value)} Kč`;
  if (unit === "×") return value.toFixed(1);
  return Math.round(value).toLocaleString("cs-CZ");
}

export function TrendChart({ data, defaultMetric = "ctr", className }: Props) {
  const [metric, setMetric] = useState<MetricKey>(defaultMetric);
  const option = METRIC_OPTIONS.find((o) => o.key === metric)!;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
          Trend za 30 dní
        </h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="text-[13px] border border-[#d2d2d7] rounded-lg px-2.5 py-1.5 bg-white text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
        >
          {METRIC_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0071e3" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#0071e3" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#86868b" }}
            axisLine={{ stroke: "#e5e5ea" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#86868b" }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            formatter={(value) => [
              formatValue(Number(value), option.unit),
              option.label,
            ]}
            labelFormatter={(label) => formatDate(String(label))}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #d2d2d7",
              fontSize: 13,
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="#0071e3"
            strokeWidth={2}
            fill="url(#trendGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#0071e3" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
