import { useEffect, useState } from "react";
import { api, type PanelSettings as PanelSettingsType } from "../api";

export default function PanelSettings() {
  const [settings, setSettings] = useState<PanelSettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((err) => setError((err as Error).message));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateSettings(settings);
      setMsg("Settings saved.");
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <div className="text-gray-500 text-sm animate-pulse">Loading settings...</div>;
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold text-gray-200">Panel Settings</h2>

      {error && (
        <div className="bg-red-950/40 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {msg && (
        <div className="bg-green-950/40 border border-green-800 rounded-xl px-4 py-3 text-sm text-green-300">
          {msg}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-gray-300">Host Domain</span>
        <input
          type="text"
          value={settings.host_domain}
          onChange={(e) => setSettings({ ...settings, host_domain: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
          placeholder="aypapol.com"
        />
        <span className="text-xs text-gray-500">
          Used for connect addresses (e.g. aypapol.com:27015)
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-gray-300">Memory Limit (GB)</span>
        <input
          type="number"
          min="1"
          max="64"
          step="0.5"
          value={settings.game_memory_limit_gb}
          onChange={(e) => setSettings({ ...settings, game_memory_limit_gb: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        />
        <span className="text-xs text-gray-500">Max RAM per game container</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-gray-300">CPU Limit (vCPUs)</span>
        <input
          type="number"
          min="0.5"
          max="16"
          step="0.5"
          value={settings.game_cpu_limit}
          onChange={(e) => setSettings({ ...settings, game_cpu_limit: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        />
        <span className="text-xs text-gray-500">Max vCPUs per game container</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-gray-300">Auto-Stop (hours)</span>
        <input
          type="number"
          min="0"
          max="72"
          step="1"
          value={settings.auto_stop_hours}
          onChange={(e) => setSettings({ ...settings, auto_stop_hours: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        />
        <span className="text-xs text-gray-500">Auto-stop server after N hours (0 = disabled)</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-gray-300">Max Backups per Server</span>
        <input
          type="number"
          min="1"
          max="20"
          step="1"
          value={settings.max_backups_per_server}
          onChange={(e) => setSettings({ ...settings, max_backups_per_server: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        />
        <span className="text-xs text-gray-500">
          Oldest backups are auto-pruned beyond this limit
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-gray-300">Auto-Backup Interval (hours)</span>
        <input
          type="number"
          min="0"
          max="168"
          step="1"
          value={settings.auto_backup_interval_hours}
          onChange={(e) => setSettings({ ...settings, auto_backup_interval_hours: e.target.value })}
          className="bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500"
        />
        <span className="text-xs text-gray-500">
          Auto-backup the active server every N hours (0 = disabled)
        </span>
      </label>

      <button
        type="submit"
        disabled={saving}
        className="self-start bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition-colors"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </form>
  );
}
