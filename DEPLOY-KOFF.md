# Despliegue de KOFF (coffeekoff.com)

Landing + tarjeta de lealtad + admin de tickets de KOFF (repo privado
[servo98/koff](https://github.com/servo98/koff)). Es **un solo servicio compose
always-on** (como chatpapol, no un "game"):

- `koff` — binario Go con SQLite (imagen `ghcr.io/servo98/koff:latest`, ~15 MB),
  publica `127.0.0.1:3300`, datos en `/data/koff` del host (`koff.db` + `backups/`).
- Un solo contenedor atiende los 4 hosts y decide por el `Host`:

| Host | Qué sirve |
|---|---|
| `coffeekoff.com` | Landing, `/tarjeta`, `/s/<código>` (QR del ticket), `/privacidad` |
| `www.coffeekoff.com` | Redirige a `coffeekoff.com` (lo hace la app) |
| `api.coffeekoff.com` | API pública de la tarjeta (CORS solo para `coffeekoff.com`) |
| `admin.coffeekoff.com` | Creador de tickets, historial, clientes, ajustes (passkey o contraseña + TOTP) |

> Importante: el orden importa, igual que en ChatPapol y Rubas: nginx no arranca si
> referencia un cert que no existe, y **se caen todos los sitios**. El cert se
> emite ANTES de pushear el `nginx.conf` nuevo.

## Orden de despliegue (la primera vez)

### 1. DNS (Hetzner, zona `coffeekoff.com`) — ya hecho
```
A   @       → 5.161.218.218
A   www     → 5.161.218.218
A   api     → 5.161.218.218
A   admin   → 5.161.218.218
```
Nameservers en Namecheap: Custom DNS con `hydrogen.ns.hetzner.com`,
`oxygen.ns.hetzner.com`, `helium.ns.hetzner.de`. Verificar:
```bash
for h in coffeekoff.com www.coffeekoff.com api.coffeekoff.com admin.coffeekoff.com; do dig +short $h; done
```
Las cuatro deben devolver `5.161.218.218`.

### 2. Acceso a la imagen privada (server, una vez)
El repo es privado, así que la imagen en GHCR también. Crear un token en GitHub
(Settings → Developer settings → Personal access tokens → *classic*, solo el
permiso `read:packages`) y en el server:
```bash
docker login ghcr.io -u servo98    # pega el token como password
```

### 3. Directorio de datos (server) con el dueño correcto
La imagen corre como el usuario `nonroot` (uid 65532). **Hazlo antes de arrancar**:
si el bind-mount no existe, Docker lo crea como `root` y koff no puede escribir.
```bash
mkdir -p /data/koff
chown 65532:65532 /data/koff
```

### 4. Emitir el cert (standalone, con nginx en su config vieja todavía)
```bash
cd /root/game-panel
docker compose stop nginx                       # libera el :80 (corta los sitios unos segundos)
certbot certonly --standalone \
  -d coffeekoff.com -d www.coffeekoff.com -d api.coffeekoff.com -d admin.coffeekoff.com \
  --non-interactive --agree-tos --keep-until-expiring
docker compose start nginx
```
El cert queda en `/etc/letsencrypt/live/coffeekoff.com/` (ya montado `:ro` en nginx).

### 5. Desplegar la config (compose + nginx)
`git push origin main` en este repo → la CI sincroniza y recrea nginx (ya encuentra el cert).
Hasta el paso 6, `coffeekoff.com` responde 502: es normal.

### 6. Arrancar koff (server)
```bash
cd /root/game-panel
docker compose pull koff
docker compose up -d koff
docker compose ps koff          # debe quedar "healthy" en unos segundos
```

### 7. Crear el acceso de admin (una sola vez)
Al arrancar sin admin, koff escribe en sus logs un enlace de un solo uso (dura 24 h):
```bash
docker compose logs koff | grep enlace
```
Abre ese enlace en tu navegador y sigue los 3 pasos:
1. Contraseña (mínimo 12 caracteres) + escanear el QR con Google Authenticator.
2. Guardar los 10 códigos de recuperación (descárgalos o imprímelos).
3. Registrar tu passkey (huella o cara). Repite en Ajustes → Seguridad para cada dispositivo.

Nadie más puede crear cuenta: no existe registro, y el enlace solo se ve en los logs del server.

### 8. Verificar
```bash
curl -I https://coffeekoff.com                      # 200
curl -I https://www.coffeekoff.com                  # 301 → https://coffeekoff.com/
curl -s https://api.coffeekoff.com/v1/tarjeta       # {"card":null}
curl -I https://admin.coffeekoff.com                # 302 → /login
```
Después: hacer un ticket de prueba sin teléfono con una bebida, imprimirlo,
escanear el QR con el celular y confirmar que el sello aparece en `/tarjeta`.

## Día 2

- **Actualizar:** cada push a `main` de `servo98/koff` corre las pruebas y publica
  la imagen en GHCR (GitHub Actions). Para traerla al VPS:
  ```bash
  docker compose pull koff && docker compose up -d koff
  ```
- **Respaldos:** koff hace una copia diaria consistente en `/data/koff/backups/`
  (guarda 14 días). Recomendado: copiarlos fuera del VPS (Storage Box, rclone, etc.).
  Respaldo manual: `docker compose exec koff /koff backup`.
- **Restaurar:** `docker compose stop koff`, copiar el respaldo elegido encima de
  `/data/koff/koff.db` (borrar `koff.db-wal` y `koff.db-shm` si existen),
  `chown 65532:65532` y `docker compose start koff`.
- **Perdí el acceso al admin** (sin celular y sin códigos):
  ```bash
  docker compose exec koff /koff reset-admin    # borra credenciales y sesiones; imprime un enlace nuevo
  ```
  Los tickets, clientes y sellos no se tocan.
- **El enlace de configuración caducó** (antes de crear el admin):
  `docker compose exec koff /koff setup-link`.
- **Renovación del cert:** la misma que los demás sitios (certbot standalone).

## Impresión de tickets
El ticket mide 58 mm (impresora térmica). En el diálogo de impresión del navegador:
márgenes **ninguno**, escala **100 %**, sin encabezados ni pies de página.

## Gap conocido
La CI del panel no tiene job para `koff` (imagen pre-buildeada, igual que chatpapol):
el primer arranque y los `pull` son manuales. Tampoco aparece todavía en la página
de servicios del panel (`ALLOWED_SERVICES`).
