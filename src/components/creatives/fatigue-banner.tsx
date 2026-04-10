"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  criticalCount: number;
  onFilterFatigued: () => void;
}

export function FatigueBanner({ criticalCount, onFilterFatigued }: Props) {
  if (criticalCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200 px-4 py-2.5 text-[13px] text-orange-800">
      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
      <span>
        <strong>{criticalCount}</strong>{" "}
        {criticalCount === 1
          ? "aktivni kreativa vykazuje kritickou unavu"
          : "aktivnich kreativ vykazuje kritickou unavu"}
        . Zvazte nove vizualy.
      </span>
      <button
        onClick={onFilterFatigued}
        className="ml-auto text-[12px] font-medium text-orange-600 hover:text-orange-800 underline underline-offset-2 shrink-0"
      >
        Zobrazit
      </button>
      <span className="text-[10px] text-orange-400 shrink-0">
        Poslednich 30 dni
      </span>
    </div>
  );
}
