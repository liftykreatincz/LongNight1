"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import type { BudgetRow } from "@/lib/budget-allocation";

interface Props {
  rows: BudgetRow[];
  shopId: string;
}

const SIGNAL_COLORS: Record<string, string> = {
  none: "#22c55e",
  rising: "#eab308",
  fatigued: "#f97316",
  critical: "#ef4444",
};

function getColor(signal: string | null): string {
  return SIGNAL_COLORS[signal ?? "none"] ?? SIGNAL_COLORS.none;
}

export function BudgetBubbleChart({ rows, shopId }: Props) {
  const router = useRouter();

  const data = rows.map((r) => ({
    x: r.spend,
    y: r.roas,
    z: Math.max(r.purchases, 1),
    name: r.adName,
    adId: r.adId,
    signal: r.fatigueSignal,
    purchases: r.purchases,
  }));

  return (
    <div className="rounded-2xl border border-[#e5e5e7] bg-white p-4">
      <h3 className="mb-3 text-[13px] font-semibold text-[#1d1d1f]">
        Spend vs ROAS
      </h3>
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <XAxis
            dataKey="x"
            name="Spend"
            type="number"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${Math.round(v)} Kc`}
          />
          <YAxis
            dataKey="y"
            name="ROAS"
            type="number"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}x`}
          />
          <ZAxis dataKey="z" range={[40, 400]} name="Purchases" />
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const d = payload[0].payload as (typeof data)[0];
              return (
                <div className="rounded-lg border border-[#e5e5e7] bg-white px-3 py-2 text-[12px] shadow-lg">
                  <p className="font-medium text-[#1d1d1f]">{d.name}</p>
                  <p className="text-[#86868b]">
                    Spend: {Math.round(d.x)} Kc &middot; ROAS: {d.y.toFixed(1)}x
                  </p>
                  <p className="text-[#86868b]">Nakupy: {d.purchases}</p>
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            cursor="pointer"
            onClick={(entry: unknown) => {
              const d = entry as { adId?: string } | null;
              if (d?.adId) {
                router.push(`/dashboard/${shopId}/creatives/${d.adId}`);
              }
            }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={getColor(d.signal)} fillOpacity={0.75} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-[#86868b]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
          Fresh
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#eab308]" />
          Rising
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f97316]" />
          Fatigued
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
          Critical
        </span>
      </div>
    </div>
  );
}
