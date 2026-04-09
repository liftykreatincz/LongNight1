"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  Search,
  Image as ImageIcon,
  Play,
  Video,
  Camera,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Sparkles,
  Check,
  XCircle,
  Lightbulb,
  Brain,
  LayoutGrid,
  Table as TableIcon,
  Swords,
  ListTree,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  useCreativeAnalysis,
  useSyncCreatives,
} from "@/hooks/useCreativeAnalysis";
import { useAnalyzeCreative } from "@/hooks/useAnalyzeCreative";
import type {
  CreativeRow,
  CreativeAnalysis,
} from "@/hooks/useCreativeAnalysis";
import { CreativeMetaAnalysisSheet } from "@/components/creatives/CreativeMetaAnalysisSheet";
import { AI_ACTION_ESTIMATES } from "@/lib/ai-pricing";
import { CreativesTreeView } from "./creatives-tree-view";

/* ── Helpers ── */

const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const fmtDec = (n: number) => n.toFixed(2).replace(".", ",");

type StatusFilter = "all" | "active" | "paused" | "archived";
type TypeFilter = "all" | "video" | "image";
type SortKey = "spend" | "ctr" | "roas" | "purchases" | "cpc" | "cpm";

const statusLabels: Record<StatusFilter, string> = {
  all: "Vše",
  active: "Aktivní",
  paused: "Pozastavené",
  archived: "Archivované",
};

const typeLabels: Record<TypeFilter, string> = {
  all: "Vše",
  video: "Video",
  image: "Fotka",
};

const sortLabels: Record<SortKey, string> = {
  purchases: "Nákupy",
  spend: "Útrata",
  roas: "ROAS",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Aktivní
      </span>
    );
  if (s === "paused")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pozastavené
      </span>
    );
  if (s === "archived")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]/60">
        <span className="h-1.5 w-1.5 rounded-full bg-[#86868b]" />
        Archivované
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#6e6e73] border border-[#d2d2d7]/60">
      <span className="h-1.5 w-1.5 rounded-full bg-[#86868b]" />
      {status}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "–";
  try {
    return format(parseISO(dateStr), "d.M.yyyy", { locale: cs });
  } catch {
    return "–";
  }
}

/* ── Small Components ── */

function SmallStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#d2d2d7]/60 bg-white p-4 flex flex-col gap-1 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <p className="text-[10px] text-[#86868b] font-bold uppercase tracking-[0.08em]">
        {label}
      </p>
      <p className="text-2xl font-extrabold text-[#1d1d1f] tracking-[-0.02em]">
        {value}
      </p>
      {sub && <p className="text-xs text-[#86868b]">{sub}</p>}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[#6e6e73]">{label}</span>
      <span className="font-semibold text-[#1d1d1f]">{value}</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 4
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-bold px-2.5 py-1 rounded-lg border",
        color
      )}
    >
      {score}/10
    </span>
  );
}

/* ── Media Modal ── */

function MediaModal({
  creative,
  onClose,
}: {
  creative: CreativeRow;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[101] text-white/80 hover:text-white transition-colors"
        aria-label="Zavřít"
      >
        <X className="h-8 w-8" />
      </button>
      <div
        className="relative max-w-4xl max-h-[90vh] w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {creative.creativeType === "video" && creative.videoUrl ? (
          <video
            src={creative.videoUrl}
            controls
            autoPlay
            className="w-full max-h-[85vh] rounded-xl bg-black"
          />
        ) : creative.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={creative.thumbnailUrl}
            alt={creative.adName}
            className="w-full max-h-[85vh] object-contain rounded-xl"
          />
        ) : (
          <div className="flex items-center justify-center h-64 bg-white rounded-xl">
            <ImageIcon className="h-16 w-16 text-[#86868b]" />
          </div>
        )}
        <p className="text-white/90 text-sm text-center mt-3 truncate">
          {creative.adName}
        </p>
      </div>
    </div>
  );
}

/* ── AI Analysis Panel ── */

