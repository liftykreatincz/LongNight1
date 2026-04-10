"use client";

import { useState, useMemo } from "react";
import { Search, X, Plus } from "lucide-react";
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";

interface Props {
  creatives: CreativeRow[];
  excludeIds?: string[];
  onSelect: (adId: string) => void;
  onClose: () => void;
}

export function CreativePickerModal({
  creatives,
  excludeIds = [],
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    let result = creatives.filter((c) => !excludeSet.has(c.adId));
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (c) =>
          c.adName.toLowerCase().includes(q) ||
          c.campaignName.toLowerCase().includes(q)
      );
    }
    return result.slice(0, 50);
  }, [creatives, excludeIds, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-[#d2d2d7] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5ea]">
          <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
            Vybrat kreativu
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#f5f5f7] transition-colors"
          >
            <X className="h-4 w-4 text-[#86868b]" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-[#e5e5ea]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat kreativu..."
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#d2d2d7] rounded-lg bg-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:bg-white"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#86868b]">
              Žádné kreativy nenalezeny
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.adId}
                onClick={() => onSelect(c.adId)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f5f5f7] transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#f5f5f7] shrink-0 flex items-center justify-center border border-[#e5e5ea]">
                  {c.thumbnailUrl ? (
                    <img
                      src={c.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Plus className="h-4 w-4 text-[#86868b]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1d1d1f] truncate">
                    {c.adName}
                  </p>
                  <p className="text-[11px] text-[#86868b] truncate">
                    {c.campaignName} · ROAS {c.roas.toFixed(1)}× · {Math.round(c.spend)} Kč
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
