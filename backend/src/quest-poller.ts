import { createMinecraftAdapter, getServerDataPath } from "./adapters/minecraft/index";
import { getQuestTitleMap } from "./adapters/minecraft/quests";
import { botSettingsQueries, serverQueries } from "./db";
import { getRunningGameServers } from "./docker";

const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_NOTIFICATIONS_PER_CYCLE = 5;

/** Quest snapshot per server: completed quest IDs per player + first-load flag.
 * Per-server para no mezclar el progreso entre varios servidores corriendo. */
type ServerQuestState = { completed: Map<string, Set<string>>; isFirstLoad: boolean };
const serverStates = new Map<string, ServerQuestState>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the quest completion poller.
 * Polls every 30s for newly completed quests and sends Discord notifications.
 */
export function startQuestPoller(): void {
  if (pollTimer) return;
  console.log("[QuestPoller] Starting quest completion poller (30s interval)");
  pollTimer = setInterval(pollQuests, POLL_INTERVAL);
  // Run once immediately after a short delay to let server finish booting
  setTimeout(pollQuests, 5000);
}

export function stopQuestPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollQuests(): Promise<void> {
  try {
    // Pollea CADA servidor corriendo (varios pueden estar activos a la vez)
    const running = await getRunningGameServers();
    const runningIds = new Set(running.map((r) => r.name));

    // Limpia el snapshot de servidores que ya no están corriendo
    for (const id of [...serverStates.keys()]) {
      if (!runningIds.has(id)) {
        console.log(`[QuestPoller] ${id} stopped, clearing snapshot`);
        serverStates.delete(id);
      }
    }

    for (const { name } of running) {
      await pollServerQuests(name);
    }
  } catch (err) {
    console.error("[QuestPoller] Error during poll cycle:", err);
  }
}

async function pollServerQuests(serverId: string): Promise<void> {
  try {
    // Solo servidores Minecraft con FTB Quests
    const server = serverQueries.getById.get(serverId);
    if (!server || server.game_type !== "minecraft") return;

    const dataPath = getServerDataPath(serverId);
    if (!dataPath) return;

    const adapter = await createMinecraftAdapter(serverId);
    if (!adapter || !adapter.detectedSystems.includes("ftbquests")) return;

    // Read all quest progress
    const allProgress = await adapter.getAllQuestProgress();
    if (allProgress.length === 0) return;

    // Estado por-servidor (crea uno en el primer ciclo)
    let state = serverStates.get(serverId);
    if (!state) {
      state = { completed: new Map(), isFirstLoad: true };
      serverStates.set(serverId, state);
    }
    const previousState = state.completed;
    const isFirstLoad = state.isFirstLoad;

    // Compare with previous snapshot
    const newCompletions: { playerName: string; questId: string }[] = [];

    for (const progress of allProgress) {
      const prevCompleted = previousState.get(progress.playerName);
      const currentCompleted = new Set(progress.completed);

      if (prevCompleted && !isFirstLoad) {
        // Find newly completed quests
        for (const questId of progress.completed) {
          if (!prevCompleted.has(questId)) {
            newCompletions.push({ playerName: progress.playerName, questId });
          }
        }
      }

      // Update snapshot
      previousState.set(progress.playerName, currentCompleted);
    }

    // On first load, just record state without notifying
    if (isFirstLoad) {
      console.log(
        `[QuestPoller] [${serverId}] Initial snapshot loaded: ${allProgress.length} players, ${Array.from(previousState.values()).reduce((sum, s) => sum + s.size, 0)} total completed quests`,
      );
      state.isFirstLoad = false;
      return;
    }

    if (newCompletions.length === 0) return;

    // 6. Resolve quest titles and filter to known quests only (progress maps also contain task IDs)
    const titleMap = await getQuestTitleMap(dataPath);
    const questCompletions = newCompletions.filter((c) => titleMap.has(c.questId));
    if (questCompletions.length === 0) return;

    // 7. Send Discord notifications (rate limited)
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const channelId = botSettingsQueries.get.get("quests_channel_id")?.value;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!webhookUrl && !(channelId && botToken)) {
      // No notification channel configured, just log
      for (const c of newCompletions) {
        const info = titleMap.get(c.questId);
        console.log(
          `[QuestPoller] ${c.playerName} completed "${info?.title ?? c.questId}" (no Discord channel configured)`,
        );
      }
      return;
    }

    const toSend = questCompletions.slice(0, MAX_NOTIFICATIONS_PER_CYCLE);

    for (const completion of toSend) {
      const info = titleMap.get(completion.questId);
      const questTitle = info?.title ?? completion.questId;
      const chapterTitle = info?.chapter ?? "Unknown Chapter";

      const embed = {
        title: "Quest Completed!",
        description: `**${completion.playerName}** completed **"${questTitle}"**\nChapter: ${chapterTitle}`,
        color: 5763719, // Green
        timestamp: new Date().toISOString(),
      };

      try {
        if (channelId && botToken) {
          // Send via bot API to specific channel
          await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ embeds: [embed] }),
          });
        } else if (webhookUrl) {
          // Fallback to webhook
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
          });
        }

        console.log(`[QuestPoller] Notified: ${completion.playerName} completed "${questTitle}"`);
      } catch (err) {
        console.error(`[QuestPoller] Failed to send notification:`, err);
      }
    }

    if (questCompletions.length > MAX_NOTIFICATIONS_PER_CYCLE) {
      console.log(
        `[QuestPoller] ${questCompletions.length - MAX_NOTIFICATIONS_PER_CYCLE} notifications queued for next cycle`,
      );
    }
  } catch (err) {
    console.error("[QuestPoller] Error during poll cycle:", err);
  }
}
