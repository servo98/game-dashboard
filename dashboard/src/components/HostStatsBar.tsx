import { useEffect, useRef, useState } from "react";
import { createHostStatsStream, type HostStats } from "../api";

type Props = {
  onMemTotal?: (totalMB: number) => void;
};

export default function HostStatsBar({ onMemTotal }: Props) {
  const [stats, setStats] = useState<HostStats | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    const es = createHostStatsStream();
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as HostStats;
        setStats(data);
        if (!reportedRef.current && data.memTotalMB > 0 && onMemTotal) {
          reportedRef.current = true;
          onMemTotal(data.memTotalMB);
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, [onMemTotal]);

  if (!stats) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
        <div className="text-xs text-gray-600 animate-pulse">Loading host stats...</div>
      </div>
    );
  }

  const cpuPct = Math.min(100, Math.max(0, stats.cpuPercent));
  const ramPct = stats.memTotalMB > 0 ? (stats.memUsageMB / stats.memTotalMB) * 100 : 0;
  const diskPct = stats.diskTotalGB > 0 ? (stats.diskUsedGB / stats.diskTotalGB) * 100 : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
      <p className="text-xs text-gray-500 mb-3 font-medium">Host</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* CPU */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">CPU</span>
            <span className="text-gray-400 tabular-nums">{cpuPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-[width] duration-300"
              style={{ width: `${cpuPct}%` }}
            />
          </div>
        </div>
        {/* RAM */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">RAM</span>
            <span className="text-gray-400 tabular-nums">
              {stats.memUsageMB.toFixed(0)} / {stats.memTotalMB.toFixed(0)} MB ({ramPct.toFixed(1)}
              %)
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-[width] duration-300"
              style={{ width: `${ramPct}%` }}
            />
          </div>
        </div>
        {/* Disk */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Disk</span>
            <span className="text-gray-400 tabular-nums">
              {stats.diskUsedGB.toFixed(1)} / {stats.diskTotalGB.toFixed(1)} GB (
              {diskPct.toFixed(1)}%)
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-[width] duration-300"
              style={{ width: `${diskPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
