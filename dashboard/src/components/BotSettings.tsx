import { useEffect, useState } from "react";
import { api, type BotSettings } from "../api";

export default function BotSettings() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBotSettings()
      .then((s) => {
        setSettings(s);
        setChannelId(s.allowed_channel_id ?? "");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateBotSettings({ allowed_channel_id: channelId.trim() || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
      <h3 className="font-semibold text-gray-200">Bot Settings</h3>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Allowed channel */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">
          Allowed Channel ID
          <span className="ml-1 text-gray-600">(leave empty to allow all channels)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. 1234567890123456789"
            className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors shrink-0"
          >
            {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Commands list */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Available Commands</p>
        <div className="flex flex-col gap-1.5">
          {settings.commands.map((cmd) => (
            <div key={cmd.name} className="flex items-center gap-2 text-sm">
              <span className="text-brand-400 font-mono">/{cmd.name}</span>
              <span className="text-gray-600">—</span>
              <span className="text-gray-400">{cmd.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
