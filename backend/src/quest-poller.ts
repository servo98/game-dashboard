import type { QuestProgress } from "./adapters/adapter";
import { createMinecraftAdapter, getServerDataPath } from "./adapters/minecraft/index";
import { getQuestTitleMap } from "./adapters/minecraft/quests";
import { botSettingsQueries, serverQueries } from "./db";
import { getActiveContainer } from "./docker";

const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_NOTIFICATIONS_PER_CYCLE = 5;

/** Snapshot of completed quest IDs per player */
const previousState = new Map<string, Set<string>>();
let isFirstLoad = true;
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
    // 1. Check if there's an active MC server
    const active = await getActiveContainer();
    if (!active) {
      // Server stopped — reset state for fresh start next time
      if (previousState.size > 0) {
        console.log("[QuestPoller] No active server, clearing snapshot");
        previousState.clear();
        isFirstLoad = true;
      }
      return;
    }

    // 2. Check if it's a Minecraft server with FTB Quests
    const serverId = active.name;
    const server = serverQueries.getById.get(serverId);
    if (!server || server.game_type !== "minecraft") return;

    const dataPath = getServerDataPath(serverId);
    if (!dataPath) return;

    const adapter = await createMinecraftAdapter(serverId);
    if (!adapter || !adapter.detectedSystems.includes("ftbquests")) return;

    // 3. Read all quest progress
    const allProgress = await adapter.getAllQuestProgress();
    if (allProgress.length === 0) return;

    // 4. Compare with previous snapshot
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

    // 5. On first load, just record state without notifying
    if (isFirstLoad) {
      console.log(
        `[QuestPoller] Initial snapshot loaded: ${allProgress.length} players, ${Array.from(previousState.values()).reduce((sum, s) => sum + s.size, 0)} total completed quests`,
      );
      isFirstLoad = false;
      return;
    }

    if (newCompletions.length === 0) return;

    // 6. Resolve quest titles
    const titleMap = await getQuestTitleMap(dataPath);

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

    const toSend = newCompletions.slice(0, MAX_NOTIFICATIONS_PER_CYCLE);

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

    if (newCompletions.length > MAX_NOTIFICATIONS_PER_CYCLE) {
      console.log(
        `[QuestPoller] ${newCompletions.length - MAX_NOTIFICATIONS_PER_CYCLE} notifications queued for next cycle`,
      );
    }
  } catch (err) {
    console.error("[QuestPoller] Error during poll cycle:", err);
  }
}
