# Guía para Claude — subir webs de Rubas a rubas.aypapol.com

> **Para Rubas:** pásale este archivo a tu Claude cuando quieras publicar una web.
> Dile: *"lee esta guía y sube la carpeta tal a rubas, en publico"*. Eso es todo.

> **Para Claude (asistente de Rubas):** lee esto entero antes de actuar. Tu trabajo
> es publicar carpetas de sitios **estáticos** (HTML/CSS/JS) en `rubas.aypapol.com`
> usando la API de Filebrowser Quantum. No necesitas SSH ni git: todo es por HTTP.

---

## 1. Lo único que necesitas: un token

Pídele a Rubas un **token de la API** (caduca, así que pídelo cada sesión):

1. Rubas entra a `https://rubas.aypapol.com/admin/` con su usuario.
2. Va a la configuración de su usuario → sección **API / tokens**.
3. Genera un token con permisos **create, modify, delete** activados.
4. Te lo pega. Guárdalo como variable de entorno, **no lo escribas en archivos**:
   ```bash
   export FB_TOKEN='el-token-que-te-dio-rubas'
   ```

El token es un JWT que expira (los de prueba duran 24 h). Si una llamada devuelve
`401`, está vencido → pídele uno nuevo a Rubas.

---

## 2. La API en 4 reglas (todo lo que importa)

- **Base:** `https://rubas.aypapol.com/admin/api`
- **Auth:** por query param `?auth=$FB_TOKEN` (NO header, NO cookie).
- **Siempre** pasa `source=srv`.
- Operaciones sobre `/resources`:
  | Acción | Llamada |
  |---|---|
  | Listar | `GET  /resources?path=/&source=srv&auth=$FB_TOKEN` → `{files:[...],folders:[...]}` |
  | Crear carpeta | `POST /resources?path=/x/&source=srv&isDir=true&auth=$FB_TOKEN` |
  | Subir archivo | `POST /resources?path=/x/f.html&source=srv&override=true&auth=$FB_TOKEN` (contenido en el body) |
  | Borrar | `DELETE /resources?path=/x&source=srv&auth=$FB_TOKEN` |

---

## 3. Dónde subir (decide con Rubas)

Hay dos carpetas; la elección define la visibilidad:

- **`publico/`** → la web aparece listada en la home `rubas.aypapol.com/` y cualquiera la abre.
- **`oculto/`** → la web funciona pero NO se lista; solo quien tenga el link directo la ve.

Una web subida a `publico/mi-sitio/` queda viva en **`https://rubas.aypapol.com/mi-sitio/`**.

---

## 4. Reglas de oro para que la web funcione (IMPORTANTE)

- La carpeta **debe tener un `index.html`** en su raíz (es la página que se abre).
- Usa **rutas relativas** para los assets: `href="style.css"` o `src="./img/x.png"` ✅.
  **NUNCA** rutas absolutas de raíz como `href="/style.css"` ❌ — se romperían
  (el sitio vive en `/mi-sitio/`, no en `/`). Si el HTML de Rubas trae rutas
  absolutas, conviértelas a relativas antes de subir, o añade
  `<base href="/mi-sitio/">` en el `<head>`.
- No uses el nombre **`admin`** para un proyecto (está reservado para el panel).
- Nombres de carpeta/archivo: minúsculas, sin espacios ni acentos (mejor para URLs).

---

## 5. Script listo: subir una carpeta entera

Sube recursivamente toda una carpeta local preservando subcarpetas. Guárdalo como
`sube-web.sh`:

```bash
#!/usr/bin/env bash
# Uso: FB_TOKEN=xxxx ./sube-web.sh <carpeta-local> <nombre-proyecto> [publico|oculto]
set -euo pipefail
LOCAL="${1:?carpeta local}"; PROJ="${2:?nombre proyecto}"; VIS="${3:-publico}"
BASE="https://rubas.aypapol.com/admin/api"; SRC="srv"
: "${FB_TOKEN:?exporta FB_TOKEN con el token de la API}"

[ -f "$LOCAL/index.html" ] || echo "AVISO: no hay index.html en $LOCAL (la web no abrirá sola)"

# urlencode (usa python3 si está; si no, asume nombres simples)
enc() { if command -v python3 >/dev/null; then python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; else printf '%s' "$1"; fi; }
api() { curl -fsS -m 60 "$@"; }

P="$(enc "$PROJ")"
# 1) carpeta raíz del proyecto (idempotente)
api -X POST "$BASE/resources?path=/$VIS/$P/&source=$SRC&isDir=true&auth=$FB_TOKEN" >/dev/null || true
cd "$LOCAL"
# 2) crear subcarpetas (padres antes que hijos)
find . -type d ! -path '*/.*' ! -name '.' | sed 's|^\./||' | while read -r d; do
  api -X POST "$BASE/resources?path=/$VIS/$P/$(enc "$d")/&source=$SRC&isDir=true&auth=$FB_TOKEN" >/dev/null || true
done
# 3) subir todos los archivos
find . -type f ! -path '*/.*' | sed 's|^\./||' | while read -r f; do
  api -X POST --data-binary @"$f" \
    "$BASE/resources?path=/$VIS/$P/$(enc "$f")&source=$SRC&override=true&auth=$FB_TOKEN" >/dev/null
  echo "  ✓ $f"
done
echo "LISTO → https://rubas.aypapol.com/$PROJ/  ($VIS)"
```

Ejemplo:
```bash
export FB_TOKEN='...'
./sube-web.sh ./mi-portfolio portfolio publico
# → publica en https://rubas.aypapol.com/portfolio/
```

---

## 6. Otras operaciones útiles

**Ver qué hay publicado:**
```bash
curl -fsS "https://rubas.aypapol.com/admin/api/resources?path=/publico/&source=srv&auth=$FB_TOKEN"
```

**Actualizar una web** (vuelve a correr `sube-web.sh` con el mismo nombre; `override=true` reemplaza los archivos).

**Borrar una web:**
```bash
curl -fsS -X DELETE "https://rubas.aypapol.com/admin/api/resources?path=/publico/mi-sitio&source=srv&auth=$FB_TOKEN"
```

**Comprobar que quedó bien:**
```bash
curl -I https://rubas.aypapol.com/mi-sitio/        # debe dar 200
```

---

## 7. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| `401 no token` | token vencido o mal | pide token nuevo a Rubas; va en `?auth=` |
| `500 source not provided` | falta `source=srv` | añádelo a la URL |
| `500 ... not a directory` | hay un archivo con el nombre de la carpeta | borra ese archivo y reintenta con `isDir=true` |
| La web abre pero sin estilos | el HTML usa rutas absolutas `/...` | pásalas a relativas o añade `<base href="/proyecto/">` |
| 404 al abrir `/proyecto/` | falta `index.html` en la raíz del proyecto | sube un `index.html` |

La home (`rubas.aypapol.com/`) se actualiza **sola** en ~1 min tras subir/borrar en
`publico/`. No tienes que tocarla (de hecho no puedes: es auto-generada).
