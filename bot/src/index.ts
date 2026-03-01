import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  Client,
  Collection,
  GatewayIntentBits,
} from "discord.js";
import * as ip from "./commands/ip";
import * as start from "./commands/start";
import * as status from "./commands/status";
import * as stop from "./commands/stop";

type Command = {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

const commands = new Collection<string, Command>();

for (const cmd of [start, stop, status, ip]) {
  commands.set(cmd.data.name, cmd as Command);
}

// --- Bot settings cache ---

let cachedAllowedChannelId: string | null | undefined; // undefined = not yet loaded
let lastSettingsFetch = 0;

async function getAllowedChannelId(): Promise<string | null> {
  const now = Date.now();
  if (cachedAllowedChannelId !== undefined && now - lastSettingsFetch < 60_000) {
    return cachedAllowedChannelId;
  }
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/bot/settings`, {
      headers: { "X-Bot-Api-Key": process.env.BOT_API_KEY! },
    });
    const data = (await res.json()) as { allowed_channel_id: string | null };
    cachedAllowedChannelId = data.allowed_channel_id;
    lastSettingsFetch = now;
  } catch {
    // Keep stale cache on network errors
  }
  return cachedAllowedChannelId ?? null;
}

// --- Discord client ---

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", (c) => {
  console.log(`Bot ready as ${c.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  // Handle autocomplete
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`Error in autocomplete for /${interaction.commandName}:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Channel guard
  const allowedChannelId = await getAllowedChannelId();
  if (allowedChannelId && interaction.channelId !== allowedChannelId) {
    await interaction.reply({
      content: "Este canal no está autorizado para comandos.",
      ephemeral: true,
    });
    return;
  }

  const command = commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: "Unknown command", ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const msg = { content: "An error occurred.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(msg);
    } else {
      await interaction.reply(msg);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
