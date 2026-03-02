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

  const cpuPct = Math.min(100, Math.max(0, stats.cpuPercent));
  const ramDenominator = hostMemTotalMB ?? stats.memLimitMB;
  const ramPct = ramDenominator > 0 ? Math.min(100, (stats.memUsageMB / ramDenominator) * 100) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      {/* CPU */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 w-8 shrink-0">CPU</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-[width] duration-300"
            style={{ width: `${cpuPct}%` }}
          />
        </div>
        <span className="text-gray-400 w-10 text-right shrink-0 tabular-nums">
          {cpuPct.toFixed(1)}%
        </span>
      </div>
      {/* RAM */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 w-8 shrink-0">RAM</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-[width] duration-300"
            style={{ width: `${ramPct}%` }}
          />
        </div>
        <span className="text-gray-400 w-16 text-right shrink-0 tabular-nums whitespace-nowrap">
          {stats.memUsageMB.toFixed(0)} MB
        </span>
      </div>
    </div>
  );
}
