"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import {
  useShopBenchmarkWindow,
  type WindowDays,
} from "@/hooks/useShopBenchmarkWindow";

const OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 30, label: "30d" },
  { value: 60, label: "60d" },
  { value: 90, label: "90d" },
  { value: null, label: "Vše" },
];

export function WindowSelector({ shopId }: { shopId: string }) {
  const { windowDays, isLoading, setWindowDays, isSaving } =
    useShopBenchmarkWindow(shopId);

  return (
    <div className="inline-flex items-center gap-1">
      {OPTIONS.map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => setWindowDays(opt.value)}
          disabled={isSaving}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
            windowDays === opt.value
              ? "bg-[#0071e3] text-white border-[#0071e3]"
              : "bg-white border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]",
            isSaving && "opacity-50 cursor-not-allowed"
          )}
        >
          {isSaving && windowDays === opt.value ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            opt.label
          )}
        </button>
      ))}
    </div>
  );
}
