import { useCallback, useEffect, useState } from "react";
import { api, type McpTokenRecord } from "../api";

export default function McpTokens() {
  const [tokens, setTokens] = useState<McpTokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New token form
  const [showForm, setShowForm] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  // Newly created token (show once)
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTokens = useCallback(async () => {
    try {
      const list = await api.listMcpTokens();
      setTokens(list);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const result = await api.createMcpToken({
        player_name: playerName.trim(),
        label: label.trim() || undefined,
      });
      setNewToken(result.token);
      setShowForm(false);
      setPlayerName("");
      setLabel("");
      await fetchTokens();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      await api.deleteMcpToken(id);
      await fetchTokens();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* MCP Access Tokens */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-200">MCP Access Tokens</h3>
          <button
            onClick={() => {
              setShowForm(!showForm);
              setNewToken(null);
            }}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Generate Token
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* New token display */}
        {newToken && (
          <div className="bg-green-950/30 border border-green-800 rounded-xl p-4 flex flex-col gap-2">
            <p className="text-sm text-green-300 font-medium">
              Token created! Copy it now — you won't be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono break-all select-all">
                {newToken}
              </code>
              <button
                onClick={() => handleCopy(newToken)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 hover:text-white transition-colors whitespace-nowrap"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Create form */}
        {showForm && (
          <div className="bg-gray-950 border border-gray-700 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Minecraft Player Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. Steve"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Label <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Claude Desktop"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !playerName.trim()}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {creating ? "Creating..." : "Create Token"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Token list */}
        {tokens.length === 0 ? (
          <p className="text-sm text-gray-600 py-2">
            No tokens generated yet. Create one to connect your AI assistant.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl px-4 py-3"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium">{t.player_name}</span>
                    {t.label && <span className="text-gray-500 truncate">({t.label})</span>}
                  </div>
                  <div className="text-xs text-gray-600">
                    <span className="font-mono">{t.token_preview}</span>
                    {" · "}
                    Created {new Date(t.created_at * 1000).toLocaleDateString()}
                    {t.last_used_at && (
                      <>
                        {" · "}
                        Last used {new Date(t.last_used_at * 1000).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="px-2.5 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-lg text-xs transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How to Connect */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
        <h3 className="font-semibold text-gray-200">How to Connect</h3>

        <div className="flex flex-col gap-4 text-sm text-gray-400">
          <div>
            <p className="text-gray-300 font-medium mb-1">Claude.ai (Integrations)</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-500">
              <li>Go to claude.ai &rarr; Settings &rarr; Integrations</li>
              <li>Click &ldquo;Add custom integration&rdquo;</li>
              <li>
                Name: <span className="text-gray-300">Game Panel</span>
              </li>
              <li>
                URL:{" "}
                <code className="text-brand-400 bg-gray-950 px-1.5 py-0.5 rounded">
                  https://game.aypapol.com/api/mcp
                </code>
              </li>
              <li>Click Save &mdash; OAuth login will happen automatically</li>
            </ol>
            <p className="text-xs text-gray-600 mt-1">
              Uses OAuth 2.0. You&apos;ll be asked to log in with Discord and authorize access.
            </p>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-1">Claude Code (CLI)</p>
            <code className="block bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 break-all">
              claude mcp add game-panel -t streamable-http https://game.aypapol.com/api/mcp -h
              "Authorization: Bearer YOUR_TOKEN"
            </code>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-1">Available Tools</p>
            <div className="grid grid-cols-1 gap-1 text-xs">
              {[
                ["server_status", "Server status, players online"],
                ["list_quests", "Quest chapters and quests"],
                ["get_quest_progress", "Your quest completion progress"],
                ["suggest_next", "Available quests to do next"],
                ["search_recipes", "Search modpack recipe scripts"],
                ["player_stats", "Minecraft stats (kills, mining, etc.)"],
                ["list_mods", "Installed mods list"],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-brand-400 font-mono">{name}</span>
                  <span className="text-gray-600">—</span>
                  <span className="text-gray-500">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
