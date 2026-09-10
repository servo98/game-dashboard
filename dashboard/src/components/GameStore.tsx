import { useEffect, useState } from "react";
import { api, type GameTemplate } from "../api";
import MinecraftConfigEditor from "./MinecraftConfigEditor";
import { Button, Modal } from "./ui";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type Category = "all" | "fps" | "survival" | "sandbox" | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "All",
  fps: "FPS",
  survival: "Survival",
  sandbox: "Sandbox",
  other: "Other",
};

export default function GameStore({ open, onClose, onCreated }: Props) {
  const [catalog, setCatalog] = useState<GameTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [selected, setSelected] = useState<GameTemplate | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formImage, setFormImage] = useState("");
  const [formPort, setFormPort] = useState("");
  const [formEnv, setFormEnv] = useState<Array<{ key: string; value: string }>>([]);
  const [mcEnvRecord, setMcEnvRecord] = useState<Record<string, string>>({});
  const [formIcon, setFormIcon] = useState("");
  const [formVolumes, setFormVolumes] = useState<Array<{ host: string; container: string }>>([]);

  const isMcTemplate = selected?.docker_image?.includes("itzg/minecraft-server") ?? false;

  useEffect(() => {
    if (open) {
      api
        .getCatalog()
        .then(setCatalog)
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (selected) {
      setFormId(selected.id);
      setFormName(selected.name);
      setFormImage(selected.docker_image);
      setFormPort(String(selected.default_port));
      setFormEnv(Object.entries(selected.default_env).map(([key, value]) => ({ key, value })));
      setMcEnvRecord({ ...selected.default_env });
      setCustomMode(false);
      setError(null);
    }
  }, [selected]);

  function resetForm() {
    setFormId("");
    setFormName("");
    setFormImage("");
    setFormPort("");
    setFormEnv([]);
    setFormIcon("");
    setFormVolumes([]);
    setError(null);
  }

  function handleCustom() {
    setSelected(null);
    setCustomMode(true);
    resetForm();
    setFormVolumes([{ host: "", container: "/data" }]);
  }

  function handleBack() {
    setSelected(null);
    setCustomMode(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const envVars: Record<string, string> = isMcTemplate
      ? Object.fromEntries(Object.entries(mcEnvRecord).filter(([k]) => k.trim()))
      : Object.fromEntries(formEnv.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]));

    try {
      if (selected) {
        await api.createServer({
          template_id: selected.id,
          id: formId,
          name: formName,
          port: Number(formPort),
          env_vars: envVars,
        });
      } else {
        const volumes: Record<string, string> = {};
        for (const { host, container } of formVolumes) {
          const h = host.trim() || `/data/${formId}`;
          const cnt = container.trim() || "/data";
          if (h) volumes[h] = cnt;
        }
        await api.createServer({
          id: formId,
          name: formName,
          docker_image: formImage,
          port: Number(formPort),
          env_vars: envVars,
          volumes,
          icon: formIcon || undefined,
        });
      }
      onCreated();
      onClose();
      setSelected(null);
      setCustomMode(false);
      resetForm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const filtered = catalog.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (
      search &&
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !t.id.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    return true;
  });

  const showForm = selected || customMode;

  return (
    <Modal
      title={showForm ? (selected ? selected.name : "Servidor a medida") : "Catálogo de juegos"}
      subtitle={showForm ? "Configura y añade el servidor" : "Elige qué quieres levantar"}
      size={showForm && isMcTemplate ? "lg" : "md"}
      padded={false}
      onClose={onClose}
      toolbar={
        showForm ? (
          <Button tone="ghost" size="sm" onClick={handleBack}>
            Volver
          </Button>
        ) : undefined
      }
    >
      {!showForm ? (
        <>
          {/* Search */}
          <div className="px-5 pt-4">
            <input
              type="text"
              placeholder="Buscar juegos"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-raised border border-line rounded-md px-4 py-2.5 text-body text-ink placeholder:text-faint focus:outline-none focus:border-accent"
            />
          </div>

          {/* Category tabs */}
          <div className="flex gap-1 px-5 pt-3 pb-1">
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`tap px-3 py-1.5 text-meta font-medium rounded-md transition-colors ${
                  category === cat
                    ? "bg-accent text-accent-ink"
                    : "bg-raised text-muted hover:text-ink"
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Game grid */}
          <div className="flex-1 overflow-y-auto px-5 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filtered.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelected(template)}
                  className="bg-raised hover:bg-line border border-line hover:border-accent/35 rounded-md p-3 text-left transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={template.icon}
                      alt=""
                      className="w-6 h-6 rounded-sm object-cover shrink-0"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-body font-medium text-ink truncate group-hover:text-accent transition-colors">
                        {template.name}
                      </p>
                      <p className="text-meta text-faint capitalize">{template.category}</p>
                    </div>
                  </div>
                </button>
              ))}

              {/* Custom server card */}
              <button
                onClick={handleCustom}
                className="bg-raised hover:bg-line border border-dashed border-line-strong hover:border-accent/35 rounded-md p-3 text-left transition-all group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-title">+</span>
                  <div>
                    <p className="text-body font-medium text-muted group-hover:text-accent transition-colors">
                      Servidor a medida
                    </p>
                    <p className="text-meta text-faint">Cualquier imagen de Docker</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Config form */
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3"
        >
          {error && (
            <div className="bg-danger/10 border border-danger/35 rounded-md px-3 py-2 text-body text-danger">
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-meta text-muted">Identificador</span>
            <input
              type="text"
              value={formId}
              onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              required
              className="bg-raised border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
              placeholder="mi-servidor"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-meta text-muted">Nombre visible</span>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              className="bg-raised border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
              placeholder="Mi servidor"
            />
          </label>

          {customMode && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-meta text-muted">Imagen de Docker</span>
                <input
                  type="text"
                  value={formImage}
                  onChange={(e) => setFormImage(e.target.value)}
                  required
                  className="bg-raised border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
                  placeholder="gameservermanagers/gameserver:cs2"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-meta text-muted">URL del icono (opcional)</span>
                <input
                  type="text"
                  value={formIcon}
                  onChange={(e) => setFormIcon(e.target.value)}
                  className="bg-raised border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
                  placeholder="https://example.com/icon.png"
                />
              </label>
            </>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-meta text-muted">Puerto</span>
            <input
              type="number"
              value={formPort}
              onChange={(e) => setFormPort(e.target.value)}
              required
              className="bg-raised border border-line rounded-md px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
              placeholder="27015"
            />
          </label>

          {/* Volumes (custom only) */}
          {customMode && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-meta text-muted">Volúmenes</span>
                <button
                  type="button"
                  onClick={() => setFormVolumes([...formVolumes, { host: "", container: "" }])}
                  className="text-meta text-accent hover:text-accent"
                >
                  + Add
                </button>
              </div>
              {formVolumes.map((vol, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={vol.host}
                    onChange={(e) => {
                      const next = [...formVolumes];
                      next[i] = { ...next[i], host: e.target.value };
                      setFormVolumes(next);
                    }}
                    placeholder={`/data/${formId || "my-server"}`}
                    className="flex-1 bg-raised border border-line rounded-md px-3 py-1.5 text-meta text-ink font-mono focus:outline-none focus:border-accent"
                  />
                  <span className="text-faint text-meta">:</span>
                  <input
                    type="text"
                    value={vol.container}
                    onChange={(e) => {
                      const next = [...formVolumes];
                      next[i] = { ...next[i], container: e.target.value };
                      setFormVolumes(next);
                    }}
                    placeholder="/data"
                    className="flex-1 bg-raised border border-line rounded-md px-3 py-1.5 text-meta text-ink font-mono focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setFormVolumes(formVolumes.filter((_, j) => j !== i))}
                    className="text-faint hover:text-danger text-body px-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
              <p className="text-meta text-faint">
                Maps host path to container path for persistent data.
              </p>
            </div>
          )}

          {/* Env vars */}
          {isMcTemplate ? (
            <div className="max-h-[40vh] overflow-y-auto pr-1">
              <MinecraftConfigEditor envVars={mcEnvRecord} onChange={setMcEnvRecord} />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-meta text-muted">Variables de entorno</span>
                <button
                  type="button"
                  onClick={() => setFormEnv([...formEnv, { key: "", value: "" }])}
                  className="text-meta text-accent hover:text-accent"
                >
                  + Add
                </button>
              </div>
              {formEnv.map((env, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={env.key}
                    onChange={(e) => {
                      const next = [...formEnv];
                      next[i] = { ...next[i], key: e.target.value };
                      setFormEnv(next);
                    }}
                    placeholder="CLAVE"
                    className="flex-1 bg-raised border border-line rounded-md px-3 py-1.5 text-meta text-ink font-mono focus:outline-none focus:border-accent"
                  />
                  <input
                    type="text"
                    value={env.value}
                    onChange={(e) => {
                      const next = [...formEnv];
                      next[i] = { ...next[i], value: e.target.value };
                      setFormEnv(next);
                    }}
                    placeholder="valor"
                    className="flex-1 bg-raised border border-line rounded-md px-3 py-1.5 text-meta text-ink font-mono focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setFormEnv(formEnv.filter((_, j) => j !== i))}
                    className="text-faint hover:text-danger text-body px-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-accent-ink rounded-md py-2.5 text-body font-medium transition-colors"
          >
            {loading ? "Añadiendo" : "Añadir servidor"}
          </button>
        </form>
      )}
    </Modal>
  );
}
