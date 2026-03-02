import type { GameServer } from "../api";

type Props = {
  banner: string;
  activeServer: GameServer | null;
  loading: boolean;
  onStop: (id: string) => void;
};

export default function ThemeBanner({ banner, activeServer, loading, onStop }: Props) {
  return (
    <div className="relative mb-6 h-40 sm:h-48 rounded-2xl overflow-hidden">
      {/* Background image */}
      <img src={banner} alt="" className="absolute inset-0 w-full h-full object-cover" />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />

      {/* Content */}
      <div className="relative h-full flex flex-col justify-end p-4 sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            {activeServer ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs text-green-400 font-medium uppercase tracking-wide">
                    Running
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">{activeServer.name}</h2>
                <p className="text-sm text-gray-400 mt-0.5">Port {activeServer.port}</p>
              </>
            ) : (
              <>
                <h2 className="text-xl sm:text-2xl font-bold text-white">Game Panel</h2>
                <p className="text-sm text-gray-400 mt-0.5">No server running</p>
              </>
            )}
          </div>

          {activeServer && (
            <button
              onClick={() => onStop(activeServer.id)}
              disabled={loading}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 backdrop-blur-sm"
            >
              {loading ? "Stopping..." : "Stop Server"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
