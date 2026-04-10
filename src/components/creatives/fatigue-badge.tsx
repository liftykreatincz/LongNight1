"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  score: number | null;
  signal: "none" | "rising" | "fatigued" | "critical" | null;
  className?: string;
}

const SIGNAL_CONFIG = {
  rising: { color: "#ff9f0a", label: "Zacina opotrebeni" },
  fatigued: { color: "#ff6723", label: "Unavena" },
  critical: { color: "#ff3b30", label: "Kriticka unava" },
} as const;

export function FatigueBadge({ score, signal, className }: Props) {
  if (!signal || signal === "none" || score === null) return null;

  const config = SIGNAL_CONFIG[signal];
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div
      ref={anchorRef}
      className={cn("inline-flex items-center", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className="flex items-center justify-center rounded-full w-6 h-6 cursor-pointer"
        style={{ backgroundColor: config.color + "20" }}
      >
        <Moon className="h-3.5 w-3.5" style={{ color: config.color }} />
      </div>

      {open && typeof document !== "undefined" &&
        createPortal(
          <FatigueTooltip
            anchorRef={anchorRef}
            score={score}
            config={config}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          />,
          document.body
        )}
    </div>
  );
}

function FatigueTooltip({
  anchorRef,
  score,
  config,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  score: number;
  config: { color: string; label: string };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (!node || !anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const popH = node.offsetHeight;
      const top =
        rect.top > popH + 10 ? rect.top - popH - 10 : rect.bottom + 10;
      let left = rect.left + rect.width / 2 - 120;
      left = Math.max(8, Math.min(left, window.innerWidth - 248));
      setPos({ top, left });
    },
    [anchorRef]
  );

  return (
    <div
      ref={setRef}
      style={{
        position: "fixed",
        zIndex: 9999,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: 240,
        opacity: pos ? 1 : 0,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-3 bg-white rounded-xl shadow-2xl border border-[#d2d2d7] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1d1d1f]">
            Fatigue: {score}
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: config.color + "20", color: config.color }}
          >
            {config.label}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#f5f5f7] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, score)}%`,
              backgroundColor: config.color,
            }}
          />
        </div>
        <p className="text-[10px] text-[#86868b]">Pocitano z poslednich 30 dni</p>
      </div>
    </div>
  );
}
