import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

type ServerInfo = {
  id: string;
  name: string;
  game_type: string;
  port: number;
  status: "running" | "stopped" | "missing";
};

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show the status of all game servers");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/servers`, {
      headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
    });

    if (!res.ok) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("Error")
            .setDescription("Failed to fetch server status"),
        ],
      });
      return;
    }

    const servers = (await res.json()) as ServerInfo[];
    const active = servers.find((s) => s.status === "running");

    const embed = new EmbedBuilder()
      .setColor(active ? 0x22c55e : 0x6b7280)
      .setTitle("Game Panel — Server Status")
      .setTimestamp();

    if (active) {
      embed.setDescription(
        `**${active.name}** is currently running on port \`${active.port}\``
      );
    } else {
      embed.setDescription("No server is currently running.");
    }

    const fields = servers.map((s) => ({
      name: s.name,
      value: s.status === "running"
        ? `🟢 Running (port ${s.port})`
        : `⚫ ${s.status}`,
      inline: true,
    }));

    embed.addFields(fields);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
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