function AnalysisPanel({ analysis }: { analysis: CreativeAnalysis }) {
  return (
    <div className="mt-2 pt-3 border-t border-[#d2d2d7]/60 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#1d1d1f] uppercase tracking-[0.08em] flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          AI analýza
        </p>
        <ScoreBadge score={analysis.score} />
      </div>

      <p className="text-xs text-[#1d1d1f] leading-relaxed">
        {analysis.summary}
      </p>

      <div>
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
          Vizuální analýza
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {analysis.visual_analysis}
        </p>
      </div>

      <div>
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
          Analýza textu
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {analysis.copy_analysis}
        </p>
      </div>

      {analysis.strengths.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.08em] mb-1">
            Silné stránky
          </p>
          <ul className="space-y-1">
            {analysis.strengths.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-[#6e6e73]"
              >
                <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.weaknesses.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-red-700 uppercase tracking-[0.08em] mb-1">
            Slabé stránky
          </p>
          <ul className="space-y-1">
            {analysis.weaknesses.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-[#6e6e73]"
              >
                <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.recommendations.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-[#0071e3] uppercase tracking-[0.08em] mb-1">
            Doporučení
          </p>
          <ul className="space-y-1">
            {analysis.recommendations.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-[#6e6e73]"
              >
                <Lightbulb className="h-3.5 w-3.5 text-[#0071e3] mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
          Srovnání s průměrem
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {analysis.vs_average}
        </p>
      </div>

      {analysis.video_analysis && (
        <div>
          <p className="text-[10px] font-bold text-[#0071e3] uppercase tracking-[0.08em] mb-1">
            Video analýza
          </p>
          <div className="space-y-0.5">
            <MetricRow label="Hook (3s)" value={analysis.video_analysis.hook} />
            <MetricRow label="Tempo" value={analysis.video_analysis.pacing} />
            <MetricRow label="Mluvčí" value={analysis.video_analysis.speaker} />
            <MetricRow
              label="Titulky"
              value={analysis.video_analysis.subtitles}
            />
            <MetricRow label="CTA" value={analysis.video_analysis.cta} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Creative Card ── */

function CreativeCard({
  creative: c,
  expanded,
  onToggle,
  onMediaClick,
  analyzeMutation,
  selected,
  onToggleSelected,
}: {
  creative: CreativeRow;
  expanded: boolean;
  onToggle: () => void;
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
  analyzeMutation: ReturnType<typeof useAnalyzeCreative>;
  selected: boolean;
  onToggleSelected: (adId: string) => void;
}) {
  const hasPlayableVideo = c.creativeType === "video" && c.videoUrl;
  const hasClickableImage = c.creativeType === "image" && c.thumbnailUrl;
  const isClickable = hasPlayableVideo || hasClickableImage;

  const isAnalyzing =
    analyzeMutation.isPending && analyzeMutation.variables === c.adId;
  const hasAnalysis = c.aiAnalysis !== null;

  const handleAnalyze = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAnalyzing) return;

    if (hasAnalysis && !expanded) {
      onToggle();
      return;
    }

    analyzeMutation.mutate(c.adId, {
      onSuccess: () => {
        toast.success("AI analýza dokončena");
        if (!expanded) onToggle();
      },
      onError: (err: Error) => {
        toast.error(`Chyba analýzy: ${err.message}`);
      },
    });
  };

  return (
    <div
      onClick={onToggle}
      className={cn(
        "rounded-2xl border bg-white overflow-hidden cursor-pointer transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        selected
          ? "border-[#0071e3] ring-2 ring-[#0071e3]/20 shadow-[0_8px_24px_rgba(0,113,227,0.12)]"
          : "border-[#d2d2d7]/60 hover:border-[#0071e3]/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
      )}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center group">
        {c.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={c.thumbnailUrl}
            alt={c.adName}
            className="object-cover w-full h-full"
          />
        ) : (
          <ImageIcon className="h-10 w-10 text-[#86868b]" />
        )}

        {/* Selection checkbox */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelected(c.adId);
          }}
          className={cn(
            "absolute top-2 left-2 z-10 h-6 w-6 rounded-md border-2 flex items-center justify-center transition-all",
            selected
              ? "bg-[#0071e3] border-[#0071e3] text-white"
              : "bg-white/90 border-white/90 hover:bg-white backdrop-blur-sm shadow-sm"
          )}
          title={selected ? "Odebrat z výběru" : "Přidat do výběru"}
          aria-pressed={selected}
        >
          {selected && <Check className="h-4 w-4" />}
        </button>

        {/* Clickable overlay */}
        {isClickable && (
          <button
            onClick={(e) => onMediaClick(c, e)}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors"
            title={hasPlayableVideo ? "Přehrát video" : "Zobrazit fotku"}
          >
            {hasPlayableVideo ? (
              <div className="h-14 w-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="h-7 w-7 text-[#1d1d1f] ml-1" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-full bg-white/95 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <Search className="h-5 w-5 text-[#1d1d1f]" />
              </div>
            )}
          </button>
        )}

        {/* Type badge */}
        <div className="absolute bottom-2 left-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md",
              c.creativeType === "video"
                ? "bg-[#0071e3]/90 text-white"
                : "bg-white/90 text-[#1d1d1f]"
            )}
          >
            {c.creativeType === "video" ? (
              <>
                <Video className="h-3 w-3" /> Video
              </>
            ) : (
              <>
                <Camera className="h-3 w-3" /> Fotka
              </>
            )}
          </span>
        </div>

        {/* AI Analyze button */}
        <button
          onClick={handleAnalyze}
          className={cn(
            "absolute top-2 right-2 h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-sm",
            isAnalyzing
              ? "bg-amber-500/90"
              : hasAnalysis
                ? "bg-amber-500/90 hover:bg-amber-500"
                : "bg-white/90 hover:bg-white"
          )}
          title={hasAnalysis ? "Zobrazit AI analýzu" : "Analyzovat kreativu"}
        >
          {isAnalyzing ? (
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          ) : (
            <Sparkles
              className={cn(
                "h-4 w-4",
                hasAnalysis ? "text-white fill-white" : "text-[#1d1d1f]"
              )}
            />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="font-bold text-sm text-[#1d1d1f] tracking-tight truncate">
          {c.adName}
        </p>
        <p className="text-xs text-[#6e6e73] truncate">
          Kampaň: {c.campaignName}
        </p>
        <p className="text-xs text-[#86868b]">
          {formatDate(c.dateStart)} – {formatDate(c.dateStop)}
        </p>
        <div className="flex items-center gap-2">
          {statusBadge(c.status)}
          {hasAnalysis && <ScoreBadge score={c.aiAnalysis!.score} />}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="px-3 pb-3 space-y-0.5">
        <MetricRow label="Nákupy" value={fmt(c.purchases)} />
        <MetricRow label="Útrata" value={`${fmt(c.spend)} Kč`} />
        <MetricRow label="CTR" value={`${fmtDec(c.ctr)} %`} />
        <MetricRow label="CPC" value={`${fmtDec(c.cpc)} Kč`} />
        <MetricRow label="ROAS" value={`${c.roas.toFixed(1)}×`} />
        <MetricRow label="CPP" value={`${fmtDec(c.costPerPurchase)} Kč`} />
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-[#d2d2d7]/60 pt-2 space-y-0.5">
            <MetricRow label="Zobrazení" value={fmt(c.impressions)} />
            <MetricRow label="Dosah" value={fmt(c.reach)} />
            <MetricRow label="CPM" value={`${fmtDec(c.cpm)} Kč`} />
            <MetricRow label="Přidání do košíku" value={fmt(c.addToCart)} />
            <MetricRow
              label="Cena / přidání do košíku"
              value={`${fmtDec(c.costPerAddToCart)} Kč`}
            />
            <MetricRow
              label="Zahájení pokladny"
              value={fmt(c.initiateCheckout)}
            />
            {c.creativeType === "video" && (
              <>
                <MetricRow
                  label="Zhlédnutí videa (3s)"
                  value={fmt(c.videoViews3s)}
                />
                <MetricRow
                  label="Dokončená zhlédnutí"
                  value={fmt(c.videoThruplay)}
                />
              </>
            )}
            <MetricRow label="To se mi líbí" value={fmt(c.likes)} />
            <MetricRow label="Komentáře" value={fmt(c.comments)} />
            <MetricRow label="Sdílení" value={fmt(c.shares)} />
          </div>

          {c.body && (
            <div className="mt-2 pt-2 border-t border-[#d2d2d7]/60">
              <p className="text-xs text-[#86868b] font-bold uppercase tracking-[0.08em] mb-1">
                Text reklamy
              </p>
              <p className="text-xs text-[#6e6e73] whitespace-pre-line">
                {c.body}
              </p>
            </div>
          )}

          {c.aiAnalysis && <AnalysisPanel analysis={c.aiAnalysis} />}

          {!c.aiAnalysis && (
            <div className="mt-3 pt-3 border-t border-[#d2d2d7]/60">
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 rounded-full border border-[#d2d2d7] bg-white px-4 py-2 text-sm font-semibold text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]",
                  isAnalyzing && "opacity-60 cursor-not-allowed"
                )}
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-amber-500" />
                )}
                {isAnalyzing ? "Analyzuji..." : "Analyzovat kreativu (AI)"}
                {!isAnalyzing && (
                  <span className="ml-1.5 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-[#6e6e73]">
                    ~${AI_ACTION_ESTIMATES.analyze.toFixed(2)}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Table view ── */

type TableSortKey =
  | "costPerPurchase"
  | "purchases"
  | "spend"
  | "roas"
  | "ctr"
  | "cpc"
  | "impressions"
  | "hookRate"
  | "atcPerLinkClick"
  | "atcPerPageView";

const hookRate = (c: CreativeRow) =>
  c.impressions > 0 ? (c.videoViews3s / c.impressions) * 100 : 0;
const atcPerLinkClick = (c: CreativeRow) =>
  c.linkClicks > 0 ? (c.addToCart / c.linkClicks) * 100 : 0;
const atcPerPageView = (c: CreativeRow) =>
  c.landingPageViews > 0 ? (c.addToCart / c.landingPageViews) * 100 : 0;

function TableSortTh({
  label,
  active,
  arrow,
  onClick,
  emphasized,
}: {
  label: string;
  active: boolean;
  arrow: string;
  onClick: () => void;
  emphasized?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "text-right font-bold px-3 py-2.5 cursor-pointer select-none whitespace-nowrap",
        active && "text-[#1d1d1f]",
        emphasized && "text-amber-700"
      )}
    >
      {label}
      {arrow}
    </th>
  );
}

function CreativesOverviewTable({
  creatives,
  onMediaClick,
  analyzeMutation,
  selectedIds,
  onToggleSelected,
}: {
  creatives: CreativeRow[];
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
  analyzeMutation: ReturnType<typeof useAnalyzeCreative>;
  selectedIds: Set<string>;
  onToggleSelected: (adId: string) => void;
}) {
  const allVisibleSelected =
    creatives.length > 0 && creatives.every((c) => selectedIds.has(c.adId));
  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      creatives.forEach((c) => {
        if (selectedIds.has(c.adId)) onToggleSelected(c.adId);
      });
    } else {
      creatives.forEach((c) => {
        if (!selectedIds.has(c.adId)) onToggleSelected(c.adId);
      });
    }
  };

  const [sortKey, setSortKey] = useState<TableSortKey>("costPerPurchase");
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo(() => {
    const list = [...creatives];
    const getVal = (c: CreativeRow): number => {
      if (sortKey === "hookRate") return hookRate(c);
      if (sortKey === "atcPerLinkClick") return atcPerLinkClick(c);
      if (sortKey === "atcPerPageView") return atcPerPageView(c);
      return Number((c as unknown as Record<string, number>)[sortKey] ?? 0);
    };
    list.sort((a, b) => {
      if (sortKey === "costPerPurchase") {
        const aP = a.purchases || 0;
        const bP = b.purchases || 0;
        if (aP === 0 && bP === 0) return b.spend - a.spend;
        if (aP === 0) return 1;
        if (bP === 0) return -1;
      }
      const av = getVal(a);
      const bv = getVal(b);
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [creatives, sortKey, sortAsc]);

  const handleSort = (key: TableSortKey) => {
    if (sortKey === key) {
      setSortAsc((p) => !p);
    } else {
      setSortKey(key);
      setSortAsc(key === "costPerPurchase" || key === "cpc");
    }
  };

  const arrow = (key: TableSortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div className="rounded-2xl border border-[#d2d2d7]/60 bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="overflow-auto max-h-[calc(100vh-260px)]">
        <table className="w-full text-sm">
          <thead className="bg-[#f5f5f7] text-[11px] uppercase tracking-[0.06em] text-[#6e6e73] sticky top-0 z-10 backdrop-blur-sm shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
            <tr>
              <th className="px-3 py-2.5 w-10">
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center transition-colors",
                    allVisibleSelected
                      ? "bg-[#0071e3] border-[#0071e3] text-white"
                      : "border-[#d2d2d7] bg-white hover:border-[#0071e3]/50"
                  )}
                  title={allVisibleSelected ? "Odznačit vše" : "Označit vše"}
                  aria-pressed={allVisibleSelected}
                >
                  {allVisibleSelected && <Check className="h-3 w-3" />}
                </button>
              </th>
              <th className="text-left font-bold px-3 py-2.5 w-14"></th>
              <th className="text-left font-bold px-3 py-2.5 min-w-[200px]">
                Reklama
              </th>
              <th className="text-left font-bold px-3 py-2.5">AI</th>
              <TableSortTh
                label="CPP"
                active={sortKey === "costPerPurchase"}
                arrow={arrow("costPerPurchase")}
                onClick={() => handleSort("costPerPurchase")}
                emphasized
              />
              <TableSortTh
                label="Nákupy"
                active={sortKey === "purchases"}
                arrow={arrow("purchases")}
                onClick={() => handleSort("purchases")}
              />
              <TableSortTh
                label="Spend"
                active={sortKey === "spend"}
                arrow={arrow("spend")}
                onClick={() => handleSort("spend")}
              />
              <TableSortTh
                label="ROAS"
                active={sortKey === "roas"}
                arrow={arrow("roas")}
                onClick={() => handleSort("roas")}
              />
              <TableSortTh
                label="Hook rate"
                active={sortKey === "hookRate"}
                arrow={arrow("hookRate")}
                onClick={() => handleSort("hookRate")}
              />
              <TableSortTh
                label="ATC / LC"
                active={sortKey === "atcPerLinkClick"}
                arrow={arrow("atcPerLinkClick")}
                onClick={() => handleSort("atcPerLinkClick")}
              />
              <TableSortTh
                label="ATC / PV"
                active={sortKey === "atcPerPageView"}
                arrow={arrow("atcPerPageView")}
                onClick={() => handleSort("atcPerPageView")}
              />
              <TableSortTh
                label="CTR"
                active={sortKey === "ctr"}
                arrow={arrow("ctr")}
                onClick={() => handleSort("ctr")}
              />
              <TableSortTh
                label="CPC"
                active={sortKey === "cpc"}
                arrow={arrow("cpc")}
                onClick={() => handleSort("cpc")}
              />
              <TableSortTh
                label="Zobrazení"
                active={sortKey === "impressions"}
                arrow={arrow("impressions")}
                onClick={() => handleSort("impressions")}
              />
              <th className="w-10 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const zero = (c.purchases || 0) === 0;
              const hasAnalysis = c.aiAnalysis !== null;
              const score = c.aiAnalysis?.score;
              const isAnalyzing =
                analyzeMutation.isPending && analyzeMutation.variables === c.adId;
              const canClickMedia =
                (c.creativeType === "video" && c.videoUrl) ||
                (c.creativeType === "image" && c.thumbnailUrl);

              const handleAnalyzeClick = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (isAnalyzing || hasAnalysis) return;
                analyzeMutation.mutate(c.adId, {
                  onSuccess: () => toast.success("AI analýza dokončena"),
                  onError: (err: Error) =>
                    toast.error(`Chyba analýzy: ${err.message}`),
                });
              };

              const isSelected = selectedIds.has(c.adId);

              return (
                <tr
                  key={c.adId}
                  className={cn(
                    "border-t border-[#d2d2d7]/60 hover:bg-[#f5f5f7]/50 transition-colors",
                    zero && "opacity-70",
                    isSelected && "bg-[#0071e3]/5"
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelected(c.adId);
                      }}
                      className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-[#0071e3] border-[#0071e3] text-white"
                          : "border-[#d2d2d7] bg-white hover:border-[#0071e3]/50"
                      )}
                      title={isSelected ? "Odebrat z výběru" : "Přidat do výběru"}
                      aria-pressed={isSelected}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) => canClickMedia && onMediaClick(c, e)}
                      className={cn(
                        "relative block h-11 w-11 rounded-lg overflow-hidden border border-[#d2d2d7]/60 bg-[#f5f5f7] shrink-0",
                        canClickMedia && "cursor-pointer hover:ring-2 hover:ring-[#0071e3]/40"
                      )}
                    >
                      {c.thumbnailUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={c.thumbnailUrl}
                          alt={c.adName}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-[#86868b]" />
                        </div>
                      )}
                      {c.creativeType === "video" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="h-3.5 w-3.5 text-white fill-white" />
                        </div>
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2 max-w-[260px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                          c.status === "active"
                            ? "bg-emerald-500"
                            : c.status === "paused"
                              ? "bg-amber-500"
                              : "bg-[#86868b]/60"
                        )}
                      />
                      <div className="min-w-0">
                        <p
                          className="text-sm font-semibold text-[#1d1d1f] truncate"
                          title={c.adName}
                        >
                          {c.adName}
                        </p>
                        <p
                          className="text-[10px] text-[#86868b] truncate"
                          title={c.campaignName}
                        >
                          {c.campaignName}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {hasAnalysis && typeof score === "number" ? (
                      <span
                        className={cn(
                          "inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-md border",
                          score >= 7
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : score >= 4
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"
                        )}
                      >
                        {score}/10
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAnalyzeClick}
                        disabled={isAnalyzing}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-[#d2d2d7] text-[#6e6e73] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors",
                          isAnalyzing && "opacity-60 cursor-not-allowed"
                        )}
                        title="Analyzovat kreativu"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-amber-500" />
                        )}
                      </button>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-bold tabular-nums whitespace-nowrap",
                      zero ? "text-[#86868b]" : "text-[#1d1d1f]"
                    )}
                  >
                    {zero ? "—" : `${fmt(c.costPerPurchase)} Kč`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(c.purchases)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(c.spend)} Kč
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums whitespace-nowrap",
                      c.roas >= 2
                        ? "text-emerald-700"
                        : c.roas < 1
                          ? "text-red-700"
                          : ""
                    )}
                  >
                    {c.roas.toFixed(1)}×
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {c.creativeType === "video" && c.impressions > 0 ? (
                      `${fmtDec(hookRate(c))} %`
                    ) : (
                      <span className="text-[#86868b]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {c.linkClicks > 0 ? (
                      `${fmtDec(atcPerLinkClick(c))} %`
                    ) : (
                      <span className="text-[#86868b]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {c.landingPageViews > 0 ? (
                      `${fmtDec(atcPerPageView(c))} %`
                    ) : (
                      <span className="text-[#86868b]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmtDec(c.ctr)} %
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmtDec(c.cpc)} Kč
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-[#86868b]">
                    {fmt(c.impressions)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full",
                        c.creativeType === "video"
                          ? "bg-[#0071e3]/10 text-[#0071e3]"
                          : "bg-purple-500/10 text-purple-700"
                      )}
                    >
                      {c.creativeType === "video" ? (
                        <Video className="h-2.5 w-2.5" />
                      ) : (
                        <Camera className="h-2.5 w-2.5" />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main Page ── */

export default function CreativesPage() {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;

  const { data: creatives, isLoading, error } = useCreativeAnalysis(shopId);
  const syncMutation = useSyncCreatives(shopId);
  const analyzeMutation = useAnalyzeCreative(shopId);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("purchases");
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalCreative, setModalCreative] = useState<CreativeRow | null>(null);
  const [metaSheetOpen, setMetaSheetOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialScope, setInitialScope] = useState<
    "all" | "filtered" | "selected"
  >("all");
  const [viewMode, setViewMode] = useState<"grid" | "table" | "tree">(() => {
    if (typeof window === "undefined") return "grid";
    const stored = localStorage.getItem("longnight-creatives-view-mode");
    if (stored === "table") return "table";
    if (stored === "tree") return "tree";
    return "grid";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("longnight-creatives-view-mode", viewMode);
    }
  }, [viewMode]);

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data: Record<string, unknown>) => {
        const count = data?.ads_synced ?? "?";
        const insights = data?.insights_found ?? "";
        const videos = data?.videos_found ?? 0;
        toast.success(
          `Synchronizováno: ${count} kreativ${insights ? ` (${insights} s daty, ${videos} videí)` : ""}`
        );
      },
      onError: (err: Error) => {
        toast.error(`Chyba synchronizace: ${err.message}`);
      },
    });
  };

  const openMedia = useCallback((c: CreativeRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalCreative(c);
  }, []);

  const toggleSelected = useCallback((adId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(adId)) next.delete(adId);
      else next.add(adId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openMetaSheet = useCallback(
    (scope: "all" | "filtered" | "selected") => {
      setInitialScope(scope);
      setMetaSheetOpen(true);
    },
    []
  );

  const lastSync = useMemo(() => {
    if (!creatives?.length) return null;
    const sorted = [...creatives].sort(
      (a, b) => new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime()
    );
    return sorted[0]?.syncedAt ?? null;
  }, [creatives]);

  const filtered = useMemo(() => {
    if (!creatives) return [];
    let result = [...creatives];

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status.toLowerCase() === statusFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((c) => c.creativeType === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.adName.toLowerCase().includes(q) ||
          c.campaignName.toLowerCase().includes(q) ||
          c.adsetName.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? av - bv : bv - av;
    });

    return result;
  }, [creatives, statusFilter, typeFilter, searchQuery, sortKey, sortAsc]);

  const summary = useMemo(() => {
    const totalSpend = filtered.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = filtered.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = filtered.reduce((s, c) => s + c.clicks, 0);
    const totalPurchases = filtered.reduce((s, c) => s + c.purchases, 0);
    const avgCtr =
      totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgRoas =
      totalSpend > 0
        ? filtered.reduce((s, c) => s + c.roas * c.spend, 0) / totalSpend
        : 0;

    return {
      totalSpend,
      totalImpressions,
      totalPurchases,
      avgCtr,
      avgCpc,
      avgRoas,
    };
  }, [filtered]);

  const allAnalyzedCount = useMemo(
    () =>
      creatives ? creatives.filter((c) => c.aiAnalysis !== null).length : 0,
    [creatives]
  );

  const filteredAnalyzedAdIds = useMemo(
    () => filtered.filter((c) => c.aiAnalysis !== null).map((c) => c.adId),
    [filtered]
  );

  const metaFilterContext = useMemo(
    () => ({ statusFilter, typeFilter, searchQuery, sortKey, sortAsc }),
    [statusFilter, typeFilter, searchQuery, sortKey, sortAsc]
  );

  const selectedAnalyzedAdIds = useMemo(() => {
    if (!creatives || selectedIds.size === 0) return [] as string[];
    return creatives
      .filter((c) => selectedIds.has(c.adId) && c.aiAnalysis !== null)
      .map((c) => c.adId);
  }, [creatives, selectedIds]);

  const selectedMissingAnalysis = selectedIds.size - selectedAnalyzedAdIds.length;

  const typeCounts = useMemo(() => {
    if (!creatives) return { all: 0, video: 0, image: 0 };
    return {
      all: creatives.length,
      video: creatives.filter((c) => c.creativeType === "video").length,
      image: creatives.filter((c) => c.creativeType === "image").length,
    };
  }, [creatives]);

  return (
    <div className="space-y-6">
      {/* Modal */}
      {modalCreative && (
        <MediaModal
          creative={modalCreative}
          onClose={() => setModalCreative(null)}
        />
      )}

      {/* Meta-analysis sheet */}
      <CreativeMetaAnalysisSheet
        open={metaSheetOpen}
        onOpenChange={setMetaSheetOpen}
        shopId={shopId}
        allAnalyzedCount={allAnalyzedCount}
        filteredAnalyzedAdIds={filteredAnalyzedAdIds}
        selectedAnalyzedAdIds={selectedAnalyzedAdIds}
        initialScope={initialScope}
        filterContext={metaFilterContext}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm font-medium text-[#6e6e73]">
        <Link
          href="/dashboard"
          className="transition-colors hover:text-[#1d1d1f]"
        >
          Přehled
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link
          href={`/dashboard/${shopId}`}
          className="transition-colors hover:text-[#1d1d1f]"
        >
          E-shop
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#1d1d1f]">Analýza kreativ</span>
      </nav>

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-[#1d1d1f] tracking-[-0.03em] leading-none">
            Analýza kreativ
          </h1>
          {lastSync && (
            <p className="text-sm font-medium text-[#86868b] mt-3">
              Poslední sync:{" "}
              {format(parseISO(lastSync), "d.M.yyyy HH:mm", { locale: cs })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openMetaSheet("all")}
            disabled={allAnalyzedCount < 3}
            title={
              allAnalyzedCount < 3
                ? "Nejdřív analyzuj alespoň 3 kreativy"
                : "AI meta-analýza všech kreativ"
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-[#d2d2d7] bg-white px-5 py-2.5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition-colors hover:bg-[#f5f5f7]",
              allAnalyzedCount < 3 && "opacity-60 cursor-not-allowed"
            )}
          >
            <Brain className="h-4 w-4 text-amber-500" />
            AI shrnutí
            <span className="ml-1.5 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-[#6e6e73]">
              ~${AI_ACTION_ESTIMATES.metaAnalyze.toFixed(2)}
            </span>
          </button>
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-[#d2d2d7] bg-white px-5 py-2.5 text-sm font-semibold text-[#1d1d1f] shadow-sm transition-colors hover:bg-[#f5f5f7]",
              syncMutation.isPending && "opacity-60 cursor-not-allowed"
            )}
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncMutation.isPending ? "Synchronizuji..." : "Synchronizovat"}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(statusLabels) as StatusFilter[]).map((key) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold border transition-colors",
              statusFilter === key
                ? "bg-[#0071e3] text-white border-[#0071e3]"
                : "bg-white border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]"
            )}
          >
            {statusLabels[key]}
          </button>
        ))}

        <div className="w-px h-6 bg-[#d2d2d7] mx-1" />

        {(Object.keys(typeLabels) as TypeFilter[]).map((key) => {
          const Icon = key === "video" ? Video : key === "image" ? Camera : null;
          return (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition-colors",
                typeFilter === key
                  ? "bg-[#0071e3] text-white border-[#0071e3]"
                  : "bg-white border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {typeLabels[key]}
              <span className="text-xs opacity-70">({typeCounts[key]})</span>
            </button>
          );
        })}

        <div className="w-px h-6 bg-[#d2d2d7] mx-1" />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-full border border-[#d2d2d7] bg-white px-3.5 py-1.5 text-sm font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
          aria-label="Řadit podle"
        >
          {(Object.keys(sortLabels) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {sortLabels[key]}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSortAsc((p) => !p)}
          className="rounded-full border border-[#d2d2d7] bg-white p-2 text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
          title={sortAsc ? "Vzestupně" : "Sestupně"}
          aria-label={sortAsc ? "Vzestupně" : "Sestupně"}
        >
          {sortAsc ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <div className="w-px h-6 bg-[#d2d2d7] mx-1" />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
          <input
            type="text"
            placeholder="Hledat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-full border border-[#d2d2d7] bg-white pl-9 pr-3 py-1.5 text-sm text-[#1d1d1f] placeholder:text-[#86868b] w-48 focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
          />
        </div>

        <div className="w-px h-6 bg-[#d2d2d7] mx-1" />

        {/* View mode toggle */}
        <div className="inline-flex rounded-full border border-[#d2d2d7] bg-white p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3 py-1.5 transition-colors",
              viewMode === "grid"
                ? "bg-[#0071e3] text-white"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            )}
            title="Karty"
            aria-label="Karty"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3 py-1.5 transition-colors",
              viewMode === "table"
                ? "bg-[#0071e3] text-white"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            )}
            title="Tabulka"
            aria-label="Tabulka"
          >
            <TableIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("tree")}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-3 py-1.5 transition-colors",
              viewMode === "tree"
                ? "bg-[#0071e3] text-white"
                : "text-[#6e6e73] hover:text-[#1d1d1f]"
            )}
            title="Strom (kampaně → ad sety → reklamy)"
            aria-label="Strom"
          >
            <ListTree className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SmallStat
            label="Celková útrata"
            value={`${fmt(summary.totalSpend)} Kč`}
          />
          <SmallStat label="Ø CTR" value={`${fmtDec(summary.avgCtr)} %`} />
          <SmallStat label="Ø CPC" value={`${fmtDec(summary.avgCpc)} Kč`} />
          <SmallStat
            label="Celkem nákupů"
            value={fmt(summary.totalPurchases)}
          />
          <SmallStat label="Ø ROAS" value={`${summary.avgRoas.toFixed(1)}×`} />
          <SmallStat
            label="Celkem zobrazení"
            value={fmt(summary.totalImpressions)}
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#86868b]" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-semibold text-red-700">
            Chyba: {(error as Error).message}
          </p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && creatives && creatives.length === 0 && (
        <div className="rounded-2xl border border-[#d2d2d7]/60 bg-white p-10 text-center space-y-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <ImageIcon className="h-12 w-12 text-[#86868b] mx-auto" />
          <p className="text-base font-semibold text-[#1d1d1f]">
            Žádné kreativy
          </p>
          <p className="text-sm text-[#6e6e73]">
            Spusťte synchronizaci a načtěte kreativy z Meta Ads.
          </p>
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed]"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Synchronizovat
          </button>
        </div>
      )}

      {/* No results */}
      {!isLoading &&
        !error &&
        creatives &&
        creatives.length > 0 &&
        filtered.length === 0 && (
          <div className="rounded-2xl border border-[#d2d2d7]/60 bg-white p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <p className="text-sm font-medium text-[#6e6e73]">
              Žádné výsledky pro zvolené filtry
            </p>
          </div>
        )}

      {/* Card Grid */}
      {!isLoading && filtered.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <CreativeCard
              key={c.adId}
              creative={c}
              expanded={expandedId === c.adId}
              onToggle={() =>
                setExpandedId(expandedId === c.adId ? null : c.adId)
              }
              onMediaClick={openMedia}
              analyzeMutation={analyzeMutation}
              selected={selectedIds.has(c.adId)}
              onToggleSelected={toggleSelected}
            />
          ))}
        </div>
      )}

      {/* Table */}
      {!isLoading && filtered.length > 0 && viewMode === "table" && (
        <CreativesOverviewTable
          creatives={filtered}
          onMediaClick={openMedia}
          analyzeMutation={analyzeMutation}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
        />
      )}

      {/* Tree (Campaign → Ad Set → Ad) */}
      {!isLoading && filtered.length > 0 && viewMode === "tree" && (
        <CreativesTreeView
          creatives={filtered}
          searchQuery={searchQuery}
          onMediaClick={openMedia}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
        />
      )}

      {/* Floating selection bar */}
      {selectedIds.size > 0 && (
        <div className="fixed left-1/2 bottom-6 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full border border-[#d2d2d7]/60 bg-white/95 backdrop-blur-md px-5 py-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
            <span className="text-sm font-semibold text-[#1d1d1f] whitespace-nowrap">
              {selectedIds.size} vybráno
              {selectedMissingAnalysis > 0 && (
                <span className="ml-1.5 text-[11px] text-amber-700">
                  ({selectedMissingAnalysis} bez AI analýzy)
                </span>
              )}
            </span>
            <div className="h-5 w-px bg-[#d2d2d7]" />
            <button
              onClick={clearSelection}
              className="text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
            >
              Zrušit výběr
            </button>
            <button
              onClick={() => openMetaSheet("selected")}
              disabled={selectedAnalyzedAdIds.length < 3}
              title={
                selectedAnalyzedAdIds.length < 3
                  ? "Vyber alespoň 3 kreativy s AI analýzou"
                  : "AI shrnutí proti sobě"
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-full bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed]",
                selectedAnalyzedAdIds.length < 3 && "opacity-60 cursor-not-allowed"
              )}
            >
              <Swords className="h-4 w-4" />
              AI shrnutí proti sobě
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                ~${AI_ACTION_ESTIMATES.metaAnalyze.toFixed(2)}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
