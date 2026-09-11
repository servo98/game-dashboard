# Notification Channels — How They Work

All Discord messages are sent by **El Pepe Bot** using the Bot API (`POST /channels/{id}/messages` with `Authorization: Bot {token}`).

---

## 1. Bot Commands Channel (`allowed_channel_id`)

**Not a notification** — this is a **filter**.

- **Who uses it**: The Discord bot (discord.js process)
- **What it does**: Restricts slash commands (`/start`, `/stop`, `/status`) to a specific channel
- **Flow**: User runs `/start valheim` → bot checks if the channel matches `allowed_channel_id` → if not, rejects the command
- **If empty**: Bot commands work in all channels

---

## 2. Crash Notifications (`crashes_channel_id`)

**Sends an alert when a game server dies unexpectedly.**

- **Who sends it**: The backend (Bun/Hono), NOT the discord.js bot process
- **How it works**:
  1. When a game server starts, `watchContainer()` polls Docker every 30s
  2. If the container stops and it was NOT an intentional stop → `onCrash()` fires
  3. Backend reads `crashes_channel_id` from the database
  4. Backend calls Discord REST API directly: `POST /channels/{crashes_channel_id}/messages`
  5. Uses `DISCORD_BOT_TOKEN` for auth — so the message appears as El Pepe Bot
  6. Fallback: if no channel configured, uses `DISCORD_WEBHOOK_URL` env var
- **Embed**: Red, title "Servidor caído", names the server that crashed

---

## 3. Error Notifications (`errors_channel_id`)

**Sends an alert when the dashboard (React app) has a JavaScript error.**

- **Who sends it**: Dashboard → Backend → Discord API
- **How it works**:
  1. A JS error happens in the user's browser (render crash, unhandled exception, rejected promise)
  2. `ErrorBoundary` or `window.onerror` / `onunhandledrejection` catches it
  3. Dashboard calls `POST /api/notifications/error` with `{ message, stack, url, component }`
  4. Backend reads `errors_channel_id` from the database
  5. Backend calls Discord REST API: `POST /channels/{errors_channel_id}/messages`
  6. Throttled: max 1 error report per 30 seconds (client-side)
- **Embed**: Orange, title "Dashboard Error", includes stack trace and URL
- **If no channel configured**: Error is silently ignored (no notification sent)

---

## 4. Log Channel (`logs_channel_id`)

**Reserved for future use.** Currently stored in the database and configurable from the dashboard, but no code sends messages to it yet.

Potential uses:
- Notify when someone starts/stops a game server
- Log dashboard logins
- Service restart events

---

## 5. Update Notifications (`updates_channel_id`)

**Warns when a Valheim server falls behind on version — with a button to fix it.**

- **Who sends it**: The backend (`valheim-update-poller.ts`), NOT the discord.js bot process
- **Why it exists**: `lloesche/valheim-server` updates itself on boot and every 15 min by cron,
  but when steamcmd gets stuck mid-update it falls back to the old copy and logs
  `Valheim Server is already the latest version`. Restarting does not fix it, so the server can
  sit on an old build for days until a player hits "incompatible version".
- **How it works**:
  1. Every 10 min the poller reads Steam's `appmanifest_896660.acf` inside each running
     Valheim server's data volume
  2. Compares `buildid` (installed) against `TargetBuildID` (what Steam offers), and checks
     `UpdateResult` for a failed attempt
  3. A failed update warns immediately (steamcmd won't retry on its own); a merely pending one
     waits 45 min, long enough for the container's own cron to install it
  4. Posts to `updates_channel_id`, falling back to `crashes_channel_id` if unset
  5. Only one warning per build — it won't nag every cycle
- **Embed**: Orange "atascada" or blue "versión nueva", showing installed vs available build
- **Button**: "Actualizar ahora" (`custom_id: valheim-update:<serverId>`). The discord.js bot
  handles the click (`bot/src/buttons/valheim-update.ts`) and calls
  `POST /api/servers/:id/force-update`, which clears the stuck steamcmd state and restarts.
  Worlds live in a different volume and are never touched.
- **Note**: the message must come from the bot API, not a webhook — webhook messages can't
  have working buttons.

---

## 6. Deploy Notifications (GitHub Actions)

**Sends an alert when a deploy succeeds or fails.**

- **Who sends it**: GitHub Actions workflow (runs on GitHub's servers)
- **How it works**:
  1. Push to `main` triggers the deploy workflow
  2. After all deploy steps finish, the notification step runs
  3. Uses `curl` to call Discord REST API: `POST /channels/{DISCORD_DEPLOY_CHANNEL_ID}/messages`
  4. Uses `DISCORD_BOT_TOKEN` GitHub secret for auth — appears as El Pepe Bot
- **Embed (success)**: Green, shows commit message, author, and trigger type
- **Embed (failure)**: Red, shows commit and link to Actions logs
- **Config**: Requires two GitHub secrets: `DISCORD_BOT_TOKEN` + `DISCORD_DEPLOY_CHANNEL_ID`

---

## Summary

| Channel | Sender | Trigger | Mechanism |
|---------|--------|---------|-----------|
| Bot Commands | — (filter) | User runs slash command | Bot checks before executing |
| Crashes | Backend | Container dies unexpectedly | Backend → Discord API |
| Errors | Dashboard → Backend | JS error in browser | Dashboard POST → Backend → Discord API |
| Logs | — (future) | — | — |
| Updates | Backend | Valheim build behind Steam's | Backend → Discord API (with button) |
| Deploys | GitHub Actions | Push to main | curl → Discord API |

All messages use `DISCORD_BOT_TOKEN` and appear as **El Pepe Bot**.
