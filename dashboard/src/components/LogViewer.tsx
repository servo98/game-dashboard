import { useEffect, useRef, useState, useCallback } from "react";
import { createLogStream } from "../api";

type Props = {
  serverId: string;
  onClose: () => void;
};

const MAX_LINES = 500;

export default function LogViewer({ serverId, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const autoScroll = useRef(true);

  // Track whether user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScroll.current = atBottom;
  }, []);

  useEffect(() => {
    const es = createLogStream(serverId);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const text = JSON.parse(e.data as string) as string;
      setLines((prev) => {
        if (prev.length >= MAX_LINES) {
          const next = prev.slice(-Math.floor(MAX_LINES * 0.75));
          next.push(text);
          return next;
        }
        prev.push(text);
        return [...prev];
      });
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [serverId]);

  // Auto-scroll to bottom (instant, not smooth)
  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-sm font-medium text-gray-200">
              Live Logs — {serverId}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>

        {/* Log output */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs text-green-400 leading-relaxed"
        >
          {lines.length === 0 ? (
            <p className="text-gray-600">Waiting for log output...</p>
          ) : (
            <pre className="whitespace-pre-wrap break-all m-0">
              {lines.join("\n")}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
