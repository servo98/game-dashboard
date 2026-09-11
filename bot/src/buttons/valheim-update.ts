import { type ButtonInteraction, EmbedBuilder } from "discord.js";

/**
 * Botón "Actualizar ahora" de los avisos de versión de Valheim.
 *
 * El aviso lo publica el backend, no este proceso; aquí solo atendemos el
 * click. El custom_id trae el server al que pertenece: `valheim-update:<id>`.
 */

export const CUSTOM_ID_PREFIX = "valheim-update";

/** Extrae el id del server del custom_id, o null si no es nuestro botón. */
export function parseCustomId(customId: string): string | null {
  const [prefix, serverId] = customId.split(":");
  if (prefix !== CUSTOM_ID_PREFIX || !serverId) return null;
  return serverId;
}

export async function execute(interaction: ButtonInteraction): Promise<void> {
  const serverId = parseCustomId(interaction.customId);
  if (!serverId) return;

  // Reinstalar tarda minutos: hay que reconocer el click ya o Discord da el
  // botón por roto a los 3 segundos.
  await interaction.deferReply();

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/servers/${serverId}/force-update`, {
      method: "POST",
      headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
    });
    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

    if (!res.ok) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("No se pudo actualizar")
            .setDescription(data.error ?? "Error desconocido"),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("Actualizando Valheim")
          .setDescription(
            `Reinstalando **${serverId}** desde Steam. Tarda unos minutos; ` +
              `el servidor vuelve solo al terminar. El mundo no se toca.`,
          ),
      ],
    });

    // El botón ya cumplió: lo quitamos del aviso para que nadie lo repita.
    await interaction.message.edit({ components: [] }).catch(() => {});
  } catch (err) {
    console.error("Error en el botón de actualizar Valheim:", err);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("No se pudo actualizar")
          .setDescription("El panel no responde."),
      ],
    });
  }
}
