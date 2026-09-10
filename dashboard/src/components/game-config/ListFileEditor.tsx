import { useMemo, useState } from "react";
import { looksLikeSteamId, parseIdList, serializeIdList } from "./list-config";

type Props = {
  path: string;
  content: string;
  /** Nombre de la variable de entorno que pisaría este fichero, si la hay */
  overrideEnv?: string;
  overrideActive?: boolean;
  onChange: (next: string) => void;
};

/** Editor para adminlist.txt / bannedlist.txt / permittedlist.txt. */
export default function ListFileEditor({
  path,
  content,
  overrideEnv,
  overrideActive,
  onChange,
}: Props) {
  const parsed = useMemo(() => parseIdList(content), [content]);
  const [draft, setDraft] = useState("");

  function commit(entries: string[]) {
    onChange(serializeIdList(parsed, entries));
  }

  function add() {
    const value = draft.trim();
    if (!value || parsed.entries.includes(value)) {
      setDraft("");
      return;
    }
    commit([...parsed.entries, value]);
    setDraft("");
  }

  const draftInvalid = draft.trim() !== "" && !looksLikeSteamId(draft);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-meta font-mono text-faint break-all">{path}</p>

      {overrideActive && overrideEnv && (
        <div className="text-meta text-warn bg-warn/10 border border-warn/60 rounded-md px-3 py-2">
          La variable <span className="font-mono">{overrideEnv}</span> está definida y pisa este
          fichero al arrancar. Bórrala en «Variables de entorno» para que mande esta lista.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {parsed.entries.length === 0 && (
          <p className="text-body text-faint">La lista está vacía.</p>
        )}
        {parsed.entries.map((id) => (
          <div
            key={id}
            className="flex items-center gap-2 bg-surface border border-line rounded-lg px-3 py-2"
          >
            <span className="text-body font-mono text-ink break-all">{id}</span>
            {!looksLikeSteamId(id) && (
              <span className="text-[10px] uppercase tracking-wide text-warn border border-warn/60 rounded-sm px-1 py-px shrink-0">
                no parece un SteamID64
              </span>
            )}
            <button
              type="button"
              onClick={() => commit(parsed.entries.filter((e) => e !== id))}
              className="tap ml-auto text-faint hover:text-danger transition-colors shrink-0 px-1"
              title="Quitar"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            placeholder="76561198000000000"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-3 py-2 text-body font-mono text-ink focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="tap px-3 py-2 bg-raised hover:bg-line disabled:opacity-40 text-muted text-body rounded-md transition-colors shrink-0"
          >
            Añadir
          </button>
        </div>
        <p className={`text-meta mt-1.5 ${draftInvalid ? "text-warn" : "text-faint"}`}>
          {draftInvalid
            ? "Un SteamID64 son 17 dígitos empezando por 7656119. Se guardará igual por si es un ID de otra plataforma."
            : "Un SteamID64 por entrada. Se puede sacar con steamid.io o con el comando del servidor."}
        </p>
      </div>
    </div>
  );
}
