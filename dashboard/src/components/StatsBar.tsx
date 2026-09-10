import { useEffect, useState } from "react";
import { type ContainerStats, createStatsStream } from "../api";
import { Meter } from "./ui";

type Props = {
  serverId: string;
  hostMemTotalMB?: number;
};

function mem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb.toFixed(0)}M`;
}

/** Consumo del contenedor de un servidor, en vivo. */
export default function StatsBar({ serverId, hostMemTotalMB }: Props) {
  const [stats, setStats] = useState<ContainerStats | null>(null);

  useEffect(() => {
    const es = createStatsStream(serverId);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ContainerStats;
        if ("cpuPercent" in data) setStats(data);
      } catch {
        // ignorar tramas rotas
      }
    };
    return () => es.close();
  }, [serverId]);

  if (!stats) {
    return <p className="text-meta text-faint">Midiendo consumo</p>;
  }

  const cpuMax = (stats.cpuCores || 1) * 100;
  const ramTotal = hostMemTotalMB ?? stats.memLimitMB;

  return (
    <div className="flex flex-col gap-1.5">
      <Meter
        label="CPU"
        value={stats.cpuPercent}
        max={cpuMax}
        readout={`${stats.cpuPercent.toFixed(0)}% de ${cpuMax}%`}
      />
      <Meter
        label="RAM"
        value={stats.memUsageMB}
        max={ramTotal}
        readout={`${mem(stats.memUsageMB)} de ${mem(ramTotal)}`}
      />
    </div>
  );
}
