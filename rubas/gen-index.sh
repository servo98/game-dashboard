#!/bin/sh
# Genera la home de rubas.aypapol.com: una guía para Rubas + la lista de proyectos
# de publico/. Se instala en /srv/rubas/gen-index.sh y lo dispara la unit systemd
# rubas-index.path cuando cambia publico/ (ver rubas/systemd/ y DEPLOY-RUBAS.md).
# La guía vive AQUÍ (no como archivo suelto) porque la home se regenera sola.
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
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.6 system-ui,sans-serif; background:#0a0d0c; color:#e6efe9;
         display:flex; min-height:100vh; flex-direction:column; align-items:center; }
  .wrap { width:100%; max-width:680px; padding:0 1rem; }
  header { padding:3rem 1rem 1rem; text-align:center; }
  h1 { margin:0; font-size:1.7rem; letter-spacing:.02em; }
  p.sub { margin:.4rem 0 0; color:#7d8c84; font-size:.95rem; }
  h2 { font-size:1.05rem; color:#cfe7da; margin:2rem 0 .6rem; }
  ul.projects { list-style:none; padding:0; margin:1rem 0; }
  ul.projects li { margin:.5rem 0; }
  ul.projects a { display:block; padding:.9rem 1.1rem; border:1px solid #1f2824; border-radius:10px;
      background:#0f1413; color:#7CF5B0; text-decoration:none; transition:background .15s,border-color .15s; }
  ul.projects a:hover { background:#131918; border-color:#3a473f; }
  .empty { color:#7d8c84; text-align:center; margin:1.5rem 0; }
  .btn { display:inline-block; margin:.6rem 0; padding:.7rem 1.3rem; border-radius:10px;
         background:#7CF5B0; color:#06080a; font-weight:600; text-decoration:none; }
  .btn:hover { background:#9ff8c4; }
  .guide { margin:1rem 0 2rem; padding:1.2rem 1.3rem; border:1px solid #1f2824; border-radius:12px;
           background:#0c1110; }
  .guide ol { margin:.4rem 0 0; padding-left:1.3rem; }
  .guide li { margin:.45rem 0; }
  .guide code { background:#070a09; border:1px solid #1f2824; border-radius:5px; padding:.05em .4em;
                color:#7CF5B0; font:.9em ui-monospace,monospace; }
  .tips { color:#9fb3a9; font-size:.92rem; }
  .tips strong { color:#cfe7da; }
  details { margin-top:.8rem; }
  summary { cursor:pointer; color:#7d8c84; }
  footer { margin-top:auto; padding:1.5rem; color:#3a473f; font-size:.8rem; }
</style>
</head>
<body>
<header>
  <h1>proyectos de rubas</h1>
  <p class="sub">webs estáticas — todos somos papol</p>
</header>
<div class="wrap">
HEAD

  # ── Lista de proyectos ──────────────────────────────────────────────────
  count=0
  list=""
  for dir in "$PUB"/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    case "$name" in .*) continue ;; esac   # saltar ocultas
    safe=$(esc "$name")
    list="$list  <li><a href=\"/$safe/\">$safe</a></li>
"
    count=$((count + 1))
  done

  printf '<h2>Proyectos publicados</h2>\n'
  if [ "$count" -eq 0 ]; then
    printf '<p class="empty">Todavía no hay nada publicado. Sube tu primera carpeta siguiendo la guía de abajo 👇</p>\n'
  else
    printf '<ul class="projects">\n%s</ul>\n' "$list"
  fi

  # ── Guía para Rubas (estática, siempre presente) ────────────────────────
  cat <<'GUIDE'
<h2>¿Cómo subo una web, Rubas? 👋</h2>
<div class="guide">
  <a class="btn" href="/admin/">Abrir mi panel para subir →</a>
  <ol>
    <li>Entra a tu panel en <code>/admin/</code> con <strong>tu usuario y contraseña</strong>.</li>
    <li>Verás una carpeta llamada <code>srv</code>, y dentro dos carpetas:
      <ul>
        <li><code>publico</code> → lo que pongas aquí <strong>aparece en esta página</strong> y cualquiera lo puede abrir.</li>
        <li><code>oculto</code> → solo se ve con el <strong>link directo</strong>; no aparece en la lista.</li>
      </ul>
    </li>
    <li><strong>Arrastra la carpeta</strong> de tu proyecto (la que tiene el archivo <code>index.html</code>) dentro de <code>publico</code> o de <code>oculto</code>.</li>
    <li>¡Listo! Tu web queda en <code>rubas.aypapol.com/<i>nombre-de-tu-carpeta</i>/</code>.</li>
    <li>Para quitarla: bórrala o muévela desde el panel. La lista se actualiza sola.</li>
  </ol>
  <details>
    <summary>Tips para que tu web se vea bien</summary>
    <p class="tips">
      • Tu carpeta <strong>debe tener un <code>index.html</code></strong> (es la página principal que se abre).<br>
      • Usa <strong>rutas relativas</strong> para tus archivos: <code>href="style.css"</code> ✅, no <code>href="/style.css"</code> ❌.<br>
      • <strong>No</strong> llames <code>admin</code> a una carpeta (ese nombre está reservado para tu panel).<br>
      • Si subes una carpeta dentro de otra, la web vive en la ruta de la carpeta que tiene el <code>index.html</code>.
    </p>
  </details>
</div>
GUIDE

  cat <<'FOOT'
</div>
<footer>rubas.aypapol.com</footer>
</body>
</html>
FOOT
} > "$TMP"

mv "$TMP" "$OUT"
