# Deploy Guide — Game Panel (Hetzner CX31)

## Prerequisites

- Hetzner CX31 (4 vCPU / 8 GB RAM) running Ubuntu 22.04
- A domain pointing to the server IP
- Docker + Docker Compose v2 installed
- A Discord Application (OAuth + Bot)

---

## 1. Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Clone the project

```bash
git clone https://github.com/your-user/game-panel.git
cd game-panel
```

## 3. Configure environment variables

```bash
cp .env.example .env
nano .env
```

Fill in every variable:

| Variable | Where to find it |
|----------|-----------------|
| `DISCORD_CLIENT_ID` | Discord Developer Portal → Your App → General Information |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 |
| `DISCORD_REDIRECT_URI` | Must match exactly: `https://yourdomain.com/api/auth/callback` |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Bot |
| `DISCORD_GUILD_ID` | Right-click your Discord server → Copy Server ID |
| `BOT_API_KEY` | Any random secret (e.g. `openssl rand -hex 32`) |
| `SESSION_SECRET` | Any random secret |
| `PUBLIC_URL` | `https://yourdomain.com` |

## 4. Discord App setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Under **OAuth2 → Redirects**, add: `https://yourdomain.com/api/auth/callback`
4. Under **Bot**, create a bot and copy the token
5. Invite the bot to your server:
   - Go to OAuth2 → URL Generator
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
   - Visit the generated URL and add the bot to your guild

## 5. Register slash commands

Run this once (needs your `.env` to be populated):

```bash
docker compose run --rm bot bun run src/register.ts
```

## 6. Create persistent data directories

```bash
sudo mkdir -p /data/minecraft /data/valheim /data/valheim-data
sudo chmod 777 /data/minecraft /data/valheim /data/valheim-data
```

## 7. (Optional) HTTPS with Let's Encrypt

If you want HTTPS, use Certbot + nginx-proxy or Traefik. Simplest approach:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com

# Then update nginx/nginx.conf to use SSL:
# listen 443 ssl;
# ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
# ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

Mount the certs in docker-compose.yml under the nginx service:
```yaml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

## 8. Start everything

```bash
docker compose up -d --build
```

Check logs:

```bash
docker compose logs -f
```

## 9. Verify

1. Open `https://yourdomain.com` → Login screen
2. Login with Discord → Redirected to panel
3. Click **Start Minecraft** → Container starts, logs appear
4. Click **Start Valheim** → Minecraft stops, Valheim starts
5. In Discord:
   - `/status` → Shows active server
   - `/start valheim` → Starts Valheim
   - `/stop` → Stops active server

---

## Updating the app

```bash
git pull
docker compose up -d --build
```

## Firewall (ufw)

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 25565/tcp  # Minecraft (when running)
sudo ufw allow 2456/udp   # Valheim (when running)
sudo ufw enable
```

## Useful commands

```bash
# View backend logs
docker compose logs -f backend

# Manually seed the database
docker compose exec backend bun run src/seed.ts

# Stop all game containers
docker compose exec backend bun -e "
import { stopGameContainer } from './src/docker';
import { getActiveContainer } from './src/docker';
const a = await getActiveContainer();
if (a) await stopGameContainer(a.name);
console.log('done');
"

# Restart just the bot
docker compose restart bot
```
