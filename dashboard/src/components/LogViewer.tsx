import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayersResponse } from "../api";
import { api } from "../api";
import { formatLine } from "../utils/format";

type LogLine = {
  text: string;
  level: string;
};

type Props = {
  title: string;
  streamFactory: () => EventSource;
  onClose: () => void;
  serverId?: string;
  gameType?: string;
};

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

const MAX_LINES = 500;

const LEVEL_REGEX = /\[.*?\/(\w+)\]/;

function parseLevel(text: string): string {
  const match = text.match(LEVEL_REGEX);
  if (match) {
    const level = match[1].toUpperCase();
    if (level === "WARN" || level === "WARNING") return "WARN";
    if (level === "ERROR" || level === "FATAL") return "ERROR";
    if (level === "DEBUG") return "DEBUG";
    return "INFO";
  }
  return "INFO";
}

const LEVEL_COLORS: Record<string, string> = {
  INFO: "text-gray-300",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-gray-500",
};

export default function LogViewer({ title, streamFactory, onClose, serverId, gameType }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const autoScroll = useRef(true);
  const isScrolling = useRef(false);
  const bufferRef = useRef<LogLine[]>([]);
  const rafRef = useRef<number>(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Log level filters
  const [filters, setFilters] = useState<Record<LogLevel, boolean>>({
    INFO: true,
    WARN: true,
    ERROR: true,
    DEBUG: false,
  });

  // Command input state (MC only)
  const isMC = gameType === "minecraft" && !!serverId;
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Player list state (MC only)
  const [players, setPlayers] = useState<PlayersResponse | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);

  // Track whether user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    if (isScrolling.current) return;
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScroll.current = atBottom;
    setShowScrollBtn(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      isScrolling.current = true;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      autoScroll.current = true;
      setShowScrollBtn(false);
      requestAnimationFrame(() => {
        isScrolling.current = false;
      });
    }
  }, []);

  useEffect(() => {
    const es = streamFactory();
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const text = formatLine(JSON.parse(e.data as string) as string);
      const level = parseLevel(text);
      bufferRef.current.push({ text, level });

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          const batch = bufferRef.current;
          bufferRef.current = [];
          rafRef.current = 0;

          setLines((prev) => {
            const merged = [...prev, ...batch];
            if (merged.length > MAX_LINES) {
              return merged.slice(-Math.floor(MAX_LINES * 0.75));
            }
            return merged;
          });

          // Auto-scroll after state update paints
          requestAnimationFrame(() => {
            if (autoScroll.current && containerRef.current) {
              isScrolling.current = true;
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
              requestAnimationFrame(() => {
                isScrolling.current = false;
              });
            }
          });
        });
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      cancelAnimationFrame(rafRef.current);
      bufferRef.current = [];
      rafRef.current = 0;
    };
  }, [streamFactory]);

  // Poll players for MC servers
  useEffect(() => {
    if (!isMC) return;
    let cancelled = false;

    const fetchPlayers = async () => {
      try {
        const data = await api.getPlayers(serverId);
        if (!cancelled) setPlayers(data);
      } catch {
        if (!cancelled) setPlayers(null);
      }
    };

    fetchPlayers();
    const interval = setInterval(fetchPlayers, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isMC, serverId]);

  // Send RCON command
  const handleSendCommand = useCallback(async () => {
    if (!serverId || !command.trim() || sending) return;
    const cmd = command.trim();

    setSending(true);
    setCommandHistory((prev) => {
      const filtered = prev.filter((c) => c !== cmd);
      return [cmd, ...filtered].slice(0, 50);
    });
    setHistoryIdx(-1);
    setCommand("");

    // Add command echo to log
    setLines((prev) => [...prev, { text: `> ${cmd}`, level: "COMMAND" }]);

    try {
      const res = await api.sendCommand(serverId, cmd);
      if (res.output) {
        setLines((prev) => [...prev, { text: res.output, level: "RESPONSE" }]);
      }
    } catch (err) {
      setLines((prev) => [...prev, { text: `Error: ${(err as Error).message}`, level: "ERROR" }]);
    } finally {
      setSending(false);
      // Scroll to bottom after command
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
          autoScroll.current = true;
          setShowScrollBtn(false);
        }
      });
    }
  }, [serverId, command, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSendCommand();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length > 0) {
          const newIdx = Math.min(historyIdx + 1, commandHistory.length - 1);
          setHistoryIdx(newIdx);
          setCommand(commandHistory[newIdx]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx > 0) {
          const newIdx = historyIdx - 1;
          setHistoryIdx(newIdx);
          setCommand(commandHistory[newIdx]);
        } else {
          setHistoryIdx(-1);
          setCommand("");
        }
      }
    },
    [handleSendCommand, commandHistory, historyIdx],
  );

  const toggleFilter = (level: LogLevel) => {
    setFilters((prev) => ({ ...prev, [level]: !prev[level] }));
  };

  // Filter lines based on active filters
  const filteredLines = lines.filter((line) => {
    if (line.level === "COMMAND" || line.level === "RESPONSE") return true;
    return filters[line.level as LogLevel] ?? true;
  });

  function getLineColor(level: string): string {
    if (level === "COMMAND") return "text-cyan-400";
    if (level === "RESPONSE") return "text-cyan-300";
    return LEVEL_COLORS[level] ?? "text-gray-300";
  }

  // Render a single line with timestamp dimmed
  function renderLine(line: LogLine, idx: number) {
    const color = getLineColor(line.level);

    // Try to dim the timestamp portion [HH:MM:SS]
    const tsMatch = line.text.match(/^(\[[\d:]+(?:\s?[APap][Mm])?\])\s?(.*)/s);
    if (tsMatch) {
      return (
        <div key={idx} className="leading-tight">
          <span className="text-gray-500">{tsMatch[1]}</span>{" "}
          <span className={color}>{tsMatch[2]}</span>
        </div>
      );
    }

    return (
      <div key={idx} className={`leading-tight ${color}`}>
        {line.text}
      </div>
    );
  }

  const filterButtons: { level: LogLevel; label: string; color: string; activeColor: string }[] = [
    {
      level: "INFO",
      label: "INFO",
      color: "text-gray-400 border-gray-600",
      activeColor: "text-gray-200 bg-gray-700 border-gray-500",
    },
    {
      level: "WARN",
      label: "WARN",
      color: "text-yellow-500/60 border-yellow-700/40",
      activeColor: "text-yellow-300 bg-yellow-900/30 border-yellow-600",
    },
    {
      level: "ERROR",
      label: "ERROR",
      color: "text-red-500/60 border-red-700/40",
      activeColor: "text-red-300 bg-red-900/30 border-red-600",
    },
    {
      level: "DEBUG",
      label: "DEBUG",
      color: "text-gray-500 border-gray-700",
      activeColor: "text-gray-300 bg-gray-800 border-gray-500",
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium text-gray-200">Live Logs — {title}</span>

            {/* Player badge (MC only) */}
            {isMC && players && (
              <div className="relative">
                <button
                  onClick={() => setShowPlayers((p) => !p)}
                  className="ml-2 px-2 py-0.5 rounded-full bg-gray-800 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  {players.count} player{players.count !== 1 ? "s" : ""}
                </button>
                {showPlayers && players.online.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl px-3 py-2 z-10 min-w-[120px]">
                    {players.online.map((p) => (
                      <div key={p} className="text-xs text-gray-300 py-0.5">
                        {p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            {filterButtons.map((fb) => (
              <button
                key={fb.level}
                onClick={() => toggleFilter(fb.level)}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                  filters[fb.level] ? fb.activeColor : fb.color
                }`}
              >
                {fb.label}
              </button>
            ))}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1 ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Log output */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs relative"
          style={{ contain: "content" }}
        >
          {filteredLines.length === 0 ? (
            <p className="text-gray-600">Waiting for log output...</p>
          ) : (
            <div className="whitespace-pre-wrap break-all m-0">
              {filteredLines.map((line, i) => renderLine(line, i))}
            </div>
          )}

          {/* Scroll to bottom button */}
          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              className="sticky bottom-2 left-full -translate-x-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg border border-gray-700 transition-colors flex items-center gap-1"
            >
              ↓ Latest
            </button>
          )}
        </div>

        {/* Command input (MC only) */}
        {isMC && (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-800">
            <span className="text-gray-500 text-xs font-mono">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
                setHistoryIdx(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            <button
              onClick={handleSendCommand}
              disabled={!command.trim() || sending}
              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
            >
              {sending ? "..." : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
