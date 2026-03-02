import { useEffect, useRef, useState } from "react";
import { api, type ServerConfig } from "../api";
import { DEFAULT_THEMES } from "../theme";
import { extractColors } from "../utils/color-extract";
import MinecraftConfigEditor from "./MinecraftConfigEditor";

type Props = {
  serverId: string;
  serverName: string;
  gameType?: string;
  open: boolean;
  isRunning?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function isMinecraftImage(image: string): boolean {
  return image.includes("itzg/minecraft-server");
}

export default function ConfigEditor({
  serverId,
  serverName,
  gameType,
  open,
  isRunning = false,
  onClose,
  onSaved,
}: Props) {
  const [dockerImage, setDockerImage] = useState("");
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>([]);
  const [envRecord, setEnvRecord] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Theme state
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [suggestedColors, setSuggestedColors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMinecraft = isMinecraftImage(dockerImage);

  // Default theme banner for this game type
  const defaultTheme =
    gameType && DEFAULT_THEMES[gameType] ? DEFAULT_THEMES[gameType] : DEFAULT_THEMES._default;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSuggestedColors([]);
    setBannerPreview(null);
    setShowRestartPrompt(false);
    setRestarting(false);
    api
      .getServerConfig(serverId)
      .then((cfg: ServerConfig) => {
        setDockerImage(cfg.docker_image);
        setEnvPairs(Object.entries(cfg.env_vars).map(([key, value]) => ({ key, value })));
        setEnvRecord(cfg.env_vars);
        setBannerPath(cfg.banner_path);
        setAccentColor(cfg.accent_color);
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
            envPairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]),
          );
      await api.updateServerConfig(serverId, {
        docker_image: dockerImage,
        env_vars,
        accent_color: accentColor,
      } as ServerConfig);
      if (isRunning) {
        setShowRestartPrompt(true);
      } else {
        onSaved();
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestartConfirm() {
    setRestarting(true);
    setError(null);
    try {
      await api.stopServer(serverId);
      await api.startServer(serverId);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestarting(false);
      setShowRestartPrompt(false);
    }
  }

  function handleRestartDecline() {
    setShowRestartPrompt(false);
    onSaved();
    onClose();
  }

  async function handleBannerUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      // Extract colors from the file before uploading
      const colors = await extractColors(file, 4);
      setSuggestedColors(colors);
      if (colors.length > 0 && !accentColor) {
        setAccentColor(colors[0]);
      }

      const result = await api.uploadBanner(serverId, file);
      setBannerPath(result.banner_path);
      setBannerPreview(URL.createObjectURL(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleResetTheme() {
    setError(null);
    try {
      await api.deleteBanner(serverId);
      setBannerPath(null);
      setBannerPreview(null);
      setAccentColor(null);
      setSuggestedColors([]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addEnvPair() {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeEnvPair(index: number) {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEnvPair(index: number, field: "key" | "value", val: string) {
    setEnvPairs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)));
  }

  const displayBanner = bannerPreview || (bannerPath ? bannerPath : defaultTheme.banner);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-gray-950 border border-gray-800 rounded-2xl w-full shadow-2xl ${isMinecraft ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="font-semibold text-white">Edit Config — {serverName}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {isMinecraft ? (
                <>
                  {/* Docker Image (read-only for Minecraft) */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Docker Image</label>
                    <div className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm font-mono text-gray-400">
                      {dockerImage}
                    </div>
                  </div>

                  {/* Minecraft guided editor */}
                  <div className="max-h-[40vh] overflow-y-auto pr-1">
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

              {/* Theme Section */}
              <div className="border-t border-gray-800 pt-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">Theme</h3>

                {/* Banner preview */}
                <div className="relative h-24 rounded-xl overflow-hidden mb-3 bg-gray-900">
                  <img
                    src={displayBanner}
                    alt="Banner preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
                  <div className="absolute bottom-2 left-3 text-xs text-gray-400">
                    {bannerPath ? "Custom banner" : "Default banner"}
                  </div>
                </div>

                {/* Banner upload */}
                <div className="flex gap-2 mb-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleBannerUpload(file);
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors disabled:opacity-50"
                  >
                    {uploading ? "Uploading..." : "Upload Banner"}
                  </button>
                  {(bannerPath || accentColor) && (
                    <button
                      onClick={handleResetTheme}
                      className="px-3 py-1.5 text-gray-500 hover:text-red-400 text-xs transition-colors"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>

                {/* Accent color picker */}
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-xs text-gray-500">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor || "#4f6ef7"}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded-lg border border-gray-700 bg-transparent cursor-pointer"
                    />
                    {accentColor && (
                      <span className="text-xs font-mono text-gray-400">{accentColor}</span>
                    )}
                  </div>
                </div>

                {/* Suggested colors from banner */}
                {suggestedColors.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Suggested:</span>
                    <div className="flex gap-1.5">
                      {suggestedColors.map((color) => (
                        <button
                          key={color}
                          onClick={() => setAccentColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            accentColor === color
                              ? "border-white scale-110"
                              : "border-gray-700 hover:border-gray-500"
                          }`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
          {showRestartPrompt ? (
            <>
              <span className="text-sm text-gray-300 mr-auto">
                Restart server for changes to take effect?
              </span>
              <button
                onClick={handleRestartDecline}
                disabled={restarting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                No
              </button>
              <button
                onClick={handleRestartConfirm}
                disabled={restarting}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
              >
                {restarting ? "Restarting..." : "Yes"}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
