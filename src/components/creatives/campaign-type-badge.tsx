"use client";

import { Leaf, Tag, Snowflake, HelpCircle, type LucideIcon } from "lucide-react";
import type { CampaignType } from "@/lib/campaign-classifier";

interface Props {
  type: CampaignType;
  source: "auto" | "manual";
  onClick?: () => void;
}

interface Variant {
  label: string;
  color: string;
  bg: string;
  Icon: LucideIcon;
}

const CONFIG: Record<CampaignType, Variant> = {
  evergreen: { label: "Evergreen", color: "#0071e3", bg: "#e6f0ff", Icon: Leaf },
  sale: { label: "Sale", color: "#ff9f0a", bg: "#fff5e0", Icon: Tag },
  seasonal: { label: "Sezónní", color: "#bf5af2", bg: "#f4e8ff", Icon: Snowflake },
  unknown: {
    label: "Neklasifikováno",
    color: "#86868b",
    bg: "#f5f5f7",
    Icon: HelpCircle,
  },
};

export function CampaignTypeBadge({ type, source, onClick }: Props) {
  const { label, color, bg, Icon } = CONFIG[type];
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        type === "unknown" ? "animate-pulse border border-dashed" : ""
      } ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
      style={{ color, backgroundColor: bg, borderColor: color }}
      title={source === "manual" ? "Nastaveno manuálně" : "Auto-klasifikováno"}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
