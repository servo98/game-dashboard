import { type ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stop the currently running game server");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/servers/active/stop`, {
      method: "POST",
      headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
    });

    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

    if (!res.ok) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("Failed to stop server")
            .setDescription(data.error ?? "Unknown error"),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf97316)
          .setTitle("Server Stopped")
          .setDescription(data.message ?? "Server has been stopped."),
      ],
    });
  } catch (_err) {
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
