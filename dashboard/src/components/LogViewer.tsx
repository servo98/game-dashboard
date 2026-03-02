import { useCallback, useEffect, useRef, useState } from "react";
import { formatLine } from "../utils/format";

type Props = {
  title: string;
  streamFactory: () => EventSource;
  onClose: () => void;
};

const MAX_LINES = 500;

export default function LogViewer({ title, streamFactory, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const autoScroll = useRef(true);
  const isScrolling = useRef(false);
  const bufferRef = useRef<string[]>([]);
  const rafRef = useRef<number>(0);

  // Track whether user has scrolled up (disable auto-scroll)
  const handleScroll = useCallback(() => {
    if (isScrolling.current) return;
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScroll.current = atBottom;
  }, []);

  useEffect(() => {
    const es = streamFactory();
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const text = formatLine(JSON.parse(e.data as string) as string);
      bufferRef.current.push(text);

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
          className="flex-1 overflow-y-auto p-4 font-mono text-xs text-green-400 leading-tight"
          style={{ contain: "content" }}
        >
          {lines.length === 0 ? (
            <p className="text-gray-600">Waiting for log output...</p>
          ) : (
            <pre className="whitespace-pre-wrap break-all m-0 leading-tight">
              {lines.join("\n")}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
