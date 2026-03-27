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
  all: "Vse",
  active: "Aktivni",
  paused: "Pozastavene",
  archived: "Archivovane",
};

const typeLabels: Record<TypeFilter, string> = {
  all: "Vse",
  video: "Video",
  image: "Fotka",
};

const sortLabels: Record<SortKey, string> = {
  purchases: "Nakupy",
  spend: "Spend",
  roas: "ROAS",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Aktivni
      </span>
    );
  if (s === "paused")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pozastaveno
      </span>
    );
  if (s === "archived")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-white/40">
        <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
        Archivovano
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-white/40">
      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
      {status}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), "d.M.yyyy", { locale: cs });
  } catch {
    return "-";
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
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-1">
      <p className="text-xs text-white/40 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="text-xl font-bold text-white tracking-tight">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-white/40">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

/* ── Score Badge ── */

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : score >= 4
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : "bg-red-500/10 text-red-400 border-red-500/20";

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-[101] text-white/80 hover:text-white transition-colors"
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
          <img
            src={creative.thumbnailUrl}
            alt={creative.adName}
            className="w-full max-h-[85vh] object-contain rounded-xl"
          />
        ) : (
          <div className="flex items-center justify-center h-64 bg-white/[0.02] rounded-xl">
            <ImageIcon className="h-16 w-16 text-white/20" />
          </div>
        )}
        <p className="text-white/80 text-sm text-center mt-3 truncate">
          {creative.adName}
        </p>
      </div>
    </div>
  );
}

/* ── AI Analysis Panel ── */

