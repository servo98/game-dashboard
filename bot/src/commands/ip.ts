import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

type ServerInfo = {
  id: string;
  name: string;
  game_type: string;
  port: number;
  status: "running" | "stopped" | "missing";
};

type PanelSettings = {
  host_domain: string;
};

export const data = new SlashCommandBuilder()
  .setName("ip")
  .setDescription("Show the connect address for the active game server");

function connectAddress(gameType: string, port: number, domain: string): string {
  if (gameType === "sandbox" && port === 25565) {
    return `mc.${domain}`;
  }
  return `${domain}:${port}`;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const [serversRes, settingsRes] = await Promise.all([
      fetch(`${process.env.BACKEND_URL}/api/servers`, {
        headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
      }),
      fetch(`${process.env.BACKEND_URL}/api/settings`, {
        headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
      }),
    ]);

    if (!serversRes.ok) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("Error")
            .setDescription("Failed to fetch server info."),
        ],
      });
      return;
    }

    const servers = (await serversRes.json()) as ServerInfo[];
    const active = servers.find((s) => s.status === "running");

    if (!active) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6b7280)
            .setTitle("No server running")
            .setDescription("There is no game server active right now."),
        ],
      });
      return;
    }

    const settings = settingsRes.ok
      ? ((await settingsRes.json()) as PanelSettings)
      : { host_domain: "aypapol.com" };

    const address = connectAddress(active.game_type, active.port, settings.host_domain);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle(active.name)
          .setDescription(`\`\`\`\n${address}\n\`\`\``)
          .setFooter({ text: `Port ${active.port}` }),
      ],
    });
  } catch {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("Error")
          .setDescription("Could not reach the backend. Is it running?"),
      ],
    });
  }
}
