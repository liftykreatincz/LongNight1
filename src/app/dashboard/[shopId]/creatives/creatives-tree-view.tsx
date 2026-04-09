"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Image as ImageIcon, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";
import {
  groupIntoTree,
  type AggregatedMetrics,
  type CampaignNode,
  type AdSetNode,
} from "@/lib/creative-aggregation";

const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const fmtDec = (n: number) => n.toFixed(2).replace(".", ",");

interface Props {
  creatives: CreativeRow[];
  searchQuery: string;
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
  selectedIds: Set<string>;
  onToggleSelected: (adId: string) => void;
}

interface ExpandState {
  campaigns: Set<string>;
  adsets: Set<string>;
}

function Metrics({ m }: { m: AggregatedMetrics }) {
  return (
    <div className="flex items-center gap-4 text-[12px] text-[#6e6e73] whitespace-nowrap tabular-nums">
      <span>
        <span className="text-[#86868b]">Spend </span>
        <span className="font-semibold text-[#1d1d1f]">{fmt(m.spend)} Kč</span>
      </span>
      <span>
        <span className="text-[#86868b]">Nákupy </span>
        <span className="font-semibold text-[#1d1d1f]">{fmt(m.purchases)}</span>
      </span>
      <span>
        <span className="text-[#86868b]">CPP </span>
        <span className="font-semibold text-[#1d1d1f]">
          {m.costPerPurchase > 0 ? `${fmt(m.costPerPurchase)} Kč` : "—"}
        </span>
      </span>
      <span>
        <span className="text-[#86868b]">ROAS </span>
        <span className="font-semibold text-[#1d1d1f]">
          {m.roas > 0 ? `${m.roas.toFixed(1)}×` : "—"}
        </span>
      </span>
      <span>
        <span className="text-[#86868b]">CTR </span>
        <span className="font-semibold text-[#1d1d1f]">
          {fmtDec(m.ctr)} %
        </span>
      </span>
      <span className="hidden xl:inline">
        <span className="text-[#86868b]">CPC </span>
        <span className="font-semibold text-[#1d1d1f]">
          {fmtDec(m.cpc)} Kč
        </span>
      </span>
      <span className="hidden xl:inline">
        <span className="text-[#86868b]">Impr </span>
        <span className="font-semibold text-[#1d1d1f]">
          {fmt(m.impressions)}
        </span>
      </span>
    </div>
  );
}

function AdRow({
  creative,
  selected,
  onToggleSelected,
  onMediaClick,
}: {
  creative: CreativeRow;
  selected: boolean;
  onToggleSelected: (adId: string) => void;
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
}) {
  const m: AggregatedMetrics = {
    spend: creative.spend,
    impressions: creative.impressions,
    reach: creative.reach,
    clicks: creative.clicks,
    purchases: creative.purchases,
    purchaseRevenue: creative.purchaseRevenue,
    addToCart: creative.addToCart,
    ctr: creative.ctr,
    cpc: creative.cpc,
    cpm: creative.cpm,
    roas: creative.roas,
    costPerPurchase: creative.costPerPurchase,
  };

  const canClickMedia =
    (creative.creativeType === "video" && creative.videoUrl) ||
    (creative.creativeType === "image" && creative.thumbnailUrl);

  return (
    <div
      className={cn(
        "flex items-center gap-3 pl-14 pr-4 py-2 border-t border-[#d2d2d7]/40 hover:bg-[#f5f5f7]/60 transition-colors",
        selected && "bg-[#0071e3]/5"
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelected(creative.adId);
        }}
        className={cn(
          "h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0",
          selected
            ? "bg-[#0071e3] border-[#0071e3]"
            : "border-[#d2d2d7] bg-white hover:border-[#0071e3]/50"
        )}
        aria-pressed={selected}
        title={selected ? "Odznačit" : "Označit"}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-sm bg-white" />}
      </button>

      <button
        type="button"
        onClick={(e) => canClickMedia && onMediaClick(creative, e)}
        className="relative h-9 w-9 shrink-0 rounded-md bg-[#f5f5f7] overflow-hidden flex items-center justify-center"
        title={canClickMedia ? "Otevřít náhled" : undefined}
      >
        {creative.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creative.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon className="h-4 w-4 text-[#86868b]" />
        )}
        {creative.creativeType === "video" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <Play className="h-3.5 w-3.5 text-white" />
          </span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className="truncate text-[13px] font-medium text-[#1d1d1f]">
          {creative.adName || "(bez názvu)"}
        </p>
        <p className="truncate text-[11px] text-[#86868b]">
          {creative.status} · ad_id {creative.adId}
        </p>
      </div>

      <Metrics m={m} />
    </div>
  );
}

