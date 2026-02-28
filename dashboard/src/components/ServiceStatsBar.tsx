import type { ServiceStats } from "../api";

type Props = {
  stats: ServiceStats | null;
};

export default function ServiceStatsBar({ stats }: Props) {
  if (!stats) {
    return <div className="text-xs text-gray-600 animate-pulse">...</div>;
  }

  const cpuPct = Math.min(100, Math.max(0, stats.cpuPercent));
  const ramMB = stats.memUsageMB;

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 w-8 shrink-0">CPU</span>
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-1000"
            style={{ width: `${cpuPct}%` }}
          />
        </div>
        <span className="text-gray-400 w-10 text-right shrink-0 tabular-nums">
          {cpuPct.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 w-8 shrink-0">RAM</span>
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all duration-1000"
            style={{ width: `${stats.memLimitMB > 0 ? (ramMB / stats.memLimitMB) * 100 : 0}%` }}
          />
        </div>
        <span className="text-gray-400 w-16 text-right shrink-0 tabular-nums whitespace-nowrap">
          {ramMB.toFixed(0)} MB
        </span>
      </div>
    </div>
  );
}
