import { useMemo, useState } from "react";
import {
  DefaultBadge,
  FieldRow,
  SectionHeading,
  SelectField,
  SliderField,
  TextField,
  Toggle,
} from "./Fields";
import {
  applyCfgChanges,
  type CfgEntry,
  fieldKind,
  isDefaultValue,
  parseCfg,
  sliderStep,
} from "./ini-config";

type Props = {
  path: string;
  content: string;
  onChange: (next: string) => void;
};

/**
 * Formulario generado a partir del propio fichero: los `.cfg` de BepInEx y los
 * `.toml` de Forge documentan tipo, valor por defecto y valores aceptados, así
 * que sale un toggle/select/slider por cada opción sin saber nada del mod.
 *
 * Si el fichero no encaja en el formato (un YAML, un JSON) caemos al editor de
 * texto plano, que siempre está disponible desde el conmutador de arriba.
 */
export default function IniFileEditor({ path, content, onChange }: Props) {
  const parsed = useMemo(() => parseCfg(content), [content]);
  const parseable = parsed.entryCount > 0;
  const [rawMode, setRawMode] = useState(false);
  const [query, setQuery] = useState("");

  const showRaw = rawMode || !parseable;

  function setEntry(entry: CfgEntry, value: string) {
    onChange(applyCfgChanges(parsed, { [entry.id]: value }));
  }

  const needle = query.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!needle) return parsed.sections;
    return parsed.sections
      .map((section) => ({
        ...section,
        entries: section.entries.filter(
          (e) =>
            e.key.toLowerCase().includes(needle) ||
            e.description.toLowerCase().includes(needle) ||
            section.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((section) => section.entries.length > 0);
  }, [parsed.sections, needle]);

  function renderEntry(entry: CfgEntry) {
    const kind = fieldKind(entry);
    const hint = isDefaultValue(entry) ? <DefaultBadge /> : undefined;
    const description = [
      entry.description,
      entry.defaultValue !== undefined && !isDefaultValue(entry)
        ? `Por defecto: ${entry.defaultValue || "(vacío)"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    let control: React.ReactNode;
    switch (kind) {
      case "toggle":
        control = (
          <div className="flex sm:justify-end">
            <Toggle
              checked={entry.value.trim().toLowerCase() === "true"}
              onChange={(on) => setEntry(entry, on ? "true" : "false")}
            />
          </div>
        );
        break;
      case "select":
        control = (
          <SelectField
            value={entry.value}
            options={(entry.acceptableValues ?? []).map((v) => ({ value: v, label: v }))}
            onChange={(v) => setEntry(entry, v)}
          />
        );
        break;
      case "slider":
        control = (
          <SliderField
            value={entry.value}
            min={entry.min!}
            max={entry.max!}
            step={sliderStep(entry)}
            onChange={(v) => setEntry(entry, v)}
          />
        );
        break;
      case "number":
        control = (
          <TextField type="number" value={entry.value} onChange={(v) => setEntry(entry, v)} />
        );
        break;
      default:
        control = <TextField mono value={entry.value} onChange={(v) => setEntry(entry, v)} />;
    }

    return (
      <FieldRow key={entry.id} label={entry.key} description={description} hint={hint}>
        {control}
      </FieldRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-meta font-mono text-faint mr-auto break-all">{path}</p>
        {parseable && (
          <div className="flex bg-surface border border-line rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setRawMode(false)}
              className={`tap px-2.5 py-1 rounded-md text-meta transition-colors ${
                !rawMode ? "bg-raised text-ink" : "text-faint hover:text-muted"
              }`}
            >
              Formulario
            </button>
            <button
              type="button"
              onClick={() => setRawMode(true)}
              className={`tap px-2.5 py-1 rounded-md text-meta transition-colors ${
                rawMode ? "bg-raised text-ink" : "text-faint hover:text-muted"
              }`}
            >
              Texto
            </button>
          </div>
        )}
      </div>

      {!parseable && (
        <p className="text-meta text-faint bg-surface/60 border border-line rounded-lg px-3 py-2">
          Este fichero no tiene el formato clave/valor que el formulario sabe leer, así que se edita
          como texto.
        </p>
      )}

      {showRaw ? (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-full h-[55vh] bg-surface border border-line rounded-lg px-3 py-2 text-meta font-mono text-ink focus:outline-none focus:border-accent resize-none"
        />
      ) : (
        <>
          <input
            type="text"
            value={query}
            placeholder={`Buscar entre ${parsed.entryCount} opciones…`}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
          />

          {sections.length === 0 ? (
            <p className="text-body text-faint">Ninguna opción coincide con «{query}».</p>
          ) : (
            <div className="flex flex-col gap-6">
              {sections.map((section) => (
                <div key={section.name || "__root"}>
                  <SectionHeading title={section.name || "General"} />
                  <div className="flex flex-col gap-3">{section.entries.map(renderEntry)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
