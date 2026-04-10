import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  subValue?: string;
  className?: string;
}

export function MetricStatCard({ label, value, subValue, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#e5e5ea] bg-white px-4 py-3",
        className
      )}
    >
      <p className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-[20px] font-bold text-[#1d1d1f] tabular-nums mt-0.5">
        {value}
      </p>
      {subValue && (
        <p className="text-[11px] text-[#86868b] mt-0.5">{subValue}</p>
      )}
    </div>
  );
}
