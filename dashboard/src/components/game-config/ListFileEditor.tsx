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
      <p className="text-xs font-mono text-gray-500 break-all">{path}</p>

      {overrideActive && overrideEnv && (
        <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg px-3 py-2">
          La variable <span className="font-mono">{overrideEnv}</span> está definida y pisa este
          fichero al arrancar. Bórrala en «Variables de entorno» para que mande esta lista.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {parsed.entries.length === 0 && (
          <p className="text-sm text-gray-600">La lista está vacía.</p>
        )}
        {parsed.entries.map((id) => (
          <div
            key={id}
            className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2"
          >
            <span className="text-sm font-mono text-white break-all">{id}</span>
            {!looksLikeSteamId(id) && (
              <span className="text-[10px] uppercase tracking-wide text-amber-400/90 border border-amber-700/60 rounded px-1 py-px shrink-0">
                no parece un SteamID64
              </span>
            )}
            <button
              type="button"
              onClick={() => commit(parsed.entries.filter((e) => e !== id))}
              className="ml-auto text-gray-600 hover:text-red-400 transition-colors shrink-0 px-1"
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
            className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-sm rounded-lg transition-colors shrink-0"
          >
            Añadir
          </button>
        </div>
        <p className={`text-xs mt-1.5 ${draftInvalid ? "text-amber-400" : "text-gray-600"}`}>
          {draftInvalid
            ? "Un SteamID64 son 17 dígitos empezando por 7656119. Se guardará igual por si es un ID de otra plataforma."
            : "Un SteamID64 por entrada. Se puede sacar con steamid.io o con el comando del servidor."}
        </p>
      </div>
    </div>
  );
}
