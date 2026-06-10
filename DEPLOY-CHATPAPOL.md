# Despliegue de ChatPapol (chat.aypapol.com)

Discord propio (repo [servo98/chatAyPapol](https://github.com/servo98/chatAyPapol))
integrado al game-panel como **servicios compose always-on** (no un "game"):

- `chatpapol` — backend Bun (imagen `ghcr.io/servo98/chatpapol-server:latest`),
  publica `127.0.0.1:3210`, datos en el volumen `chatpapol-data` (SQLite + uploads).
- `livekit` — SFU de voz/video (`livekit/livekit-server`), red **host**, señalización
  en `7880`, media WebRTC por **UDP 50000-50100**.

Routing nginx: `chat.aypapol.com` → 3210, `livekit.aypapol.com` → 7880 (wss).
El backend solo firma tokens JWT localmente; no se conecta al SFU. La voz va
directa cliente↔VPS por UDP (no pasa por nginx).

## Orden de despliegue (la primera vez)

> ⚠️ El orden importa: nginx no arranca si referencia certs que aún no existen,
> y los certs se emiten con **certbot standalone** (necesita el :80 libre un instante).

### 1. DNS (en Hetzner) — manual
```
A   chat       → 5.161.218.218
A   livekit    → 5.161.218.218
```
Esperar propagación: `dig +short chat.aypapol.com` debe devolver la IP.

### 2. Secretos en el server (`.env`, NO se commitea — repo público)
Añadir a `/root/game-panel/.env` las keys de LiveKit (valores aparte, fuera de git):
```
LIVEKIT_KEY=...
LIVEKIT_SECRET=...
```
`LIVEKIT_URL` y `GITHUB_REPO` ya están hardcodeados en `docker-compose.yml`.

### 3. Emitir certs (standalone, con nginx en su config vieja todavía)
```bash
cd /root/game-panel
docker compose stop nginx                       # libera el :80
certbot certonly --standalone \
  -d chat.aypapol.com -d livekit.aypapol.com \
  --non-interactive --agree-tos --keep-until-expiring
docker compose start nginx
```

### 4. Desplegar el código nuevo (compose + nginx + livekit.yaml)
`git push origin main` → CI sincroniza y recrea nginx (ya encuentra los certs).
*(Los cambios de ChatPapol no disparan los jobs de build del panel; nginx sí se recrea.)*

### 5. Firewall + arrancar los servicios (server)
```bash
ufw allow 50000:50100/udp comment 'LiveKit media'
cd /root/game-panel
docker compose pull chatpapol livekit
docker compose up -d chatpapol livekit
```

### 6. Verificar
- `curl -I https://chat.aypapol.com` → 200/302 del backend.
- En el cliente Flutter, apuntar el server a `https://chat.aypapol.com`.
- Primer usuario registrado = Admin/dueño. Los demás necesitan invitación.
- Probar una llamada de voz (verifica que el UDP 50000-50100 está abierto).

## Día 2 (actualizaciones)
- El backend se reconstruye solo en GHCR al pushear `server/**` en el repo del chat.
- Para traer la imagen nueva al VPS: `docker compose pull chatpapol && docker compose up -d chatpapol`.
- Logs/restart de `chatpapol` y `livekit` disponibles desde el panel
  (añadidos a `ALLOWED_SERVICES`).

## Gap conocido
La CI del panel (`deploy.yml`) no tiene jobs para `chatpapol`/`livekit` (son imágenes
pre-buildeadas, no se construyen aquí). El primer arranque y los `pull` son manuales,
o se puede añadir un `workflow_dispatch` luego.
