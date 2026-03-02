import { useEffect, useState } from "react";
import { api, type GameTemplate } from "../api";

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
    setError(null);
  }

  function handleCustom() {
    setSelected(null);
    setCustomMode(true);
    resetForm();
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

    const envVars: Record<string, string> = {};
    for (const { key, value } of formEnv) {
      if (key.trim()) envVars[key.trim()] = value;
    }

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
        await api.createServer({
          id: formId,
          name: formName,
          docker_image: formImage,
          port: Number(formPort),
          env_vars: envVars,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            {showForm && (
              <button
                onClick={handleBack}
                className="text-gray-400 hover:text-white transition-colors mr-1"
              >
                &larr;
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">
              {showForm ? (selected ? selected.name : "Custom Server") : "Game Store"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {!showForm ? (
          <>
            {/* Search */}
            <div className="px-5 pt-4">
              <input
                type="text"
                placeholder="Search games..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 px-5 pt-3 pb-1">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    category === cat
                      ? "bg-brand-500 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
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
                    className="bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-500 rounded-xl p-3 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎮</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate group-hover:text-brand-400 transition-colors">
                          {template.name}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">{template.category}</p>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Custom server card */}
                <button
                  onClick={handleCustom}
                  className="bg-gray-800 hover:bg-gray-750 border border-dashed border-gray-600 hover:border-brand-500 rounded-xl p-3 text-left transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">+</span>
                    <div>
                      <p className="text-sm font-medium text-gray-400 group-hover:text-brand-400 transition-colors">
                        Custom Server
                      </p>
                      <p className="text-xs text-gray-600">Any Docker image</p>
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
              <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Server ID</span>
              <input
                type="text"
                value={formId}
                onChange={(e) =>
                  setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                }
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                placeholder="my-server"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Display Name</span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                placeholder="My Server"
              />
            </label>

            {customMode && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Docker Image</span>
                <input
                  type="text"
                  value={formImage}
                  onChange={(e) => setFormImage(e.target.value)}
                  required
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                  placeholder="gameservermanagers/gameserver:cs2"
                />
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Port</span>
              <input
                type="number"
                value={formPort}
                onChange={(e) => setFormPort(e.target.value)}
                required
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
                placeholder="27015"
              />
            </label>

            {/* Env vars */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Environment Variables</span>
                <button
                  type="button"
                  onClick={() => setFormEnv([...formEnv, { key: "", value: "" }])}
                  className="text-xs text-brand-400 hover:text-brand-300"
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
                    placeholder="KEY"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                  <input
                    type="text"
                    value={env.value}
                    onChange={(e) => {
                      const next = [...formEnv];
                      next[i] = { ...next[i], value: e.target.value };
                      setFormEnv(next);
                    }}
                    placeholder="value"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setFormEnv(formEnv.filter((_, j) => j !== i))}
                    className="text-gray-500 hover:text-red-400 text-sm px-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
            >
              {loading ? "Adding..." : "Add Server"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
