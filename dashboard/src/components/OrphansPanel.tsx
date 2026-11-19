import { useEffect, useState } from "react";
import { api, type OrphanCleanup, type Orphans } from "../api";
import { formatSize } from "../utils/format";
import { Button, Divider, Notice, Panel } from "./ui";

/** Una línea por cada cosa que sobra, para que se vea qué se va a borrar. */
type Row = { key: string; what: string; detail: string; removable: boolean };

function describe(o: Orphans): Row[] {
  const rows: Row[] = [];

  for (const c of o.containers) {
    rows.push({
      key: `c-${c.name}`,
      what: c.running ? "Contenedor en marcha" : "Contenedor parado",
      detail: c.running ? `${c.name} · no se toca mientras corra` : `${c.name} · ${c.image}`,
      removable: !c.running,
    });
  }
  for (const d of o.backup_dirs) {
    rows.push({
      key: `b-${d.server_id}`,
      what: "Copias",
      detail:
        d.files === 0
          ? `${d.server_id} · carpeta vacía`
          : `${d.server_id} · ${d.files === 1 ? "1 archivo" : `${d.files} archivos`}, ${formatSize(d.bytes)}`,
      removable: true,
    });
  }
  for (const file of o.banners) {
    rows.push({ key: `i-${file}`, what: "Banner", detail: file, removable: true });
  }
  for (const r of o.db_rows) {
    rows.push({
      key: `r-${r.table}-${r.server_id}`,
      what: "Registros",
      detail: `${r.server_id} · ${r.rows} en ${r.table}`,
      removable: true,
    });
  }
  if (o.dangling_images > 0) {
    rows.push({
      key: "images",
      what: "Imágenes viejas",
      detail: `${o.dangling_images} sin etiqueta, de actualizaciones anteriores`,
      removable: true,
    });
  }
  return rows;
}

function summarize(r: OrphanCleanup): string {
  const parts: string[] = [];
  if (r.containers_removed.length > 0) parts.push(`${r.containers_removed.length} contenedores`);
  if (r.images_removed > 0) parts.push(`${r.images_removed} imágenes`);
  if (r.backup_dirs_removed.length > 0)
    parts.push(`${r.backup_dirs_removed.length} carpetas de copias`);
  if (r.banners_removed.length > 0) parts.push(`${r.banners_removed.length} banners`);
  if (r.db_rows_removed > 0) parts.push(`${r.db_rows_removed} registros`);
  if (parts.length === 0) return "No había nada que borrar.";
  const freed = r.bytes_reclaimed > 0 ? ` Liberado: unos ${formatSize(r.bytes_reclaimed)}.` : "";
  return `Borrado: ${parts.join(", ")}.${freed}`;
}

/**
 * Restos en el host de servidores que ya no están en el panel. Borrar un
 * servidor ya se lo lleva todo; esto es para lo que quedó de antes y como red
 * por si algún paso de un borrado falla.
 */
export default function OrphansPanel() {
  const [orphans, setOrphans] = useState<Orphans | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<OrphanCleanup | null>(null);

  async function load() {
    try {
      setOrphans(await api.getOrphans());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al montar
  useEffect(() => {
    load();
  }, []);

  async function handleClean() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    setCleaning(true);
    setError(null);
    try {
      setResult(await api.cleanupOrphans());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCleaning(false);
    }
  }

  const rows = orphans ? describe(orphans) : [];
  // Un contenedor sin servidor que sigue corriendo se lista pero no se borra
  const removable = rows.filter((r) => r.removable).length;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-title font-semibold text-ink">Restos de servidores borrados</h2>
        {removable > 0 && (
          <Button
            tone={confirming ? "danger-solid" : "danger"}
            size="sm"
            onClick={handleClean}
            disabled={cleaning}
          >
            {cleaning ? "Limpiando" : confirming ? "Confirmar borrado" : "Limpiar"}
          </Button>
        )}
      </div>

      {(error || result) && (
        <>
          <Divider />
          <div className="flex flex-col gap-2 px-4 py-3">
            {error && <Notice>{error}</Notice>}
            {result && <Notice tone="ok">{summarize(result)}</Notice>}
            {result?.warnings.map((w) => (
              <Notice key={w} tone="warn">
                {w}
              </Notice>
            ))}
          </div>
        </>
      )}

      <Divider />
      {orphans === null && !error ? (
        <p className="label tick px-4 py-4">Buscando restos</p>
      ) : rows.length === 0 ? (
        <p className="text-body text-muted px-4 py-4">
          No queda nada de servidores que ya no existen.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="text-body text-muted shrink-0 sm:w-40">{r.what}</span>
              <span className="num text-body text-ink break-all">{r.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
