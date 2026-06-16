# Despliegue de Rubas (rubas.aypapol.com)

Hosting de **sitios estáticos** (HTML/CSS/JS) para Rubas. Sube carpetas
arrastrándolas en un panel web y nginx las sirve como webs reales. Dos piezas:

- `filebrowser` — panel de subida (fork [gtsteffaniak/Quantum](https://github.com/gtsteffaniak/filebrowser),
  imagen `gtstef/filebrowser:stable`), publica `127.0.0.1:3290`, estado en el
  volumen `filebrowser-data`. Servido bajo `rubas.aypapol.com/admin/` con login.
- **nginx** sirve el árbol `/srv/rubas/sites` del host (montado `:ro`):
  - `publico/<proyecto>/` → **listado** en la home y servido en `rubas.aypapol.com/<proyecto>/`
  - `oculto/<proyecto>/`  → servido pero **NO listado** (por ahora "no anunciado";
    los enlaces que **caducan** se añaden en una fase posterior, ver al final).

Rubas controla qué se lista **arrastrando la carpeta a `publico/` u `oculto/`**.
El mismo dir `/srv/rubas/sites` se monta `:rw` en Filebrowser y `:ro` en nginx.

> ⚠️ El orden importa (igual que ChatPapol): nginx corre en **red host** y sirve
> TODOS los subdominios desde un único `nginx.conf`. Si referencia un cert que no
> existe, **nginx no arranca y se caen los 8 sitios**. Por eso el cert se emite
> ANTES de pushear, y el dir del host se crea ANTES de recrear nginx.

## Orden de despliegue (la primera vez)

### 1. DNS (en Hetzner) — manual, sin wildcard
```
A   rubas   → 5.161.218.218
```
Esperar propagación: `dig +short rubas.aypapol.com` debe devolver la IP.

### 2. Crear el árbol de sitios (server) con el dueño correcto
Filebrowser (uid 1000) necesita escribir; nginx solo lee. **Hazlo antes de pushear**:
si el bind-mount `/srv/rubas/sites` no existe, Docker lo crearía como `root` y las
subidas fallarían con *permission denied*.
```bash
mkdir -p /srv/rubas/sites/publico /srv/rubas/sites/oculto
chown -R 1000:1000 /srv/rubas/sites
# Verificar el uid REAL de la imagen (debería ser 1000); si difiere, re-chown:
# docker run --rm gtstef/filebrowser:stable id
```

### 3. Secreto en el server (`.env`, NO se commitea — repo público)
```
RUBAS_FB_PASSWORD=<password-largo-para-el-login-de-rubas>
```
El usuario admin es `rubas` (definido en `rubas/filebrowser.yaml`); su password lo
fija esta env al arrancar el contenedor.

### 4. Emitir el cert (standalone, con nginx en su config vieja todavía)
```bash
cd /root/game-panel
docker compose stop nginx                       # libera el :80 (corta los 8 sitios unos segundos)
certbot certonly --standalone \
  -d rubas.aypapol.com \
  --non-interactive --agree-tos --keep-until-expiring
docker compose start nginx
```
El cert queda en `/etc/letsencrypt/live/rubas.aypapol.com/` (ya montado `:ro` en nginx).

### 5. Desplegar el código (compose + nginx + rubas/)

**Antes de pushear, valida la config en el server** (la CI recrea nginx
automáticamente; un `nginx.conf` malo en red host tumba los 8 sitios). Con el cert
ya emitido (paso 4) y los certs reales montados:
```bash
cd /root/game-panel
git fetch origin main && git show origin/main:nginx/nginx.conf > /tmp/rubas-nginx.conf
docker run --rm \
  -v /tmp/rubas-nginx.conf:/etc/nginx/nginx.conf:ro \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  nginx:alpine nginx -t   # debe decir "syntax is ok" / "test is successful"
```
Si pasa, `git push origin main` → la CI sincroniza y **recrea nginx** (ya encuentra
el cert). El cambio en `docker-compose.yml` también recrea backend/dashboard/bot
(inocuo).

> ⚠️ La CI **NO arranca el servicio nuevo** `filebrowser` (solo toca servicios con
> job propio). Hay que arrancarlo a mano una vez (paso 6).

### 6. Arrancar Filebrowser (server, primera vez) y generar la home
```bash
cd /root/game-panel
docker compose pull filebrowser
docker compose up -d filebrowser
# Verificar el usuario admin creado (debería ser "rubas"):
docker compose logs filebrowser | grep -i -E 'admin|user'
# Generar la home inicial (lista vacía hasta que suba algo):
install -m 755 rubas/gen-index.sh /srv/rubas/gen-index.sh
/srv/rubas/gen-index.sh
```

### 7. Mantener la home en sync (systemd, sin cron en bucle)
```bash
cp rubas/systemd/rubas-index.path rubas/systemd/rubas-index.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now rubas-index.path
```
Al añadir/quitar una carpeta en `publico/`, la home se regenera sola.

### 8. Renovación del cert (día ~60-90) — NO olvidar
`certbot --standalone` NO autorrenueva con nginx levantado. Añade
`rubas.aypapol.com` a lo que renueve los certs del server (el `renew-certs.sh`/cron
del host, con su `--deploy-hook` que recarga nginx). Verificar:
```bash
certbot certificates | grep -A2 rubas
```

### 9. Verificar
- `curl -I https://rubas.aypapol.com/` → 200 (home).
- Abrir `https://rubas.aypapol.com/admin/` → login de Filebrowser (usuario `rubas`).
- Subir una carpeta de prueba a `publico/demo/` con un `index.html` + su `style.css`,
  y abrir `https://rubas.aypapol.com/demo/`: debe renderizar con sus assets.
- Confirmar que la home lista `demo` al cabo de un instante.

## Cómo lo usa Rubas (día a día)
1. Entra a `https://rubas.aypapol.com/admin/` y hace login.
2. **Publicar para todos**: arrastra la carpeta del proyecto (la que tiene su
   `index.html`) dentro de `publico/`. Aparece en la home y en `/<carpeta>/`.
3. **Dejar accesible pero sin anunciar**: la arrastra a `oculto/`. No se lista;
   solo quien tenga el enlace directo `/<carpeta>/` llega.
4. **Compartir**: copia `https://rubas.aypapol.com/<carpeta>/` y lo manda.
5. **Despublicar**: borra o mueve la carpeta fuera de `publico/`.

## Notas y límites conocidos
- **`admin` es una ruta reservada** (el panel). Rubas no debe llamar a un proyecto
  `admin`.
- **Rutas absolutas**: un sitio que pida sus assets con ruta absoluta de raíz
  (`<link href="/css/x.css">`) se romperá; debe usar rutas **relativas**
  (`href="style.css"` o `./css/x.css`). Mitigación futura: inyectar
  `<base href="/<proyecto>/">` en el HTML servido.
- **Enlaces que caducan (pendiente)**: se pospusieron a propósito. Requieren
  `secure_link` en nginx (verificar antes con `docker compose exec nginx nginx -V | grep secure_link`;
  si falta, hay que construir una imagen nginx propia) o validación en el backend
  (`auth_request` a `:3000`, secreto fuera del repo). El árbol `oculto/` ya queda
  listo para convertirse en el destino "solo con enlace".
- **Estado fuera de git**: el dir `/srv/rubas/sites`, las units de systemd y la
  línea de renovación del cert viven en el host. Si se reconstruye el server,
  rehacer los pasos 2, 7 y 8.

## Día 2 (actualizaciones)
- Actualizar Filebrowser: `docker compose pull filebrowser && docker compose up -d filebrowser`.
- Cambios en `rubas/filebrowser.yaml` o `nginx.conf` se aplican con `git push`
  (recrea nginx; para filebrowser, recrear a mano tras el pull).

## Gap conocido (igual que ChatPapol)
La CI (`deploy.yml`) no tiene job para `filebrowser`. El primer arranque y los
`pull` son manuales, o se puede añadir un `workflow_dispatch` luego.
