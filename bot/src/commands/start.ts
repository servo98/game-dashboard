import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("start")
  .setDescription("Start a game server")
  .addStringOption((opt) =>
    opt
      .setName("game")
      .setDescription("Which game server to start")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/servers`, {
      headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
    });
    const servers = (await res.json()) as Array<{ id: string; name: string }>;
    const filtered = servers
      .filter((s) => s.name.toLowerCase().includes(focused) || s.id.toLowerCase().includes(focused))
      .slice(0, 25);

    await interaction.respond(
      filtered.map((s) => ({ name: s.name, value: s.id }))
    );
  } catch {
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const gameId = interaction.options.getString("game", true);
  await interaction.deferReply();

  try {
    const res = await fetch(
      `${process.env.BACKEND_URL}/api/servers/${gameId}/start`,
      {
        method: "POST",
        headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
      }
    );

    const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

    if (!res.ok) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("Failed to start server")
            .setDescription(data.error ?? "Unknown error"),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f6ef7)
          .setTitle("Server Starting")
          .setDescription(data.message ?? `${gameId} is starting up...`)
          .setFooter({ text: "Check /status in a minute for connection details" }),
      ],
    });
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
