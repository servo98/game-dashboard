# Discord Bot Permissions

## Required Bot Permissions

| Permission           | Bit      | Why                                                  |
|----------------------|----------|------------------------------------------------------|
| View Channels        | `1024`   | List guild channels (`GET /guilds/:id/channels`)     |
| Send Messages        | `2048`   | Send crash/error notifications to configured channels|
| Embed Links          | `16384`  | Render rich embeds in notifications                  |
| Read Message History | `65536`  | Required by Discord for bots sending in channels     |

**Permission Integer**: `84992`

## How to Update

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select the **Game Panel** application
3. Go to **Bot** → make sure the bot has the permissions above
4. Go to **OAuth2** → **URL Generator**
5. Select scopes: `bot`, `applications.commands`
6. Select permissions: View Channels, Send Messages, Embed Links, Read Message History
7. Use the generated URL to re-invite the bot to your server

Invite/update URL:

```
https://discord.com/oauth2/authorize?client_id=1476784944436215981&permissions=84992&scope=bot+applications.commands
```

## Gateway Intents

Only `Guilds` is needed (already configured in `bot/src/index.ts`). No privileged intents required.
