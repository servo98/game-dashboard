import { botSettingsQueries } from "./db";

/**
 * Envío de mensajes a Discord como El Pepe Bot.
 *
 * Usamos la REST API con el token del bot (no un webhook) porque los mensajes
 * con botones necesitan venir de la propia app: las interacciones de un webhook
 * no llegan a ningún sitio.
 */

/** Primer canal configurado de la lista. Permite fallbacks entre ajustes. */
export function resolveChannelId(...keys: string[]): string | null {
  for (const key of keys) {
    const row = botSettingsQueries.get.get(key);
    if (row?.value) return row.value;
  }
  return null;
}

/** Publica un mensaje en un canal. Devuelve si salió. Nunca lanza. */
export async function sendBotMessage(
  channelId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[discord] mensaje rechazado (${res.status}): ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[discord] no se pudo enviar el mensaje:", err);
    return false;
  }
}
