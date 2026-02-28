import { useEffect, useState } from "react";
import { api, type ServerConfig } from "../api";
import MinecraftConfigEditor from "./MinecraftConfigEditor";

type Props = {
  serverId: string;
  serverName: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function isMinecraftImage(image: string): boolean {
  return image.includes("itzg/minecraft-server");
}

export default function ConfigEditor({ serverId, serverName, open, onClose, onSaved }: Props) {
  const [dockerImage, setDockerImage] = useState("");
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>([]);
  const [envRecord, setEnvRecord] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMinecraft = isMinecraftImage(dockerImage);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api
      .getServerConfig(serverId)
      .then((cfg: ServerConfig) => {
        setDockerImage(cfg.docker_image);
        setEnvPairs(
          Object.entries(cfg.env_vars).map(([key, value]) => ({ key, value }))
        );
        setEnvRecord(cfg.env_vars);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, serverId]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const env_vars = isMinecraft
        ? Object.fromEntries(Object.entries(envRecord).filter(([k]) => k.trim()))
        : Object.fromEntries(
            envPairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value])
          );
      await api.updateServerConfig(serverId, { docker_image: dockerImage, env_vars });
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function addEnvPair() {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeEnvPair(index: number) {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEnvPair(index: number, field: "key" | "value", val: string) {
    setEnvPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: val } : p))
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-950 border border-gray-800 rounded-2xl w-full shadow-2xl ${isMinecraft ? "max-w-2xl" : "max-w-lg"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Edit Config — {serverName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isMinecraft ? (
            <>
              {/* Docker Image (read-only for Minecraft) */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Docker Image</label>
                <div className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm font-mono text-gray-400">
                  {dockerImage}
                </div>
              </div>

              {/* Minecraft guided editor */}
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <MinecraftConfigEditor envVars={envRecord} onChange={setEnvRecord} />
              </div>
            </>
          ) : (
            <>
              {/* Docker Image */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Docker Image</label>
                <input
                  type="text"
                  value={dockerImage}
                  onChange={(e) => setDockerImage(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Env Vars */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500">Environment Variables</label>
                  <button
                    onClick={addEnvPair}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {envPairs.map((pair, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="KEY"
                        value={pair.key}
                        onChange={(e) => updateEnvPair(i, "key", e.target.value)}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
                      />
                      <span className="text-gray-600">=</span>
                      <input
                        type="text"
                        placeholder="value"
                        value={pair.value}
                        onChange={(e) => updateEnvPair(i, "value", e.target.value)}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
                      />
                      <button
                        onClick={() => removeEnvPair(i)}
                        className="text-gray-600 hover:text-red-400 transition-colors shrink-0 px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {envPairs.length === 0 && (
                    <p className="text-xs text-gray-600">No environment variables set.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
