import { useEffect, useRef, useState } from "react";
import { type ContainerStats, createStatsStream } from "../api";

type Props = {
  serverId: string;
  hostMemTotalMB?: number;
};

export default function StatsBar({ serverId, hostMemTotalMB }: Props) {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = createStatsStream(serverId);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ContainerStats;
        if ("cpuPercent" in data) setStats(data);
      } catch {
        // ignore
      }
    };

    return () => {
      es.close();
    };
  }, [serverId]);

  if (!stats) {
    return <div className="text-xs text-gray-600 animate-pulse">Loading stats...</div>;
  }

  const cpuCores = stats.cpuCores || 1;
  const cpuMax = cpuCores * 100;
  const cpuBarPct = Math.min(100, Math.max(0, (stats.cpuPercent / cpuMax) * 100));
  const cpuColor =
    cpuBarPct >= 90 ? "bg-red-500" : cpuBarPct >= 70 ? "bg-yellow-500" : "bg-brand-500";

  const ramDenominator = hostMemTotalMB ?? stats.memLimitMB;
  const ramPct = ramDenominator > 0 ? Math.min(100, (stats.memUsageMB / ramDenominator) * 100) : 0;
  const ramColor = ramPct >= 90 ? "bg-red-500" : ramPct >= 70 ? "bg-yellow-500" : "bg-purple-500";

  const formatMem = (mb: number) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* CPU */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 w-8 shrink-0">CPU</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${cpuColor} rounded-full transition-[width] duration-300`}
            style={{ width: `${cpuBarPct}%` }}
          />
        </div>
        <span className="text-gray-400 w-24 text-right shrink-0 tabular-nums whitespace-nowrap">
          {stats.cpuPercent.toFixed(0)}% / {cpuMax}%
        </span>
      </div>
      {/* RAM */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 w-8 shrink-0">RAM</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${ramColor} rounded-full transition-[width] duration-300`}
            style={{ width: `${ramPct}%` }}
          />
        </div>
        <span className="text-gray-400 w-24 text-right shrink-0 tabular-nums whitespace-nowrap">
          {formatMem(stats.memUsageMB)} / {formatMem(ramDenominator)}
        </span>
      </div>
    </div>
  );
}
