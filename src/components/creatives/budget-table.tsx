"use client";

import Link from "next/link";
import type { BudgetRow, Recommendation } from "@/lib/budget-allocation";

interface Props {
  rows: BudgetRow[];
  shopId: string;
}

const REC_CONFIG: Record<
  Recommendation,
  { label: string; bg: string; text: string }
> = {
  navysit: { label: "Navysit", bg: "bg-emerald-100", text: "text-emerald-800" },
  udrzet: { label: "Udrzet", bg: "bg-gray-100", text: "text-gray-700" },
  snizit: { label: "Snizit", bg: "bg-amber-100", text: "text-amber-800" },
  vypnout: { label: "Vypnout", bg: "bg-red-100", text: "text-red-800" },
};

const SIGNAL_COLORS: Record<string, string> = {
  none: "bg-emerald-400",
  rising: "bg-yellow-400",
  fatigued: "bg-orange-400",
  critical: "bg-red-500",
};

export function BudgetTable({ rows, shopId }: Props) {
  return (
    <div className="rounded-2xl border border-[#e5e5e7] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#e5e5e7] bg-[#fafafa]">
              <th className="px-4 py-2.5 text-left font-medium text-[#86868b]">Kreativa</th>
              <th className="px-4 py-2.5 text-right font-medium text-[#86868b]">Spend</th>
              <th className="px-4 py-2.5 text-right font-medium text-[#86868b]">ROAS</th>
              <th className="px-4 py-2.5 text-right font-medium text-[#86868b]">Engagement</th>
              <th className="px-4 py-2.5 text-right font-medium text-[#86868b]">Fatigue</th>
              <th className="px-4 py-2.5 text-right font-medium text-[#86868b]">% Budget</th>
              <th className="px-4 py-2.5 text-center font-medium text-[#86868b]">Doporuceni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rec = REC_CONFIG[r.recommendation];
              const signalColor = SIGNAL_COLORS[r.fatigueSignal ?? "none"] ?? SIGNAL_COLORS.none;

              return (
                <tr
                  key={r.adId}
                  className="border-b border-[#f0f0f0] last:border-b-0 hover:bg-[#fafafa] transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/${shopId}/creatives/${r.adId}`}
                      className="flex items-center gap-2.5 hover:underline"
                    >
                      {r.thumbnailUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={r.thumbnailUrl}
                          alt=""
                          className="h-8 w-8 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-md bg-[#f0f0f0]" />
                      )}
                      <span className="max-w-[200px] truncate font-medium text-[#1d1d1f]">
                        {r.adName}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#1d1d1f]">
                    {Math.round(r.spend)} Kc
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#1d1d1f]">
                    {r.roas.toFixed(1)}x
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#1d1d1f]">
                    {r.engagementScore}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1.5 tabular-nums text-[#1d1d1f]">
                      <span className={`inline-block h-2 w-2 rounded-full ${signalColor}`} />
                      {r.fatigueScore !== null ? r.fatigueScore : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-[#1d1d1f]">
                    {(r.budgetShare * 100).toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium ${rec.bg} ${rec.text}`}
                    >
                      {rec.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
