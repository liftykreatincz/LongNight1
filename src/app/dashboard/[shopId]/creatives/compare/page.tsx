"use client";

import { useState, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  Plus,
  X,
  Play,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  useCreativeAnalysis,
  type CreativeRow,
} from "@/hooks/useCreativeAnalysis";
import { useShopBenchmarks } from "@/hooks/useShopBenchmarks";
import { useShopCpaTarget } from "@/hooks/useShopCpaTarget";
import {
  scoreCreative,
  creativeRowToScoreInput,
} from "@/lib/engagement-score";
import { EngagementBadge } from "@/components/creatives/engagement-badge";
import { FatigueBadge } from "@/components/creatives/fatigue-badge";
import { CreativePickerModal } from "@/components/creatives/creative-picker-modal";

const COLORS = ["#0071e3", "#ff9f0a", "#34c759", "#af52de"];

const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const fmtDec = (n: number) => n.toFixed(2).replace(".", ",");

type MetricKey =
  | "ctr"
  | "cpm"
  | "spend"
  | "frequency"
  | "impressions"
  | "clicks"
  | "purchases"
  | "link_clicks";

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

interface DiffRow {
  label: string;
  key: keyof CreativeRow;
  format: (v: number) => string;
  higherIsBetter: boolean;
}

const DIFF_ROWS: DiffRow[] = [
  { label: "Útrata", key: "spend", format: (v) => `${fmt(v)} Kč`, higherIsBetter: false },
  { label: "Nákupy", key: "purchases", format: (v) => fmt(v), higherIsBetter: true },
  { label: "ROAS", key: "roas", format: (v) => `${v.toFixed(1)}×`, higherIsBetter: true },
  { label: "CTR", key: "ctr", format: (v) => `${fmtDec(v)} %`, higherIsBetter: true },
  { label: "CPC", key: "cpc", format: (v) => `${fmtDec(v)} Kč`, higherIsBetter: false },
  { label: "CPM", key: "cpm", format: (v) => `${fmtDec(v)} Kč`, higherIsBetter: false },
  { label: "Frekvence", key: "frequency", format: (v) => v.toFixed(1), higherIsBetter: false },
  { label: "Zobrazení", key: "impressions", format: (v) => fmt(v), higherIsBetter: true },
  { label: "Reach", key: "reach", format: (v) => fmt(v), higherIsBetter: true },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
        <span className="h-1 w-1 rounded-full bg-emerald-500" />
        Aktivní
      </span>
    );
  if (s === "paused")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
        Pozast.
      </span>
    );
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200/60">
      Archiv.
    </span>
  );
}

