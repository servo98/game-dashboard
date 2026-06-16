#!/bin/sh
# Genera la home de rubas.aypapol.com: lista las carpetas de publico/ como enlaces.
# Se instala en /srv/rubas/gen-index.sh y lo dispara la unit systemd rubas-index.path
# cuando cambia publico/ (ver rubas/systemd/ y DEPLOY-RUBAS.md). Idempotente.
set -eu

SITES="${RUBAS_SITES_DIR:-/srv/rubas/sites}"
PUB="$SITES/publico"
OUT="$SITES/index.html"
TMP="$SITES/.index.html.tmp"

mkdir -p "$PUB"

# Escapa <, >, & para meter el nombre de carpeta en HTML de forma segura.
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

{
  cat <<'HEAD'
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>proyectos de rubas</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; font:16px/1.5 system-ui,sans-serif; background:#0a0d0c; color:#e6efe9;
         display:flex; min-height:100vh; flex-direction:column; align-items:center; }
  header { padding:3rem 1rem 1rem; text-align:center; }
  h1 { margin:0; font-size:1.6rem; letter-spacing:.02em; }
  p.sub { margin:.4rem 0 0; color:#7d8c84; font-size:.95rem; }
  ul { list-style:none; padding:0; margin:2rem 1rem; width:100%; max-width:640px; }
  li { margin:.5rem 0; }
  a { display:block; padding:.9rem 1.1rem; border:1px solid #1f2824; border-radius:10px;
      background:#0f1413; color:#7CF5B0; text-decoration:none; transition:background .15s,border-color .15s; }
  a:hover { background:#131918; border-color:#3a473f; }
  .empty { color:#7d8c84; text-align:center; margin:2rem 1rem; }
  footer { margin-top:auto; padding:1.5rem; color:#3a473f; font-size:.8rem; }
</style>
</head>
<body>
<header>
  <h1>proyectos de rubas</h1>
  <p class="sub">webs estáticas — todos somos papol</p>
</header>
HEAD

  count=0
  printf '<ul>\n'
  # Subcarpetas inmediatas de publico/, orden alfabético. Solo directorios.
  for dir in "$PUB"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    case "$name" in .*) continue ;; esac   # saltar ocultas
    safe=$(esc "$name")
    printf '  <li><a href="/%s/">%s</a></li>\n' "$safe" "$safe"
    count=$((count + 1))
  done
  printf '</ul>\n'

  if [ "$count" -eq 0 ]; then
    printf '<p class="empty">Aún no hay proyectos publicados. Sube una carpeta en <a href="/admin/" style="display:inline;border:0;padding:0;background:0">/admin/</a> → publico/.</p>\n'
  fi

  cat <<'FOOT'
<footer>rubas.aypapol.com</footer>
</body>
</html>
FOOT
} > "$TMP"

mv "$TMP" "$OUT"
