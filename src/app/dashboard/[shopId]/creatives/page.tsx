"use client";

import { useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useCreativeAnalysis,
  useSyncCreatives,
} from "@/hooks/useCreativeAnalysis";
import { useAnalyzeCreative } from "@/hooks/useAnalyzeCreative";
import type { CreativeRow, CreativeAnalysis } from "@/hooks/useCreativeAnalysis";

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
  image: "Obrázek",
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

/* ── Score Badge ── */

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

/* ── Media Modal / Lightbox ── */

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
          // eslint-disable-next-line @next/next/no-img-element
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
      {/* Header with score */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[#1d1d1f] uppercase tracking-[0.08em] flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          AI analýza
        </p>
        <ScoreBadge score={analysis.score} />
      </div>

      {/* Summary */}
      <p className="text-xs text-[#1d1d1f] leading-relaxed">
        {analysis.summary}
      </p>

      {/* Visual analysis */}
      <div>
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
          Vizuální analýza
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {analysis.visual_analysis}
        </p>
      </div>

      {/* Copy analysis */}
      <div>
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
          Analýza textu
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {analysis.copy_analysis}
        </p>
      </div>

      {/* Strengths */}
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

      {/* Weaknesses */}
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

      {/* Recommendations */}
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

      {/* vs Average */}
      <div>
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
          Srovnání s průměrem
        </p>
        <p className="text-xs text-[#6e6e73] leading-relaxed">
          {analysis.vs_average}
        </p>
      </div>

      {/* Video analysis */}
      {analysis.video_analysis && (
        <div>
          <p className="text-[10px] font-bold text-[#0071e3] uppercase tracking-[0.08em] mb-1">
            Video analýza
          </p>
          <div className="space-y-0.5">
            <MetricRow label="Hook (3s)" value={analysis.video_analysis.hook} />
            <MetricRow label="Tempo" value={analysis.video_analysis.pacing} />
            <MetricRow
              label="Mluvčí"
              value={analysis.video_analysis.speaker}
            />
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
}: {
  creative: CreativeRow;
  expanded: boolean;
  onToggle: () => void;
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
  analyzeMutation: ReturnType<typeof useAnalyzeCreative>;
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

    // If analysis already exists, just expand the card to show it
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
      className="rounded-2xl border border-[#d2d2d7]/60 bg-white overflow-hidden cursor-pointer hover:border-[#0071e3]/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-[#f5f5f7] relative overflow-hidden flex items-center justify-center group">
        {c.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.thumbnailUrl}
            alt={c.adName}
            className="object-cover w-full h-full"
          />
        ) : (
          <ImageIcon className="h-10 w-10 text-[#86868b]" />
        )}

        {/* Clickable overlay for video/image */}
        {isClickable && (
          <button
            onClick={(e) => onMediaClick(c, e)}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors"
            title={hasPlayableVideo ? "Přehrát video" : "Zobrazit obrázek"}
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
        <div className="absolute top-2 left-2">
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
                <Camera className="h-3 w-3" /> Obrázek
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

          {/* AI Analysis Panel */}
          {c.aiAnalysis && <AnalysisPanel analysis={c.aiAnalysis} />}

          {/* Analyze button if no analysis yet */}
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
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */

export default function CreativesPage() {
  const params = useParams<{ shopId: string }>();
  const shopId = params.shopId;

  const {
    data: creatives,
    isLoading,
    error,
  } = useCreativeAnalysis(shopId);
  const syncMutation = useSyncCreatives(shopId);
  const analyzeMutation = useAnalyzeCreative(shopId);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("purchases");
  const [sortAsc, setSortAsc] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalCreative, setModalCreative] = useState<CreativeRow | null>(null);

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

  const lastSync = useMemo(() => {
    if (!creatives?.length) return null;
    const sorted = [...creatives].sort(
      (a, b) =>
        new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime()
    );
    return sorted[0]?.syncedAt ?? null;
  }, [creatives]);

  const filtered = useMemo(() => {
    if (!creatives) return [];
    let result = [...creatives];

    if (statusFilter !== "all") {
      result = result.filter(
        (c) => c.status.toLowerCase() === statusFilter
      );
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

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status filter buttons */}
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

        {/* Type filter buttons */}
        {(Object.keys(typeLabels) as TypeFilter[]).map((key) => {
          const Icon =
            key === "video" ? Video : key === "image" ? Camera : null;
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

        {/* Sort dropdown */}
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

        {/* Sort direction */}
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

        {/* Search */}
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
          <SmallStat
            label="Ø ROAS"
            value={`${summary.avgRoas.toFixed(1)}×`}
          />
          <SmallStat
            label="Celkem zobrazení"
            value={fmt(summary.totalImpressions)}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#86868b]" />
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-semibold text-red-700">
            Chyba: {(error as Error).message}
          </p>
        </div>
      )}

      {/* Empty state */}
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

      {/* No results after filtering */}
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
      {!isLoading && filtered.length > 0 && (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
