"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  RotateCcw,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDriftState } from "@/hooks/useDriftState";

function formatSnapshotDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DriftBanner({ shopId }: { shopId: string }) {
  const {
    driftDetectedAt,
    snapshots,
    accept,
    rollback,
    isAccepting,
    isRollingBack,
  } = useDriftState(shopId);
  const [showDropdown, setShowDropdown] = useState(false);

  if (!driftDetectedAt) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center gap-2 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="font-medium">
          Benchmarky se výrazně změnily od posledního přepočtu.
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => accept()}
            disabled={isAccepting}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors",
              isAccepting && "opacity-50 cursor-not-allowed"
            )}
          >
            {isAccepting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Přijmout
          </button>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={isRollingBack}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[#d2d2d7] bg-white px-3 py-1 text-xs font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors",
                isRollingBack && "opacity-50 cursor-not-allowed"
              )}
            >
              {isRollingBack ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Rollback
              <ChevronDown className="h-3 w-3" />
            </button>
            {showDropdown && snapshots.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-[#d2d2d7] bg-white shadow-lg py-1">
                {snapshots.map((s) => (
                  <button
                    key={s.snapshotAt}
                    onClick={() => {
                      rollback(s.snapshotAt);
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#f5f5f7] transition-colors"
                  >
                    <span className="font-medium">
                      {formatSnapshotDate(s.snapshotAt)}
                    </span>
                    <span className="text-[#86868b] ml-1">
                      ({s.rowCount} metrik)
                    </span>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && snapshots.length === 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-[#d2d2d7] bg-white shadow-lg p-3 text-xs text-[#86868b]">
                Žádné snapshoty k dispozici
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
