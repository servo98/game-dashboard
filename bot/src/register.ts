/**
 * Register slash commands with Discord.
 * Run once (or whenever commands change):
 *   bun run src/register.ts
 */
import { REST, Routes } from "discord.js";
import * as start from "./commands/start";
import * as stop from "./commands/stop";
import * as status from "./commands/status";
import * as ip from "./commands/ip";

const commands = [start.data, stop.data, status.data, ip.data].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN!);

const clientId = process.env.DISCORD_CLIENT_ID!;
const guildId = process.env.DISCORD_GUILD_ID;

async function main() {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    if (guildId) {
      // Guild-scoped (instant update, good for dev)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`Registered to guild ${guildId}`);
    } else {
      // Global (takes up to 1h to propagate)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log("Registered globally");
    }
  } catch (err) {
    console.error("Failed to register commands:", err);
    process.exit(1);
  }
}

main();
