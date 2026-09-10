import { memo } from "react";
import type { ServiceStats } from "../api";
import { Meter } from "./ui";

type Props = {
  stats: ServiceStats | null;
};

/** Consumo de un servicio de infraestructura. */
export default memo(function ServiceStatsBar({ stats }: Props) {
  if (!stats) {
    return <p className="text-meta text-faint">Sin lectura</p>;
  }

  const cpu = Math.min(100, Math.max(0, stats.cpuPercent));

  return (
    <div className="flex flex-col gap-1.5">
      <Meter label="CPU" value={cpu} readout={`${cpu.toFixed(1)}%`} />
      <Meter
        label="RAM"
        value={stats.memUsageMB}
        max={stats.memLimitMB > 0 ? stats.memLimitMB : stats.memUsageMB || 1}
        readout={`${stats.memUsageMB.toFixed(0)} MB`}
      />
    </div>
  );
});
