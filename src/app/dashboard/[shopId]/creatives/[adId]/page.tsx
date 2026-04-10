"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Swords,
  Play,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

import { useCreativeAnalysis } from "@/hooks/useCreativeAnalysis";
import { useDailyInsights } from "@/hooks/useDailyInsights";
import { useShopBenchmarks } from "@/hooks/useShopBenchmarks";
import { useShopCpaTarget } from "@/hooks/useShopCpaTarget";
import {
  scoreCreative,
  creativeRowToScoreInput,
} from "@/lib/engagement-score";
import { EngagementBadge } from "@/components/creatives/engagement-badge";
import { FatigueBadge } from "@/components/creatives/fatigue-badge";
import { TrendChart } from "@/components/creatives/trend-chart";
import { MetricStatCard } from "@/components/creatives/metric-stat-card";

const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const fmtDec = (n: number) => n.toFixed(2).replace(".", ",");

function statusBadge(status: string) {
  switch (status.toLowerCase()) {
    case "active":
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
          Aktivni
        </span>
      );
    case "paused":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
          Pozastavena
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-500">
          Archivovana
        </span>
      );
  }
}

function typeBadge(creativeType: string) {
  const isVideo = creativeType === "video";
  return (
    <span className="inline-flex items-center rounded-full bg-[#f5f5f7] px-2.5 py-0.5 text-[11px] font-semibold text-[#86868b]">
      {isVideo ? "Video" : "Obrazek"}
    </span>
  );
}

export default function CreativeDetailPage() {
  const params = useParams<{ shopId: string; adId: string }>();
  const shopId = params.shopId;
  const adId = params.adId;

  const { data: creatives, isLoading } = useCreativeAnalysis(shopId);
  const { data: dailyData, isLoading: dailyLoading } = useDailyInsights(
    shopId,
    adId
  );
  const { data: benchmarks } = useShopBenchmarks(shopId);
  const cpaResult = useShopCpaTarget(shopId, creatives);

  const c = creatives?.find((cr) => cr.adId === adId);

  const engagement =
    c && benchmarks
      ? scoreCreative(
          creativeRowToScoreInput(c),
          benchmarks,
          cpaResult.value
        )
      : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-[#86868b]" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <p className="text-[15px] text-[#86868b]">Kreativa nenalezena</p>
        <Link
          href={`/dashboard/${shopId}/creatives`}
          className="text-[13px] text-[#0071e3] hover:underline"
        >
          Zpet na prehled
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Navigation bar */}
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/${shopId}/creatives`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0071e3] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpet na prehled
        </Link>
        <Link
          href={`/dashboard/${shopId}/creatives/compare?ids=${adId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#0071e3] hover:underline"
        >
          <Swords className="h-4 w-4" />
          Porovnat
        </Link>
      </div>

      {/* 2. Header */}
      <div className="flex gap-6">
        {/* Thumbnail */}
        <div className="shrink-0 w-48 h-48 rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea] overflow-hidden flex items-center justify-center">
          {c.thumbnailUrl ? (
            <img
              src={c.thumbnailUrl}
              alt={c.adName}
              className="w-full h-full object-cover"
            />
          ) : c.creativeType === "video" ? (
            <Play className="h-10 w-10 text-[#86868b]" />
          ) : (
            <ImageIcon className="h-10 w-10 text-[#86868b]" />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col justify-center gap-2 min-w-0">
          <h1 className="text-[20px] font-bold text-[#1d1d1f] leading-tight truncate">
            {c.adName}
          </h1>
          <p className="text-[13px] text-[#86868b] truncate">
            {c.campaignName}
          </p>
          <p className="text-[13px] text-[#86868b] truncate">{c.adsetName}</p>

          <div className="flex items-center gap-2 flex-wrap mt-1">
            {statusBadge(c.status)}
            {typeBadge(c.creativeType)}
            {engagement && (
              <EngagementBadge
                result={engagement}
                size="lg"
                campaignType={c.campaignType}
              />
            )}
            <FatigueBadge
              score={c.fatigueScore}
              signal={c.fatigueSignal}
              dailyData={dailyData?.map((d) => ({ date: d.date, ctr: d.ctr }))}
            />
          </div>
        </div>
      </div>

      {/* 3. Key metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <MetricStatCard label="Utrata" value={`${fmt(c.spend)} Kc`} />
        <MetricStatCard label="Nakupy" value={fmt(c.purchases)} />
        <MetricStatCard label="ROAS" value={`${fmtDec(c.roas)}x`} />
        <MetricStatCard label="CTR" value={`${fmtDec(c.ctr)} %`} />
        <MetricStatCard label="CPC" value={`${fmtDec(c.cpc)} Kc`} />
        <MetricStatCard label="CPM" value={`${fmt(c.cpm)} Kc`} />
        <MetricStatCard label="Frekvence" value={fmtDec(c.frequency)} />
      </div>

      {/* 4. Trend chart */}
      <div className="rounded-2xl border border-[#e5e5ea] bg-white p-5">
        {dailyLoading ? (
          <div className="flex items-center justify-center h-[320px]">
            <Loader2 className="h-5 w-5 animate-spin text-[#86868b]" />
          </div>
        ) : dailyData && dailyData.length > 0 ? (
          <TrendChart data={dailyData} />
        ) : (
          <div className="flex items-center justify-center h-[320px]">
            <p className="text-[13px] text-[#86868b]">Zadna denni data</p>
          </div>
        )}
      </div>

      {/* 5. AI Analysis section */}
      {c.aiAnalysis && (
        <div className="rounded-2xl border border-[#e5e5ea] bg-white p-5 space-y-4">
          <h2 className="text-[17px] font-semibold text-[#1d1d1f]">
            AI Analyza
          </h2>

          <p className="text-[14px] text-[#1d1d1f] leading-relaxed">
            {c.aiAnalysis.summary}
          </p>

          {c.aiAnalysis.strengths.length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold text-green-600 mb-1.5">
                Silne stranky
              </h3>
              <ul className="space-y-1">
                {c.aiAnalysis.strengths.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-[#1d1d1f]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {c.aiAnalysis.weaknesses.length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold text-red-500 mb-1.5">
                Slabe stranky
              </h3>
              <ul className="space-y-1">
                {c.aiAnalysis.weaknesses.map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-[#1d1d1f]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {c.aiAnalysis.recommendations.length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold text-[#0071e3] mb-1.5">
                Doporuceni
              </h3>
              <ul className="space-y-1">
                {c.aiAnalysis.recommendations.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-[#1d1d1f]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0071e3]" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
