# Guía para Claude — subir webs de Rubas a rubas.aypapol.com

> **Para Rubas:** pásale este archivo a tu Claude cuando quieras publicar una web.
> Dile: *"lee esta guía y sube la carpeta tal a rubas, en publico"*. Lo único que
> tu Claude te pedirá es **tu usuario y contraseña del panel** (los mismos con los
> que entras a rubas.aypapol.com/admin/).

> **Para Claude (asistente de Rubas):** lee esto entero antes de actuar. Tu trabajo
> es publicar carpetas de sitios **estáticos** (HTML/CSS/JS) en `rubas.aypapol.com`.
> No necesitas SSH, git ni que Rubas genere tokens: te logueas con su usuario y
> contraseña y obtienes el token tú mismo.

---

## 1. Lo único que necesitas: el login de Rubas

Pídele a Rubas su **usuario y contraseña del panel** (los mismos que usa en
`https://rubas.aypapol.com/admin/`). Guárdalos como variables de entorno, **nunca
en archivos**:

```bash
export FB_USER='rubas'
export FB_PASS='la-contraseña-del-panel-de-rubas'
```

Con eso, el script de abajo hace login solo y consigue el token. No hay que generar
tokens a mano ni preocuparse de que caduquen.

---

## 2. La API en pocas reglas

- **Base:** `https://rubas.aypapol.com/admin/api`
- **Login:** `POST /auth/login?username=<user>&recaptcha=` con el header
  `X-Password: <contraseña-url-encoded>`. Devuelve el **token** (JWT) en el body
  como texto plano. (OJO: el usuario va en la URL y la contraseña en el header,
  NO en un JSON.)
- **Auth del resto:** se pasa el token por query param `?auth=<token>` (NO header, NO cookie).
- **Siempre** incluye `source=srv`.
- Operaciones sobre `/resources`:
  | Acción | Llamada |
  |---|---|
  | Listar | `GET  /resources?path=/&source=srv&auth=<token>` → `{files:[...],folders:[...]}` |
  | Crear carpeta | `POST /resources?path=/x/&source=srv&isDir=true&auth=<token>` |
  | Subir archivo | `POST /resources?path=/x/f.html&source=srv&override=true&auth=<token>` (contenido en el body) |
  | Borrar | `DELETE /resources?path=/x&source=srv&auth=<token>` |

---

## 3. Dónde subir (decide con Rubas)

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

## 5. Script listo: subir una carpeta entera (con login automático)

Sube recursivamente toda una carpeta local preservando subcarpetas. Hace login solo
con `FB_USER`/`FB_PASS`. Guárdalo como `sube-web.sh`:

```bash
#!/usr/bin/env bash
# Uso: FB_USER=rubas FB_PASS='...' ./sube-web.sh <carpeta-local> <nombre-proyecto> [publico|oculto]
set -euo pipefail
LOCAL="${1:?carpeta local}"; PROJ="${2:?nombre proyecto}"; VIS="${3:-publico}"
BASE="https://rubas.aypapol.com/admin/api"; SRC="srv"
: "${FB_USER:?exporta FB_USER}"; : "${FB_PASS:?exporta FB_PASS}"

[ -f "$LOCAL/index.html" ] || echo "AVISO: no hay index.html en $LOCAL (la web no abrirá sola)"

# urlencode (usa python3 si está; si no, asume valores simples)
enc() { if command -v python3 >/dev/null; then python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; else printf '%s' "$1"; fi; }
api() { curl -fsS -m60 "$@"; }

# 1) login -> token  (usuario en la URL, contraseña en el header X-Password)
TOKEN="$(curl -fsS -m30 -X POST -H "X-Password: $(enc "$FB_PASS")" \
  "$BASE/auth/login?username=$(enc "$FB_USER")&recaptcha=")"
case "$TOKEN" in *.*.*) : ;; *) echo "ERROR: login falló (¿usuario/contraseña correctos?)"; exit 1;; esac

P="$(enc "$PROJ")"
# 2) carpeta raíz del proyecto (idempotente)
api -X POST "$BASE/resources?path=/$VIS/$P/&source=$SRC&isDir=true&auth=$TOKEN" >/dev/null || true
cd "$LOCAL"
# 3) crear subcarpetas (padres antes que hijos)
find . -type d ! -path '*/.*' ! -name '.' | sed 's|^\./||' | while read -r d; do
  api -X POST "$BASE/resources?path=/$VIS/$P/$(enc "$d")/&source=$SRC&isDir=true&auth=$TOKEN" >/dev/null || true
done
# 4) subir todos los archivos
find . -type f ! -path '*/.*' | sed 's|^\./||' | while read -r f; do
  api -X POST --data-binary @"$f" \
    "$BASE/resources?path=/$VIS/$P/$(enc "$f")&source=$SRC&override=true&auth=$TOKEN" >/dev/null
  echo "  ✓ $f"
done
echo "LISTO → https://rubas.aypapol.com/$PROJ/  ($VIS)"
```

Ejemplo:
```bash
export FB_USER='rubas' FB_PASS='...'
./sube-web.sh ./mi-portfolio portfolio publico
# → publica en https://rubas.aypapol.com/portfolio/
```

---

## 6. Otras operaciones útiles

Primero consigue un token con el login (igual que hace el script):
```bash
TOKEN="$(curl -fsS -X POST -H "X-Password: $FB_PASS" \
  "https://rubas.aypapol.com/admin/api/auth/login?username=$FB_USER&recaptcha=")"
```

**Ver qué hay publicado:**
```bash
curl -fsS "https://rubas.aypapol.com/admin/api/resources?path=/publico/&source=srv&auth=$TOKEN"
```

**Actualizar una web** (vuelve a correr `sube-web.sh` con el mismo nombre; `override=true` reemplaza los archivos).

**Borrar una web:**
```bash
curl -fsS -X DELETE "https://rubas.aypapol.com/admin/api/resources?path=/publico/mi-sitio&source=srv&auth=$TOKEN"
```

**Comprobar que quedó bien:**
```bash
curl -I https://rubas.aypapol.com/mi-sitio/        # debe dar 200
```

---

## 7. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| login da `401 user unauthorized` | usuario/contraseña mal, o no mandaste el header `X-Password` | revisa: usuario en la URL (`?username=`), contraseña en header `X-Password` |
| `401 no token` | el token no se pasó | va en `?auth=<token>` en la URL |
| `500 source not provided` | falta `source=srv` | añádelo a la URL |
| `500 ... not a directory` | hay un archivo con el nombre de la carpeta | bórralo y reintenta con `isDir=true` |
| La web abre pero sin estilos | el HTML usa rutas absolutas `/...` | pásalas a relativas o añade `<base href="/proyecto/">` |
| 404 al abrir `/proyecto/` | falta `index.html` en la raíz del proyecto | sube un `index.html` |

La home (`rubas.aypapol.com/`) se actualiza **sola** en ~1 min tras subir/borrar en
`publico/`. No tienes que tocarla (de hecho no puedes: es auto-generada).