function AnalysisPanel({ analysis }: { analysis: CreativeAnalysis }) {
  return (
    <div className="mt-2 pt-2 border-t border-white/[0.06] space-y-3">
      {/* Header with score */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          AI Analyza
        </p>
        <ScoreBadge score={analysis.score} />
      </div>

      {/* Summary */}
      <p className="text-xs text-white/80 leading-relaxed">
        {analysis.summary}
      </p>

      {/* Visual analysis */}
      <div>
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">
          Vizualni analyza
        </p>
        <p className="text-xs text-white/50 leading-relaxed">
          {analysis.visual_analysis}
        </p>
      </div>

      {/* Copy analysis */}
      <div>
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">
          Analyza textu
        </p>
        <p className="text-xs text-white/50 leading-relaxed">
          {analysis.copy_analysis}
        </p>
      </div>

      {/* Strengths */}
      {analysis.strengths.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide mb-1">
            Silne stranky
          </p>
          <ul className="space-y-1">
            {analysis.strengths.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-white/50"
              >
                <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {analysis.weaknesses.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">
            Slabe stranky
          </p>
          <ul className="space-y-1">
            {analysis.weaknesses.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-white/50"
              >
                <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-1">
            Doporuceni
          </p>
          <ul className="space-y-1">
            {analysis.recommendations.map((r, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs text-white/50"
              >
                <Lightbulb className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* vs Average */}
      <div>
        <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">
          Srovnani s prumerem
        </p>
        <p className="text-xs text-white/50 leading-relaxed">
          {analysis.vs_average}
        </p>
      </div>

      {/* Video analysis */}
      {analysis.video_analysis && (
        <div>
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-1">
            Video analyza
          </p>
          <div className="space-y-0.5">
            <MetricRow label="Hook (3s)" value={analysis.video_analysis.hook} />
            <MetricRow label="Tempo" value={analysis.video_analysis.pacing} />
            <MetricRow
              label="Mluvci"
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
        toast.success("AI analyza dokoncena");
        if (!expanded) onToggle();
      },
      onError: (err: Error) => {
        toast.error(`Chyba analyzy: ${err.message}`);
      },
    });
  };

  return (
    <div
      onClick={onToggle}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden cursor-pointer hover:border-blue-500/30 transition-all"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-white/[0.02] relative overflow-hidden flex items-center justify-center group">
        {c.thumbnailUrl ? (
          <img
            src={c.thumbnailUrl}
            alt={c.adName}
            className="object-cover w-full h-full"
          />
        ) : (
          <ImageIcon className="h-10 w-10 text-white/20" />
        )}

        {/* Clickable overlay for video/image */}
        {isClickable && (
          <button
            onClick={(e) => onMediaClick(c, e)}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
            title={hasPlayableVideo ? "Prehrat video" : "Zobrazit fotku"}
          >
            {hasPlayableVideo ? (
              <div className="h-14 w-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="h-7 w-7 text-gray-900 ml-1" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded-full bg-white/80 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <Search className="h-5 w-5 text-gray-900" />
              </div>
            )}
          </button>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm",
              c.creativeType === "video"
                ? "bg-blue-500/80 text-white"
                : "bg-gray-800/60 text-white"
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
            "absolute top-2 right-2 h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-all",
            isAnalyzing
              ? "bg-amber-500/80"
              : hasAnalysis
                ? "bg-amber-500/80 hover:bg-amber-500"
                : "bg-gray-800/60 hover:bg-gray-800/80"
          )}
          title={hasAnalysis ? "Zobrazit AI analyzu" : "Analyzovat kreativu"}
        >
          {isAnalyzing ? (
            <Loader2 className="h-4 w-4 text-white animate-spin" />
          ) : (
            <Sparkles
              className={cn(
                "h-4 w-4",
                hasAnalysis ? "text-white fill-white" : "text-white/80"
              )}
            />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="font-medium text-sm text-white truncate">{c.adName}</p>
        <p className="text-xs text-white/40 truncate">
          Campaign: {c.campaignName}
        </p>
        <p className="text-xs text-white/40">
          {formatDate(c.dateStart)} &ndash; {formatDate(c.dateStop)}
        </p>
        <div className="flex items-center gap-2">
          {statusBadge(c.status)}
          {hasAnalysis && <ScoreBadge score={c.aiAnalysis!.score} />}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="px-3 pb-3 space-y-0.5">
        <MetricRow label="Nakupy" value={fmt(c.purchases)} />
        <MetricRow label="Spend" value={`${fmt(c.spend)} Kc`} />
        <MetricRow label="CTR" value={`${fmtDec(c.ctr)}%`} />
        <MetricRow label="CPC" value={`${fmtDec(c.cpc)} Kc`} />
        <MetricRow label="ROAS" value={`${c.roas.toFixed(1)}x`} />
        <MetricRow label="CPP" value={`${fmtDec(c.costPerPurchase)} Kc`} />
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="border-t border-white/[0.06] pt-2 space-y-0.5">
            <MetricRow label="Impressions" value={fmt(c.impressions)} />
            <MetricRow label="Reach" value={fmt(c.reach)} />
            <MetricRow label="CPM" value={`${fmtDec(c.cpm)} Kc`} />
            <MetricRow label="Add to Cart" value={fmt(c.addToCart)} />
            <MetricRow
              label="Cost/ATC"
              value={`${fmtDec(c.costPerAddToCart)} Kc`}
            />
            <MetricRow
              label="Initiate Checkout"
              value={fmt(c.initiateCheckout)}
            />
            {c.creativeType === "video" && (
              <>
                <MetricRow
                  label="Video Views 3s"
                  value={fmt(c.videoViews3s)}
                />
                <MetricRow label="ThruPlay" value={fmt(c.videoThruplay)} />
              </>
            )}
            <MetricRow label="Likes" value={fmt(c.likes)} />
            <MetricRow label="Comments" value={fmt(c.comments)} />
            <MetricRow label="Shares" value={fmt(c.shares)} />
          </div>

          {c.body && (
            <div className="mt-2 pt-2 border-t border-white/[0.06]">
              <p className="text-xs text-white/40 font-medium mb-1">
                Text reklamy:
              </p>
              <p className="text-xs text-white/50 whitespace-pre-line">
                {c.body}
              </p>
            </div>
          )}

          {/* AI Analysis Panel */}
          {c.aiAnalysis && <AnalysisPanel analysis={c.aiAnalysis} />}

          {/* Analyze button if no analysis yet */}
          {!c.aiAnalysis && (
            <div className="mt-2 pt-2 border-t border-white/[0.06]">
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]",
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
          `Synchronizovano: ${count} kreativ${insights ? ` (${insights} s daty, ${videos} videi)` : ""}`
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
    <div className="space-y-4">
      {/* Modal */}
      {modalCreative && (
        <MediaModal
          creative={modalCreative}
          onClose={() => setModalCreative(null)}
        />
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-white/40">
        <Link
          href="/dashboard"
          className="transition-colors hover:text-white/70"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link
          href={`/dashboard/${shopId}`}
          className="transition-colors hover:text-white/70"
        >
          Shop
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-white/70">Analyza kreativ</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Analyza Kreativ
          </h1>
          {lastSync && (
            <p className="text-xs text-white/40 mt-0.5">
              Posledni sync:{" "}
              {format(parseISO(lastSync), "d.M.yyyy HH:mm", { locale: cs })}
            </p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncMutation.isPending}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]",
            syncMutation.isPending && "opacity-60 cursor-not-allowed"
          )}
        >
          {syncMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Synchronizovat
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
              "rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors",
              statusFilter === key
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.06]"
            )}
          >
            {statusLabels[key]}
          </button>
        ))}

        <div className="w-px h-6 bg-white/[0.06] mx-1" />

        {/* Type filter buttons */}
        {(Object.keys(typeLabels) as TypeFilter[]).map((key) => {
          const Icon =
            key === "video" ? Video : key === "image" ? Camera : null;
          return (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors",
                typeFilter === key
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.06]"
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {typeLabels[key]}
              <span className="text-xs opacity-70">({typeCounts[key]})</span>
            </button>
          );
        })}

        <div className="w-px h-6 bg-white/[0.06] mx-1" />

        {/* Sort dropdown */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-sm text-white"
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
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-1.5 text-white/50 hover:text-white transition-colors"
          title={sortAsc ? "Vzestupne" : "Sestupne"}
        >
          {sortAsc ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <div className="w-px h-6 bg-white/[0.06] mx-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            type="text"
            placeholder="Hledat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-white/30 w-48"
          />
        </div>
      </div>

      {/* Summary Bar */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SmallStat
            label="Celkovy spend"
            value={`${fmt(summary.totalSpend)} Kc`}
          />
          <SmallStat label="Ø CTR" value={`${fmtDec(summary.avgCtr)}%`} />
          <SmallStat
            label="Ø CPC"
            value={`${fmtDec(summary.avgCpc)} Kc`}
          />
          <SmallStat
            label="Celkem nakupu"
            value={fmt(summary.totalPurchases)}
          />
          <SmallStat
            label="Ø ROAS"
            value={`${summary.avgRoas.toFixed(1)}x`}
          />
          <SmallStat
            label="Celkem impressions"
            value={fmt(summary.totalImpressions)}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-white/30" />
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-red-400">
            Chyba: {(error as Error).message}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && creatives && creatives.length === 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center space-y-3">
          <ImageIcon className="h-10 w-10 text-white/20 mx-auto" />
          <p className="text-sm text-white/40">Zadne kreativy</p>
          <button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
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
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <p className="text-sm text-white/40">
              Zadne vysledky pro dane filtry
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
