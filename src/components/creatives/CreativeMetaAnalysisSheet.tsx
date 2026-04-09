"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Trophy,
  AlertTriangle,
  Target,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Swords,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import {
  useRunMetaAnalysis,
  type MetaAnalysisRow,
  type MetaAnalysisResult,
} from "@/hooks/useCreativeMetaAnalysis";
import { cn } from "@/lib/utils";

type ScopeChoice = "all" | "filtered" | "selected";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopId: string;
  allAnalyzedCount: number;
  filteredAnalyzedAdIds: string[];
  selectedAnalyzedAdIds?: string[];
  initialScope?: ScopeChoice;
  filterContext: Record<string, unknown>;
}

export function CreativeMetaAnalysisSheet({
  open,
  onOpenChange,
  shopId,
  allAnalyzedCount,
  filteredAnalyzedAdIds,
  selectedAnalyzedAdIds = [],
  initialScope = "all",
  filterContext,
}: Props) {
  const runMutation = useRunMetaAnalysis();

  const [scope, setScope] = useState<ScopeChoice>(initialScope);
  const [minSpend, setMinSpend] = useState<number>(500);
  const [viewing, setViewing] = useState<MetaAnalysisRow | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScope(initialScope);
      setViewing(null);
      if (initialScope === "selected") setMinSpend(0);
    }
  }, [open, initialScope]);

  const filteredCount = filteredAnalyzedAdIds.length;
  const selectedCount = selectedAnalyzedAdIds.length;

  const canRun = useMemo(() => {
    if (scope === "all") return allAnalyzedCount >= 3;
    if (scope === "selected") return selectedCount >= 3;
    return filteredCount >= 3;
  }, [scope, allAnalyzedCount, filteredCount, selectedCount]);

  const handleRun = () => {
    const mergedContext: Record<string, unknown> = {
      ...(scope === "filtered" ? filterContext : {}),
      ...(scope === "selected" ? { comparison: "selected" } : {}),
      min_spend: minSpend,
    };
    const adIds =
      scope === "filtered"
        ? filteredAnalyzedAdIds
        : scope === "selected"
          ? selectedAnalyzedAdIds
          : undefined;

    runMutation.mutate(
      {
        shopId,
        scope: scope === "selected" ? "filtered" : scope,
        adIds,
        filterContext: mergedContext,
        minSpend,
      },
      {
        onSuccess: (row) => {
          setViewing(row);
          toast.success("Meta-analýza dokončena");
        },
        onError: (err: Error) => {
          toast.error(`Chyba: ${err.message}`);
        },
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI shrnutí kreativ
          </SheetTitle>
          <SheetDescription>
            Meta-analýza vzorů napříč všemi již analyzovanými kreativami.
          </SheetDescription>
        </SheetHeader>

        {!viewing && (
          <div className="mt-6 space-y-6">
            {/* Scope toggle */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em]">
                Rozsah analýzy
              </p>
              <div
                className={cn(
                  "grid gap-2",
                  selectedCount > 0 ? "grid-cols-3" : "grid-cols-2"
                )}
              >
                <button
                  onClick={() => setScope("all")}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-all",
                    scope === "all"
                      ? "border-[#0071e3] bg-[#0071e3]/5 shadow-[0_1px_2px_rgba(0,113,227,0.08)]"
                      : "border-[#d2d2d7]/60 bg-white hover:bg-[#f5f5f7]"
                  )}
                >
                  <p className="text-sm font-bold text-[#1d1d1f]">
                    Všechny analyzované
                  </p>
                  <p className="text-xs text-[#6e6e73] mt-0.5">
                    {allAnalyzedCount} kreativ
                  </p>
                </button>
                <button
                  onClick={() => setScope("filtered")}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-all",
                    scope === "filtered"
                      ? "border-[#0071e3] bg-[#0071e3]/5 shadow-[0_1px_2px_rgba(0,113,227,0.08)]"
                      : "border-[#d2d2d7]/60 bg-white hover:bg-[#f5f5f7]"
                  )}
                >
                  <p className="text-sm font-bold text-[#1d1d1f]">
                    Jen aktuální filtr
                  </p>
                  <p className="text-xs text-[#6e6e73] mt-0.5">
                    {filteredCount} kreativ
                  </p>
                </button>
                {selectedCount > 0 && (
                  <button
                    onClick={() => setScope("selected")}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-all",
                      scope === "selected"
                        ? "border-[#0071e3] bg-[#0071e3]/5 shadow-[0_1px_2px_rgba(0,113,227,0.08)]"
                        : "border-[#d2d2d7]/60 bg-white hover:bg-[#f5f5f7]"
                    )}
                  >
                    <p className="text-sm font-bold text-[#1d1d1f] flex items-center gap-1.5">
                      <Swords className="h-3.5 w-3.5 text-amber-500" />
                      Proti sobě
                    </p>
                    <p className="text-xs text-[#6e6e73] mt-0.5">
                      {selectedCount} vybraných
                    </p>
                  </button>
                )}
              </div>
            </div>

            {/* Min spend */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em]">
                  Minimální spend
                </p>
                <span className="text-xs text-[#86868b]">
                  Vylučuje kreativy s málo daty
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={minSpend}
                    onChange={(e) =>
                      setMinSpend(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full rounded-full border border-[#d2d2d7] bg-white px-4 py-2 pr-10 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#86868b] pointer-events-none">
                    Kč
                  </span>
                </div>
                <div className="flex gap-1">
                  {[0, 500, 1000, 2000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMinSpend(v)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                        minSpend === v
                          ? "border-[#0071e3] bg-[#0071e3]/5 text-[#1d1d1f]"
                          : "border-[#d2d2d7] bg-white text-[#6e6e73] hover:bg-[#f5f5f7]"
                      )}
                    >
                      {v === 0 ? "0" : v >= 1000 ? `${v / 1000}k` : `${v}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Run button */}
            <button
              onClick={handleRun}
              disabled={!canRun || runMutation.isPending}
              className={cn(
                "w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#0071e3] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed]",
                (!canRun || runMutation.isPending) &&
                  "opacity-60 cursor-not-allowed"
              )}
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Claude analyzuje… (~15 s)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Spustit analýzu
                </>
              )}
            </button>
            {!canRun && (
              <p className="text-xs text-[#86868b] text-center">
                Potřebuješ alespoň 3 analyzované kreativy.
              </p>
            )}
          </div>
        )}

        {viewing && (
          <div className="mt-6 space-y-6">
            <button
              onClick={() => setViewing(null)}
              className="text-xs font-semibold text-[#6e6e73] hover:text-[#1d1d1f]"
            >
              ← Zpět
            </button>
            <ResultViewer
              analysis={viewing.analysis}
              adIds={viewing.ad_ids}
              shopId={shopId}
            />
            <div className="text-xs text-[#86868b] text-center pt-4 border-t border-[#d2d2d7]/60">
              {viewing.creatives_count} kreativ · {viewing.model}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface CreativeMetaRow {
  ad_id: string;
  ad_name: string;
  thumbnail_url: string | null;
  creative_type: string | null;
  spend: number | null;
  purchases: number | null;
  cost_per_purchase: number | null;
  roas: number | null;
  ctr: number | null;
  impressions: number | null;
  clicks: number | null;
}

function useCreativesForAdIds(adIds: string[], shopId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: [
      "creative-meta-rows",
      shopId,
      [...adIds].sort().join(","),
    ],
    enabled: adIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, CreativeMetaRow>> => {
      const { data, error } = await supabase
        .from("meta_ad_creatives")
        .select(
          "ad_id, ad_name, thumbnail_url, creative_type, spend, purchases, cost_per_purchase, roas, ctr, impressions, clicks"
        )
        .eq("shop_id", shopId)
        .in("ad_id", adIds);
      if (error) throw error;
      const map: Record<string, CreativeMetaRow> = {};
      for (const row of (data ?? []) as CreativeMetaRow[]) {
        map[row.ad_id] = row;
      }
      return map;
    },
  });
}

type SortKey = "cost_per_purchase" | "purchases" | "spend" | "roas" | "ctr";

function ResultViewer({
  analysis,
  adIds,
  shopId,
}: {
  analysis: MetaAnalysisResult;
  adIds: string[];
  shopId: string;
}) {
  const { data: rowsById = {} } = useCreativesForAdIds(adIds, shopId);

  const thumbs = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const id of Object.keys(rowsById)) {
      const t = rowsById[id].thumbnail_url;
      if (t) m[id] = t;
    }
    return m;
  }, [rowsById]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm leading-relaxed text-[#1d1d1f]">
          {analysis.executive_summary}
        </p>
      </section>

      {adIds.length > 0 && (
        <CreativesTable
          adIds={adIds}
          rowsById={rowsById}
          highlightTopIds={
            new Set(analysis.top_performers?.map((t) => t.ad_id) ?? [])
          }
          highlightWorstIds={
            new Set(analysis.worst_performers?.map((w) => w.ad_id) ?? [])
          }
        />
      )}

      {analysis.top_performers?.length > 0 && (
        <section>
          <h3 className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" />
            Top performers
          </h3>
          <div className="space-y-2">
            {analysis.top_performers.map((t, i) => {
              const thumb = thumbs[t.ad_id];
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-[#d2d2d7]/60 bg-white p-3 flex gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1d1d1f] truncate">
                      {t.ad_name}
                    </p>
                    <p className="text-xs text-[#6e6e73] mt-1">
                      {t.why_works}
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">
                      {t.key_lesson}
                    </p>
                  </div>
                  {thumb && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumb}
                      alt={t.ad_name}
                      loading="lazy"
                      className="h-11 w-11 rounded-lg object-cover border border-[#d2d2d7]/60 shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {analysis.worst_performers?.length > 0 && (
        <section>
          <h3 className="text-[10px] font-bold text-red-700 uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Nejslabší kreativy
          </h3>
          <div className="space-y-2">
            {analysis.worst_performers.map((w, i) => {
              const thumb = thumbs[w.ad_id];
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-[#d2d2d7]/60 bg-white p-3 flex gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#1d1d1f] truncate">
                      {w.ad_name}
                    </p>
                    <p className="text-xs text-[#6e6e73] mt-1">
                      {w.why_fails}
                    </p>
                  </div>
                  {thumb && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumb}
                      alt={w.ad_name}
                      loading="lazy"
                      className="h-11 w-11 rounded-lg object-cover border border-[#d2d2d7]/60 shrink-0"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {analysis.patterns && (
        <section>
          <h3 className="text-[10px] font-bold text-[#0071e3] uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Trendy a vzory
          </h3>
          <div className="space-y-3">
            <PatternBlock title="Vizuální" items={analysis.patterns.visual_trends} />
            <PatternBlock title="Text / copy" items={analysis.patterns.copy_trends} />
            <PatternBlock title="Formát" items={analysis.patterns.format_trends} />
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <h3 className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Co funguje
          </h3>
          <ul className="space-y-1">
            {analysis.what_works?.map((w, i) => (
              <li key={i} className="text-xs text-[#1d1d1f]">
                • {w}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
          <h3 className="text-[10px] font-bold text-red-700 uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5" />
            Čemu se vyhnout
          </h3>
          <ul className="space-y-1">
            {analysis.what_to_avoid?.map((w, i) => (
              <li key={i} className="text-xs text-[#1d1d1f]">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {analysis.next_creative_blueprint && (
        <section className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
          <h3 className="text-sm font-extrabold text-amber-700 uppercase tracking-[0.06em] mb-3 flex items-center gap-1.5">
            <Target className="h-4 w-4" />
            Blueprint další kreativy
          </h3>
          <div className="space-y-3">
            <p className="text-sm text-[#1d1d1f] leading-relaxed">
              {analysis.next_creative_blueprint.concept}
            </p>
            <BlueprintRow label="Hook" value={analysis.next_creative_blueprint.hook} />
            <BlueprintRow
              label="Vizuální směr"
              value={analysis.next_creative_blueprint.visual_direction}
            />
            <BlueprintRow
              label="Copy angle"
              value={analysis.next_creative_blueprint.copy_angle}
            />
            <BlueprintRow label="CTA" value={analysis.next_creative_blueprint.cta} />
            <div className="pt-2 border-t border-amber-200">
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.08em] mb-1">
                Proč porazí medián CPP
              </p>
              <p className="text-xs text-[#1d1d1f] leading-relaxed">
                {analysis.next_creative_blueprint.why_above_average}
              </p>
            </div>
          </div>
        </section>
      )}

      {analysis.key_takeaways?.length > 0 && (
        <section>
          <h3 className="text-[10px] font-bold text-[#1d1d1f] uppercase tracking-[0.08em] mb-2">
            Hlavní poučení
          </h3>
          <ol className="space-y-1.5">
            {analysis.key_takeaways.map((t, i) => (
              <li
                key={i}
                className="text-xs text-[#1d1d1f] flex gap-2"
              >
                <span className="font-extrabold text-[#86868b]">{i + 1}.</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function PatternBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-1">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-[#1d1d1f]">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlueprintRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-[0.08em] mb-0.5">
        {label}
      </p>
      <p className="text-xs text-[#1d1d1f] leading-relaxed">{value}</p>
    </div>
  );
}

function fmtKc(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Math.round(Number(n)).toLocaleString("cs-CZ")} Kč`;
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(2)} %`;
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("cs-CZ");
}

function fmtX(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toFixed(2)}×`;
}

function CreativesTable({
  adIds,
  rowsById,
  highlightTopIds,
  highlightWorstIds,
}: {
  adIds: string[];
  rowsById: Record<string, CreativeMetaRow>;
  highlightTopIds: Set<string>;
  highlightWorstIds: Set<string>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("cost_per_purchase");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = useMemo(() => {
    const list: CreativeMetaRow[] = [];
    for (const id of adIds) {
      const r = rowsById[id];
      if (r) list.push(r);
    }
    list.sort((a, b) => {
      const aP = Number(a.purchases || 0);
      const bP = Number(b.purchases || 0);
      const aVal = Number(a[sortKey] ?? 0);
      const bVal = Number(b[sortKey] ?? 0);

      if (sortKey === "cost_per_purchase") {
        if (aP === 0 && bP === 0)
          return Number(b.spend || 0) - Number(a.spend || 0);
        if (aP === 0) return 1;
        if (bP === 0) return -1;
      }

      if (aVal === bVal) return 0;
      const cmp = aVal < bVal ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [adIds, rowsById, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "cost_per_purchase" || key === "ctr" ? "asc" : "desc");
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const loading = adIds.length > 0 && Object.keys(rowsById).length === 0;

  return (
    <section>
      <h3 className="text-[10px] font-bold text-[#1d1d1f] uppercase tracking-[0.08em] mb-2">
        Přehled kreativ ({adIds.length})
      </h3>
      <div className="rounded-2xl border border-[#d2d2d7]/60 overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-[#86868b]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#f5f5f7] text-[10px] uppercase tracking-[0.06em] text-[#6e6e73]">
                <tr>
                  <th className="text-left font-bold px-2 py-2 w-10"></th>
                  <th className="text-left font-bold px-2 py-2">Reklama</th>
                  <SortHeader
                    label="CPP"
                    active={sortKey === "cost_per_purchase"}
                    arrow={arrow("cost_per_purchase")}
                    onClick={() => handleSort("cost_per_purchase")}
                    emphasized
                  />
                  <SortHeader
                    label="Nákupy"
                    active={sortKey === "purchases"}
                    arrow={arrow("purchases")}
                    onClick={() => handleSort("purchases")}
                  />
                  <SortHeader
                    label="Spend"
                    active={sortKey === "spend"}
                    arrow={arrow("spend")}
                    onClick={() => handleSort("spend")}
                  />
                  <SortHeader
                    label="ROAS"
                    active={sortKey === "roas"}
                    arrow={arrow("roas")}
                    onClick={() => handleSort("roas")}
                  />
                  <SortHeader
                    label="CTR"
                    active={sortKey === "ctr"}
                    arrow={arrow("ctr")}
                    onClick={() => handleSort("ctr")}
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isTop = highlightTopIds.has(r.ad_id);
                  const isWorst = highlightWorstIds.has(r.ad_id);
                  const zeroPurchases = Number(r.purchases || 0) === 0;
                  return (
                    <tr
                      key={r.ad_id}
                      className={cn(
                        "border-t border-[#d2d2d7]/60",
                        isTop && "bg-emerald-50",
                        isWorst && "bg-red-50",
                        zeroPurchases && !isTop && !isWorst && "opacity-60"
                      )}
                    >
                      <td className="px-2 py-1.5">
                        {r.thumbnail_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={r.thumbnail_url}
                            alt={r.ad_name}
                            loading="lazy"
                            className="h-8 w-8 rounded-md object-cover border border-[#d2d2d7]/60"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-md bg-[#f5f5f7] border border-[#d2d2d7]/60" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 max-w-[140px]">
                        <div className="flex items-center gap-1">
                          {isTop && (
                            <Trophy className="h-3 w-3 text-emerald-700 shrink-0" />
                          )}
                          {isWorst && (
                            <AlertTriangle className="h-3 w-3 text-red-700 shrink-0" />
                          )}
                          <span
                            className="truncate text-[#1d1d1f]"
                            title={r.ad_name}
                          >
                            {r.ad_name}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-bold tabular-nums whitespace-nowrap",
                          zeroPurchases
                            ? "text-[#86868b]"
                            : isTop
                              ? "text-emerald-700"
                              : isWorst
                                ? "text-red-700"
                                : "text-[#1d1d1f]"
                        )}
                      >
                        {zeroPurchases ? "—" : fmtKc(r.cost_per_purchase)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {fmtNum(r.purchases)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {fmtKc(r.spend)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {fmtX(r.roas)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                        {fmtPct(r.ctr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function SortHeader({
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
      className={cn(
        "text-right font-bold px-2 py-2 cursor-pointer select-none whitespace-nowrap",
        active && "text-[#1d1d1f]",
        emphasized && "text-amber-700"
      )}
      onClick={onClick}
    >
      {label}
      {arrow}
    </th>
  );
}
