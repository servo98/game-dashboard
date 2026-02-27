import { useState } from "react";
import type { GameServer } from "../api";

type Props = {
  server: GameServer;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onViewLogs: () => void;
  loading: boolean;
};

const GAME_ICONS: Record<string, string> = {
  minecraft: "⛏️",
  valheim: "🪓",
};

const STATUS_COLOR: Record<string, string> = {
  running: "bg-green-500",
  stopped: "bg-gray-500",
  missing: "bg-gray-700",
};

// Para Minecraft usamos el subdominio sin puerto gracias al SRV record.
// Para el resto mostramos host:puerto.
const GAME_HOST: Record<string, (port: number) => string> = {
  minecraft: () => "mc.aypapol.com",
};

function connectAddress(game_type: string, port: number): string {
  const fn = GAME_HOST[game_type];
  return fn ? fn(port) : `aypapol.com:${port}`;
}

export default function ServerCard({
  server,
  isActive,
  onStart,
  onStop,
  onViewLogs,
  loading,
}: Props) {
  const [copied, setCopied] = useState(false);
  const icon = GAME_ICONS[server.game_type] ?? "🎮";
  const isRunning = server.status === "running";
  const address = connectAddress(server.game_type, server.port);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`bg-gray-900 border rounded-2xl p-5 flex flex-col gap-4 transition-all ${
        isActive ? "border-brand-500 shadow-lg shadow-brand-500/10" : "border-gray-800"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{icon}</span>
          <div>
            <h3 className="font-semibold text-white leading-tight">{server.name}</h3>
            <p className="text-xs text-gray-500">Port {server.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLOR[server.status]}`}
          />
          <span className="text-xs text-gray-400 capitalize">{server.status}</span>
        </div>
      </div>

      {/* Connect address — solo cuando está corriendo */}
      {isRunning && (
        <div className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl px-3 py-2">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 leading-none mb-0.5">Conectar</span>
            <span className="text-sm font-mono text-green-400">{address}</span>
          </div>
          <button
            onClick={handleCopy}
            className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors shrink-0"
          >
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={loading}
            className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2 text-sm font-medium transition-colors"
          >
            {loading ? "Starting..." : "Start"}
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-2 text-sm font-medium transition-colors"
          >
            {loading ? "Stopping..." : "Stop"}
          </button>
        )}
        {isRunning && (
          <button
            onClick={onViewLogs}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-300 transition-colors"
          >
            Logs
          </button>
        )}
      </div>
    </div>
  );
}
