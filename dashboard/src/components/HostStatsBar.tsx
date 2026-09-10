import { useEffect, useRef, useState } from "react";
import { createHostStatsStream, type HostStats } from "../api";
import { Meter, Sparkline } from "./ui";

type Props = {
  onMemTotal?: (totalMB: number) => void;
};

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(1)}G`;
}

/**
 * Telemetría del anfitrión, al pie de la barra lateral. Antes era una tarjeta
 * que empujaba el contenido hacia abajo; aquí está siempre visible y sin robar
 * ancho, que es justo lo que se espera de un panel de instrumentos.
 */
export default function HostStatsBar({ onMemTotal }: Props) {
  const [stats, setStats] = useState<HostStats | null>(null);
  const reported = useRef(false);

  useEffect(() => {
    const es = createHostStatsStream();

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as HostStats;
        setStats(data);
        if (!reported.current && data.memTotalMB > 0 && onMemTotal) {
          reported.current = true;
          onMemTotal(data.memTotalMB);
        }
      } catch {
        // trama incompleta, llega otra en un segundo
      }
    };

    return () => es.close();
  }, [onMemTotal]);

  const cpu = stats ? Math.min(100, Math.max(0, stats.cpuPercent)) : null;
  const ramPct = stats && stats.memTotalMB > 0 ? (stats.memUsageMB / stats.memTotalMB) * 100 : 0;
  const diskPct = stats && stats.diskTotalGB > 0 ? (stats.diskUsedGB / stats.diskTotalGB) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label">Anfitrión</span>
        <span className="num text-micro text-faint">{stats ? `${cpu?.toFixed(0)}%` : "···"}</span>
      </div>

      <Sparkline value={cpu} title="Carga de CPU del anfitrión" />

      {stats ? (
        <div className="flex flex-col gap-1.5">
          <Meter label="CPU" value={cpu ?? 0} readout={`${(cpu ?? 0).toFixed(0)}%`} />
          <Meter
            label="RAM"
            value={ramPct}
            readout={`${gb(stats.memUsageMB)}/${gb(stats.memTotalMB)}`}
          />
          <Meter
            label="SSD"
            value={diskPct}
            readout={`${stats.diskUsedGB.toFixed(0)}/${stats.diskTotalGB.toFixed(0)}G`}
          />
        </div>
      ) : (
        <p className="text-meta text-faint">Conectando</p>
      )}
    </div>
  );
}