export default function ComparePage() {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawIds = searchParams.get("ids") ?? "";
  const ids = rawIds.split(",").filter(Boolean);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [chartMetric, setChartMetric] = useState<MetricKey>("ctr");

  const { data: creatives, isLoading } = useCreativeAnalysis(shopId);
  const { data: benchmarks } = useShopBenchmarks(shopId);
  const cpaResult = useShopCpaTarget(shopId, creatives);

  // Fetch daily data for all selected ads in one query
  const supabase = createClient();
  const { data: allDailyRaw } = useQuery({
    queryKey: ["daily-insights-compare", shopId, ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("meta_ad_creative_daily")
        .select(
          "ad_id,date,impressions,clicks,ctr,cpm,spend,frequency,purchases,link_clicks"
        )
        .eq("shop_id", shopId)
        .in("ad_id", ids)
        .order("date", { ascending: true });
      return data ?? [];
    },
  });

  // Group daily data by ad_id
  const dailyByAd = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const row of allDailyRaw ?? []) {
      const r = row as Record<string, unknown>;
      const adId = r.ad_id as string;
      const arr = map.get(adId) || [];
      arr.push(r);
      map.set(adId, arr);
    }
    return map;
  }, [allDailyRaw]);

  // Selected creatives
  const selected = useMemo(() => {
    if (!creatives) return [];
    return ids
      .map((id) => creatives.find((c) => c.adId === id))
      .filter((c): c is CreativeRow => c !== undefined);
  }, [creatives, ids]);

  // Build merged chart data: array of { date, ad1_ctr, ad2_ctr, ... }
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();
    for (const c of selected) {
      const daily = dailyByAd.get(c.adId) ?? [];
      for (const row of daily) {
        const date = row.date as string;
        const entry = dateMap.get(date) || { _date: 0 };
        entry[c.adId] = Number(row[chartMetric] ?? 0);
        dateMap.set(date, entry);
      }
    }
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [selected, dailyByAd, chartMetric]);

  const chartOption = METRIC_OPTIONS.find((o) => o.key === chartMetric)!;

  const updateIds = (newIds: string[]) => {
    router.push(
      `/dashboard/${shopId}/creatives/compare?ids=${newIds.join(",")}`
    );
  };

  const addCreative = (adId: string) => {
    if (ids.length < 4 && !ids.includes(adId)) {
      updateIds([...ids, adId]);
    }
    setPickerOpen(false);
  };

  const removeCreative = (adId: string) => {
    const newIds = ids.filter((id) => id !== adId);
    if (newIds.length === 0) {
      router.push(`/dashboard/${shopId}/creatives`);
    } else {
      updateIds(newIds);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-[#86868b]" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/dashboard/${shopId}/creatives`)}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#0071e3] hover:text-[#0077ed] font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na přehled
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-bold text-[#1d1d1f]">
            Porovnání kreativ
          </h1>
          {ids.length < 4 && (
            <button
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Přidat
            </button>
          )}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5ea] bg-[#f5f5f7] px-4 py-12 text-center">
          <p className="text-[15px] text-[#86868b]">
            Žádné kreativy k porovnání.
          </p>
          <button
            onClick={() => setPickerOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0071e3] hover:text-[#0077ed]"
          >
            <Plus className="h-4 w-4" />
            Přidat kreativu
          </button>
        </div>
      ) : (
        <>
          {/* Side-by-side cards */}
          <div className="flex gap-4 overflow-x-auto pb-2">
            {selected.map((c, i) => {
              const engagement =
                benchmarks
                  ? scoreCreative(
                      creativeRowToScoreInput(c),
                      benchmarks,
                      cpaResult.value
                    )
                  : null;
              return (
                <div
                  key={c.adId}
                  className="relative min-w-[260px] max-w-[300px] flex-1 rounded-xl border border-[#e5e5ea] bg-white p-4 space-y-2.5"
                  style={{ borderTopColor: COLORS[i], borderTopWidth: 3 }}
                >
                  <button
                    onClick={() => removeCreative(c.adId)}
                    className="absolute top-2 right-2 p-1 rounded-lg hover:bg-[#f5f5f7] transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-[#86868b]" />
                  </button>

                  {/* Thumbnail */}
                  <div className="w-full h-32 rounded-lg overflow-hidden bg-[#f5f5f7] flex items-center justify-center border border-[#e5e5ea]">
                    {c.thumbnailUrl ? (
                      <img
                        src={c.thumbnailUrl}
                        alt={c.adName}
                        className="w-full h-full object-cover"
                      />
                    ) : c.creativeType === "video" ? (
                      <Play className="h-8 w-8 text-[#86868b]" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-[#86868b]" />
                    )}
                  </div>

                  <p className="text-[13px] font-semibold text-[#1d1d1f] truncate">
                    {c.adName}
                  </p>
                  <p className="text-[11px] text-[#86868b] truncate">
                    {c.campaignName}
                  </p>

                  <div className="flex items-center gap-2">
                    {statusBadge(c.status)}
                    {engagement && (
                      <EngagementBadge
                        result={engagement}
                        size="sm"
                        campaignType={c.campaignType}
                      />
                    )}
                    <FatigueBadge
                      score={c.fatigueScore}
                      signal={c.fatigueSignal}
                    />
                  </div>

                  {/* Mini metrics */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#86868b]">Spend</span>
                      <span className="text-[#1d1d1f] tabular-nums font-medium">
                        {fmt(c.spend)} Kč
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868b]">Nákupy</span>
                      <span className="text-[#1d1d1f] tabular-nums font-medium">
                        {fmt(c.purchases)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868b]">ROAS</span>
                      <span className="text-[#1d1d1f] tabular-nums font-medium">
                        {c.roas.toFixed(1)}×
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868b]">CTR</span>
                      <span className="text-[#1d1d1f] tabular-nums font-medium">
                        {fmtDec(c.ctr)} %
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868b]">CPC</span>
                      <span className="text-[#1d1d1f] tabular-nums font-medium">
                        {fmtDec(c.cpc)} Kč
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868b]">CPM</span>
                      <span className="text-[#1d1d1f] tabular-nums font-medium">
                        {fmtDec(c.cpm)} Kč
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overlay Trend Chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-[#e5e5ea] bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
                  Trend porovnání
                </h3>
                <select
                  value={chartMetric}
                  onChange={(e) =>
                    setChartMetric(e.target.value as MetricKey)
                  }
                  className="text-[13px] border border-[#d2d2d7] rounded-lg px-2.5 py-1.5 bg-white text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
                >
                  {METRIC_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
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
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #d2d2d7",
                      fontSize: 13,
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const c = selected.find((s) => s.adId === value);
                      return c ? c.adName : value;
                    }}
                  />
                  {selected.map((c, i) => (
                    <Line
                      key={c.adId}
                      type="monotone"
                      dataKey={c.adId}
                      name={c.adId}
                      stroke={COLORS[i]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Diff Table */}
          <div className="rounded-xl border border-[#e5e5ea] bg-white overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#e5e5ea] bg-[#f5f5f7]">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                    Metrika
                  </th>
                  {selected.map((c, i) => (
                    <th
                      key={c.adId}
                      className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: COLORS[i] }}
                    >
                      <span className="truncate block max-w-[150px] ml-auto">
                        {c.adName}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIFF_ROWS.map((row) => {
                  const values = selected.map(
                    (c) => Number(c[row.key]) || 0
                  );
                  const best = row.higherIsBetter
                    ? Math.max(...values)
                    : Math.min(...values);
                  const worst = row.higherIsBetter
                    ? Math.min(...values)
                    : Math.max(...values);

                  return (
                    <tr
                      key={row.key}
                      className="border-b border-[#e5e5ea] last:border-b-0"
                    >
                      <td className="px-4 py-2 text-[#86868b] font-medium">
                        {row.label}
                      </td>
                      {selected.map((c) => {
                        const v = Number(c[row.key]) || 0;
                        const isBest =
                          values.length > 1 && v === best;
                        const isWorst =
                          values.length > 1 && v === worst && v !== best;
                        return (
                          <td
                            key={c.adId}
                            className={`px-4 py-2 text-right tabular-nums font-medium ${
                              isBest
                                ? "text-emerald-600"
                                : isWorst
                                  ? "text-red-500"
                                  : "text-[#1d1d1f]"
                            }`}
                          >
                            {row.format(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Picker modal */}
      {pickerOpen && creatives && (
        <CreativePickerModal
          creatives={creatives}
          excludeIds={ids}
          onSelect={addCreative}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
