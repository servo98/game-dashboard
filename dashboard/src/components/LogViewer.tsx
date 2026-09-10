import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayersResponse } from "../api";
import { api } from "../api";
import { formatLine } from "../utils/format";
import { Button, Modal, StatusMark } from "./ui";

type LogLine = {
  text: string;
  level: string;
};

type Props = {
  title: string;
  streamFactory: () => EventSource;
  onClose: () => void;
  serverId?: string;
  dockerImage?: string;
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
  INFO: "text-muted",
  WARN: "text-warn",
  ERROR: "text-danger",
  DEBUG: "text-faint",
};

export default function LogViewer({ title, streamFactory, onClose, serverId, dockerImage }: Props) {
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
  const isMC = !!serverId && !!dockerImage?.includes("itzg/minecraft-server");
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
    if (level === "COMMAND") return "text-accent font-medium";
    if (level === "RESPONSE") return "text-accent";
    return LEVEL_COLORS[level] ?? "text-muted";
  }

  // Render a single line with timestamp dimmed
  function renderLine(line: LogLine, idx: number) {
    const color = getLineColor(line.level);

    // Try to dim the timestamp portion [HH:MM:SS]
    const tsMatch = line.text.match(/^(\[[\d:]+(?:\s?[APap][Mm])?\])\s?(.*)/s);
    if (tsMatch) {
      return (
        <div key={idx} className="leading-tight">
          <span className="text-faint">{tsMatch[1]}</span>{" "}
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

  const FILTERS: Array<{ level: LogLevel; tone: string }> = [
    { level: "INFO", tone: "text-muted" },
    { level: "WARN", tone: "text-warn" },
    { level: "ERROR", tone: "text-danger" },
    { level: "DEBUG", tone: "text-faint" },
  ];

  return (
    <Modal
      title={title}
      subtitle="Registro en vivo"
      size="lg"
      padded={false}
      onClose={onClose}
      toolbar={
        <div className="flex items-center gap-2">
          <StatusMark
            tone={connected ? "ok" : "danger"}
            label={connected ? "Conectado" : "Sin conexión"}
            live={connected}
          />
          <Button tone="ghost" size="sm" onClick={() => setLines([])}>
            Limpiar
          </Button>
        </div>
      }
      footer={
        isMC ? (
          <div className="flex w-full items-center gap-2">
            <span className="num shrink-0 text-body text-faint">&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
                setHistoryIdx(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un comando"
              spellCheck={false}
              className="num h-8 flex-1 rounded-md border border-line bg-raised px-2.5 text-body
                text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <Button tone="accent" onClick={handleSendCommand} disabled={!command.trim() || sending}>
              {sending ? "Enviando" : "Enviar"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {/* Filtros de nivel y jugadores dentro: una barra, no pastillas sueltas */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2">
        <span className="label">Niveles</span>
        <div className="flex items-center gap-3">
          {FILTERS.map(({ level, tone }) => (
            <label
              key={level}
              className={`flex cursor-pointer items-center gap-1.5 font-mono text-micro uppercase
                ${filters[level] ? tone : "text-faint/50"}`}
            >
              <input
                type="checkbox"
                checked={filters[level]}
                onChange={() => toggleFilter(level)}
                className="h-3 w-3 rounded-xs border border-line-strong bg-raised accent-accent"
              />
              {level}
            </label>
          ))}
        </div>

        {isMC && players && (
          <button
            type="button"
            onClick={() => setShowPlayers((v) => !v)}
            className={`tap ml-auto font-mono text-micro uppercase ${
              showPlayers ? "text-accent" : "text-faint hover:text-muted"
            }`}
          >
            {players.count} dentro
          </button>
        )}
      </div>

      {isMC && showPlayers && players && players.online.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
          {players.online.map((p) => (
            <span
              key={p}
              className="rounded-xs border border-line bg-raised px-1.5 py-0.5 font-mono text-micro text-muted"
            >
              {p}
            </span>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-meta"
        style={{ contain: "content" }}
      >
        {filteredLines.length === 0 ? (
          <p className="text-faint">Esperando salida del registro.</p>
        ) : (
          <div className="m-0 whitespace-pre-wrap break-all">
            {filteredLines.map((line, i) => renderLine(line, i))}
          </div>
        )}

        {showScrollBtn && (
          <div className="sticky bottom-2 flex justify-end">
            <Button size="sm" onClick={scrollToBottom}>
              Ir al final
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
