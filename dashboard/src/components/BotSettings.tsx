import { useEffect, useState } from "react";
import { api, type BotSettings as BotSettingsType, type DiscordChannel } from "../api";

const CHANNEL_FIELDS = [
  {
    key: "allowed_channel_id" as const,
    label: "Bot Commands Channel",
    desc: "Restrict bot commands to this channel (empty = all channels)",
  },
  {
    key: "errors_channel_id" as const,
    label: "Error Notifications",
    desc: "Dashboard errors are sent here",
  },
  {
    key: "crashes_channel_id" as const,
    label: "Crash Notifications",
    desc: "Game server crash alerts are sent here",
  },
  { key: "logs_channel_id" as const, label: "Log Channel", desc: "General log messages" },
];

export default function BotSettings() {
  const [settings, setSettings] = useState<BotSettingsType | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getBotSettings(), api.listChannels()])
      .then(([s, ch]) => {
        setSettings(s);
        setChannels(ch);
        setDraft({
          allowed_channel_id: s.allowed_channel_id,
          errors_channel_id: s.errors_channel_id,
          crashes_channel_id: s.crashes_channel_id,
          logs_channel_id: s.logs_channel_id,
        });
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateBotSettings(draft);
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

      {/* Channel selectors */}
      <div className="flex flex-col gap-3">
        {CHANNEL_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-xs text-gray-400 mb-1">
              {field.label}
              <span className="ml-1 text-gray-600 font-normal">{field.desc}</span>
            </label>
            <select
              value={draft[field.key] ?? ""}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, [field.key]: e.target.value || null }))
              }
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 appearance-none"
            >
              <option value="">None</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
      </button>

      {/* Commands list */}
      <div className="border-t border-gray-800 pt-3">
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
