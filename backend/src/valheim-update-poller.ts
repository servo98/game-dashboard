import {
  isValheimImage,
  readValheimBuildStatus,
  type ValheimBuildStatus,
} from "./adapters/valheim/build-status";
import { serverQueries } from "./db";
import { resolveChannelId, sendBotMessage } from "./discord";
import { getRunningGameServers } from "./docker";

/**
 * Vigila que los servers de Valheim no se queden atrás de versión.
 *
 * El contenedor ya se actualiza solo al arrancar y cada 15 min por cron; esto
 * no duplica ese trabajo, vigila que ocurra. El fallo real no es "no hay
 * update", es que steamcmd se atasca y el updater lo tapa diciendo que todo
 * está al día, así que el server puede pasar días viejo y solo te enteras
 * cuando alguien no puede entrar.
 */

const POLL_INTERVAL = 10 * 60_000;

/**
 * Margen antes de avisar de una versión pendiente. El cron del contenedor mira
 * cada 15 min y luego tarda en bajar un par de gigas: por debajo de esto
 * estaríamos avisando de updates que ya se están aplicando solos.
 */
export const PENDING_GRACE_MS = 45 * 60_000;

type Memory = {
  /** Build que veníamos siguiendo. Si cambia, el seguimiento empieza de cero. */
  trackedBuild: string | null;
  /** Cuándo la vimos por primera vez, para el margen de gracia. */
  firstSeenAt: number;
  /** Si ya avisamos por ella, para no repetirnos cada vuelta. */
  notified: boolean;
};

const memory = new Map<string, Memory>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * ¿Toca avisar? Un update fallido es inmediato porque steamcmd no reintentará
 * por su cuenta; uno pendiente se le da tiempo a resolverse solo.
 */
export function shouldWarn(status: ValheimBuildStatus, firstSeenAt: number, now: number): boolean {
  if (status.state === "update-failed") return true;
  if (status.state === "update-pending") return now - firstSeenAt >= PENDING_GRACE_MS;
  return false;
}

function buildMessage(serverId: string, serverName: string, status: ValheimBuildStatus) {
  const failed = status.state === "update-failed";

  const embed = {
    title: failed ? "⚠️ Actualización de Valheim atascada" : "🆕 Valheim tiene versión nueva",
    description: failed
      ? `**${serverName}** no consigue actualizarse: el último intento de Steam falló y no se reintenta solo. ` +
        `Reiniciar no lo arregla — hay que limpiar el estado de descarga.`
      : `**${serverName}** sigue en una versión antigua y el servidor no la ha instalado todavía. ` +
        `Si los jugadores ven "versión incompatible", es esto.`,
    color: failed ? 0xe67e22 : 0x3498db,
    fields: [
      { name: "Instalada", value: status.installedBuild ?? "?", inline: true },
      { name: "Disponible", value: status.targetBuild ?? "?", inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: failed ? 4 : 1, // rojo si hay que reparar, azul si es rutina
            label: "Actualizar ahora",
            custom_id: `valheim-update:${serverId}`,
          },
        ],
      },
    ],
  };
}

async function pollValheimUpdates(): Promise<void> {
  try {
    const running = await getRunningGameServers();

    for (const container of running) {
      const server = serverQueries.getById.get(container.name);
      if (!server || !isValheimImage(server.docker_image)) continue;

      const status = readValheimBuildStatus(JSON.parse(server.volumes) as Record<string, string>);
      const now = Date.now();

      if (status.state === "up-to-date" || status.state === "unknown") {
        memory.delete(server.id);
        continue;
      }

      // Una build distinta a la que veníamos siguiendo empieza de cero: ni el
      // margen de gracia ni el aviso anterior valen para la nueva.
      const previous = memory.get(server.id);
      const entry =
        previous?.trackedBuild === status.targetBuild
          ? previous
          : { trackedBuild: status.targetBuild, firstSeenAt: now, notified: false };
      memory.set(server.id, entry);

      if (entry.notified) continue;
      if (!shouldWarn(status, entry.firstSeenAt, now)) continue;

      const channelId = resolveChannelId("updates_channel_id", "crashes_channel_id");
      if (!channelId) continue;

      const sent = await sendBotMessage(channelId, buildMessage(server.id, server.name, status));
      if (sent) {
        memory.set(server.id, { ...entry, notified: true });
        console.log(
          `[ValheimUpdates] aviso enviado para ${server.id}: ${status.installedBuild} -> ${status.targetBuild} (${status.state})`,
        );
      }
    }
  } catch (err) {
    console.error("[ValheimUpdates] fallo en el ciclo de comprobación:", err);
  }
}

export function startValheimUpdatePoller(): void {
  if (pollTimer) return;
  console.log("[ValheimUpdates] vigilando versiones de Valheim (cada 10 min)");
  pollTimer = setInterval(pollValheimUpdates, POLL_INTERVAL);
  setTimeout(pollValheimUpdates, 20_000);
}

export function stopValheimUpdatePoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  memory.clear();
}