function AdSetRow({
  node,
  expanded,
  onToggle,
  selectedIds,
  onToggleSelected,
  onMediaClick,
}: {
  node: AdSetNode;
  expanded: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  onToggleSelected: (adId: string) => void;
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 pl-8 pr-4 py-2.5 border-t border-[#d2d2d7]/60 hover:bg-[#f5f5f7] transition-colors text-left"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 text-[#86868b] transition-transform shrink-0",
            expanded && "rotate-90"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[13px] font-semibold text-[#1d1d1f]">
            {node.adsetName}
          </p>
          <p className="text-[11px] text-[#86868b]">
            {node.ads.length} reklam
          </p>
        </div>
        <Metrics m={node.metrics} />
      </button>
      {expanded &&
        node.ads.map((ad) => (
          <AdRow
            key={ad.creative.adId}
            creative={ad.creative}
            selected={selectedIds.has(ad.creative.adId)}
            onToggleSelected={onToggleSelected}
            onMediaClick={onMediaClick}
          />
        ))}
    </div>
  );
}

function CampaignRow({
  node,
  campaignExpanded,
  adsetExpanded,
  onToggleCampaign,
  onToggleAdset,
  selectedIds,
  onToggleSelected,
  onMediaClick,
}: {
  node: CampaignNode;
  campaignExpanded: boolean;
  adsetExpanded: Set<string>;
  onToggleCampaign: () => void;
  onToggleAdset: (adsetId: string) => void;
  selectedIds: Set<string>;
  onToggleSelected: (adId: string) => void;
  onMediaClick: (c: CreativeRow, e: React.MouseEvent) => void;
}) {
  const totalAds = node.adsets.reduce((s, a) => s + a.ads.length, 0);
  return (
    <div className="border-t border-[#d2d2d7]/60 first:border-t-0">
      <button
        type="button"
        onClick={onToggleCampaign}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-[#f5f5f7] transition-colors text-left"
        aria-expanded={campaignExpanded}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 text-[#6e6e73] transition-transform shrink-0",
            campaignExpanded && "rotate-90"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[14px] font-bold text-[#1d1d1f]">
            {node.campaignName}
          </p>
          <p className="text-[11px] text-[#86868b]">
            {node.adsets.length} ad setů · {totalAds} reklam
          </p>
        </div>
        <Metrics m={node.metrics} />
      </button>
      {campaignExpanded &&
        node.adsets.map((adset) => (
          <AdSetRow
            key={adset.adsetId}
            node={adset}
            expanded={adsetExpanded.has(adset.adsetId)}
            onToggle={() => onToggleAdset(adset.adsetId)}
            selectedIds={selectedIds}
            onToggleSelected={onToggleSelected}
            onMediaClick={onMediaClick}
          />
        ))}
    </div>
  );
}

export function CreativesTreeView({
  creatives,
  searchQuery,
  onMediaClick,
  selectedIds,
  onToggleSelected,
}: Props) {
  const tree = useMemo(() => groupIntoTree(creatives), [creatives]);

  const [expand, setExpand] = useState<ExpandState>({
    campaigns: new Set(),
    adsets: new Set(),
  });

  // Auto-expand everything while searching so matches are visible.
  useEffect(() => {
    if (searchQuery.trim().length === 0) return;
    setExpand({
      campaigns: new Set(tree.map((c) => c.campaignId)),
      adsets: new Set(tree.flatMap((c) => c.adsets.map((a) => a.adsetId))),
    });
  }, [searchQuery, tree]);

  const toggleCampaign = (id: string) => {
    setExpand((prev) => {
      const campaigns = new Set(prev.campaigns);
      if (campaigns.has(id)) campaigns.delete(id);
      else campaigns.add(id);
      return { ...prev, campaigns };
    });
  };

  const toggleAdset = (id: string) => {
    setExpand((prev) => {
      const adsets = new Set(prev.adsets);
      if (adsets.has(id)) adsets.delete(id);
      else adsets.add(id);
      return { ...prev, adsets };
    });
  };

  const expandAll = () => {
    setExpand({
      campaigns: new Set(tree.map((c) => c.campaignId)),
      adsets: new Set(tree.flatMap((c) => c.adsets.map((a) => a.adsetId))),
    });
  };

  const collapseAll = () => {
    setExpand({ campaigns: new Set(), adsets: new Set() });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12px]">
        <button
          type="button"
          onClick={expandAll}
          className="rounded-full border border-[#d2d2d7] bg-white px-3 py-1 font-medium text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]"
        >
          Rozbalit vše
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-full border border-[#d2d2d7] bg-white px-3 py-1 font-medium text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7]"
        >
          Sbalit vše
        </button>
        <span className="ml-auto text-[#86868b]">
          {tree.length} kampaní · {creatives.length} reklam
        </span>
      </div>

      <div className="rounded-2xl border border-[#d2d2d7]/60 bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        {tree.map((campaign) => (
          <CampaignRow
            key={campaign.campaignId}
            node={campaign}
            campaignExpanded={expand.campaigns.has(campaign.campaignId)}
            adsetExpanded={expand.adsets}
            onToggleCampaign={() => toggleCampaign(campaign.campaignId)}
            onToggleAdset={toggleAdset}
            selectedIds={selectedIds}
            onToggleSelected={onToggleSelected}
            onMediaClick={onMediaClick}
          />
        ))}
      </div>
    </div>
  );
}
