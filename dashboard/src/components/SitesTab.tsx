import type { ServiceStats } from "../api";
import { SERVICE_CATALOG, type ServiceGroup, type ServiceMeta } from "../serviceCatalog";
import { LogsIcon, RestoreIcon } from "./Icons";
import ServiceStatsBar from "./ServiceStatsBar";
import { Button, ButtonLink, Divider, Panel, SectionRule, StatusMark, Tag } from "./ui";

type Props = {
  serviceStats: Record<string, ServiceStats>;
  restartingService: string | null;
  onViewLogs: (name: string) => void;
  onRestart: (name: string) => void;
};

/** Tarjeta de un servicio always-on: qué es, dónde vive y cómo va. */
function ServiceCard({
  meta,
  stats,
  restarting,
  onViewLogs,
  onRestart,
}: {
  meta: ServiceMeta;
  stats: ServiceStats | null;
  restarting: boolean;
  onViewLogs: (name: string) => void;
  onRestart: (name: string) => void;
}) {
  return (
    <Panel className="flex flex-col" as="article">
      <div className="flex items-start justify-between gap-2 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-body font-medium text-ink">{meta.name}</span>
            <span className="num text-micro uppercase text-faint">{meta.id}</span>
          </div>
          <p className="mt-0.5 text-meta text-muted">{meta.description}</p>
        </div>
        <StatusMark tone={stats ? "ok" : "idle"} label={stats ? "Activo" : "Sin dato"} />
      </div>
      <Divider />
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-2">
        {meta.domains.map((domain) =>
          domain.url ? (
            <ButtonLink
              key={domain.label}
              tone="ghost"
              size="sm"
              href={domain.url}
              target="_blank"
              rel="noreferrer"
            >
              {domain.label}
            </ButtonLink>
          ) : (
            <Tag key={domain.label}>{domain.label}</Tag>
          ),
        )}
      </div>
      <Divider />
      <div className="px-3.5 py-2.5">
        <ServiceStatsBar stats={stats} />
      </div>
      <Divider />
      <div className="flex items-center gap-1 px-3.5 py-2">
        <Button tone="ghost" size="sm" onClick={() => onViewLogs(meta.id)}>
          <LogsIcon className="h-3.5 w-3.5" />
          Registro
        </Button>
        {meta.restartable && (
          <Button tone="ghost" size="sm" onClick={() => onRestart(meta.id)} disabled={restarting}>
            <RestoreIcon className="h-3.5 w-3.5" />
            {restarting ? "Reiniciando" : "Reiniciar"}
          </Button>
        )}
      </div>
    </Panel>
  );
}

const GROUP_LABEL: Record<ServiceGroup, string> = {
  sitios: "Sitios",
  infra: "Infraestructura del panel",
};

/**
 * Sitios y servicios: todo lo que corre siempre, aparte de las partidas de
 * juego. Se agrupa en "Sitios" (proyectos con dominio propio) e
 * "Infraestructura del panel" (lo que sostiene al resto), en ese orden porque
 * es lo que más le importa a quien entra aquí a mirar si algo está caído.
 */
export default function SitesTab({
  serviceStats,
  restartingService,
  onViewLogs,
  onRestart,
}: Props) {
  const groups: ServiceGroup[] = ["sitios", "infra"];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const services = SERVICE_CATALOG.filter((s) => s.group === group);
        return (
          <section key={group} className="flex flex-col gap-3">
            <SectionRule>{GROUP_LABEL[group]}</SectionRule>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {services.map((meta) => (
                <ServiceCard
                  key={meta.id}
                  meta={meta}
                  stats={serviceStats[meta.id] ?? null}
                  restarting={restartingService === meta.id}
                  onViewLogs={onViewLogs}
                  onRestart={onRestart}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
