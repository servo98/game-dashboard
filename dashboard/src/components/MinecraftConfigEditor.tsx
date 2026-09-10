import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type CurseForgeModpack } from "../api";
import { SliderField } from "./game-config/Fields";
import {
  getAllKnownKeys,
  getModpackEnvKeys,
  getModpackPlatformByType,
  isModpackType,
  MINECRAFT_FIELDS,
  type MinecraftField,
  MODPACK_PLATFORMS,
  type ModpackPlatform,
  SECTIONS,
} from "./minecraft-config";
import { Loading } from "./ui";

type Props = {
  envVars: Record<string, string>;
  onChange: (vars: Record<string, string>) => void;
};

type Mode = "vanilla" | "modpack";

export default function MinecraftConfigEditor({ envVars, onChange }: Props) {
  const initialMode: Mode = isModpackType(envVars.TYPE ?? "") ? "modpack" : "vanilla";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(() => {
    const p = getModpackPlatformByType(envVars.TYPE ?? "");
    return p?.id ?? "modrinth";
  });
  const [cfQuery, setCfQuery] = useState("");
  const [cfResults, setCfResults] = useState<CurseForgeModpack[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState<string | null>(null);
  const cfDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const knownKeys = useMemo(() => getAllKnownKeys(), []);

  const searchCurseForge = useCallback((q: string) => {
    setCfQuery(q);
    setCfError(null);
    if (cfDebounceRef.current) clearTimeout(cfDebounceRef.current);
    if (!q.trim()) {
      setCfResults([]);
      return;
    }
    cfDebounceRef.current = setTimeout(async () => {
      setCfLoading(true);
      try {
        const results = await api.searchCurseForge(q);
        setCfResults(results);
      } catch (err) {
        setCfError(err instanceof Error ? err.message : "La búsqueda ha fallado");
        setCfResults([]);
      } finally {
        setCfLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (cfDebounceRef.current) clearTimeout(cfDebounceRef.current);
    };
  }, []);

  // Unknown env vars = user-added custom ones (not EULA, not known fields)
  const unknownPairs = useMemo(() => {
    return Object.entries(envVars)
      .filter(([k]) => !knownKeys.has(k))
      .map(([key, value]) => ({ key, value }));
  }, [envVars, knownKeys]);

  function set(key: string, value: string) {
    onChange({ ...envVars, [key]: value });
  }

  function remove(key: string) {
    const next = { ...envVars };
    delete next[key];
    onChange(next);
  }

  function switchMode(newMode: Mode) {
    setMode(newMode);
    const next = { ...envVars };

    if (newMode === "vanilla") {
      // Clean up modpack-specific keys
      for (const k of getModpackEnvKeys()) delete next[k];
      // Reset TYPE to VANILLA if it was a modpack type
      if (isModpackType(next.TYPE ?? "")) next.TYPE = "VANILLA";
    } else {
      // Switching to modpack — set TYPE to selected platform's type
      const platform = MODPACK_PLATFORMS.find((p) => p.id === selectedPlatform);
      if (platform) next.TYPE = platform.typeValue;
      // Remove VERSION so the image auto-detects it from the modpack
      delete next.VERSION;
    }

    onChange(next);
  }

  function switchPlatform(platformId: string) {
    setSelectedPlatform(platformId);
    const next = { ...envVars };

    // Remove all modpack keys first
    for (const k of getModpackEnvKeys()) delete next[k];

    // Set TYPE to the new platform's type value
    const platform = MODPACK_PLATFORMS.find((p) => p.id === platformId);
    if (platform) next.TYPE = platform.typeValue;

    onChange(next);
  }

  function addCustomPair() {
    onChange({ ...envVars, "": "" });
  }

  function updateCustomKey(oldKey: string, newKey: string) {
    const next = { ...envVars };
    const val = next[oldKey] ?? "";
    delete next[oldKey];
    next[newKey] = val;
    onChange(next);
  }

  function updateCustomValue(key: string, value: string) {
    onChange({ ...envVars, [key]: value });
  }

  function removeCustomPair(key: string) {
    remove(key);
  }

  // ── Renderers ──

  function renderField(field: MinecraftField) {
    const value = envVars[field.key] ?? field.default;

    switch (field.type) {
      case "select":
      case "memory":
        return (
          <div key={field.key}>
            <label className="block text-meta text-muted mb-1">
              {field.label}
              <span className="ml-1.5 text-faint font-normal">{field.description}</span>
            </label>
            <select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-body text-ink focus:outline-none focus:border-accent appearance-none cursor-pointer"
            >
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                  {opt.description ? ` · ${opt.description}` : ""}
                </option>
              ))}
            </select>
          </div>
        );

      case "toggle": {
        const isOn = value.toUpperCase() === "TRUE";
        return (
          <div key={field.key} className="flex items-center justify-between py-1">
            <div>
              <span className="text-body text-ink">{field.label}</span>
              <span className="ml-1.5 text-meta text-faint">{field.description}</span>
            </div>
            <button
              type="button"
              onClick={() => set(field.key, isOn ? "FALSE" : "TRUE")}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isOn ? "bg-accent" : "bg-line"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-surface rounded-full transition-transform ${
                  isOn ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        );
      }

      case "slider":
        return (
          <div key={field.key}>
            <label className="block text-meta text-muted mb-1">
              {field.label}
              <span className="ml-1.5 text-faint font-normal">{field.description}</span>
            </label>
            <SliderField
              value={value}
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              unit={field.unit}
              onChange={(v) => set(field.key, v)}
            />
          </div>
        );

      case "number":
        return (
          <div key={field.key}>
            <label className="block text-meta text-muted mb-1">
              {field.label}
              <span className="ml-1.5 text-faint font-normal">{field.description}</span>
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-body font-mono text-ink focus:outline-none focus:border-accent"
            />
          </div>
        );

      case "text":
        return (
          <div key={field.key}>
            <label className="block text-meta text-muted mb-1">
              {field.label}
              <span className="ml-1.5 text-faint font-normal">{field.description}</span>
            </label>
            <input
              type="text"
              value={value}
              placeholder={field.default || undefined}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-body font-mono text-ink focus:outline-none focus:border-accent"
            />
          </div>
        );
    }
  }

  function renderVanillaMode() {
    return (
      <div className="flex flex-col gap-5">
        {SECTIONS.map((section) => {
          const fields = MINECRAFT_FIELDS.filter((f) => f.section === section);
          if (fields.length === 0) return null;
          return (
            <div key={section}>
              <h3 className="label mb-2">{section}</h3>
              <div className="flex flex-col gap-3">{fields.map(renderField)}</div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderCurseForgeSearch() {
    const currentSlug = envVars.CF_SLUG ?? "";

    return (
      <div className="flex flex-col gap-3">
        {/* Current selection */}
        {currentSlug && (
          <div className="flex items-center gap-2 bg-surface border border-line rounded-lg px-3 py-2">
            <span className="text-meta text-muted">Elegido:</span>
            <span className="text-body font-mono text-ink">{currentSlug}</span>
            <button
              type="button"
              onClick={() => {
                remove("CF_SLUG");
                setCfQuery("");
                setCfResults([]);
              }}
              className="ml-auto text-meta text-faint hover:text-danger transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Search input */}
        <div>
          <label className="block text-meta text-muted mb-1">
            Buscar modpacks
            <span className="ml-1.5 text-faint font-normal">
              Escribe para buscar modpacks en CurseForge
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={cfQuery}
              placeholder="p. ej. all the mods"
              onChange={(e) => searchCurseForge(e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
            />
            {cfLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loading>Buscando</Loading>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {cfError && <p className="text-meta text-danger">{cfError}</p>}

        {/* Results */}
        {cfResults.length > 0 && (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto border border-line rounded-md">
            {cfResults.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  set("CF_SLUG", mod.slug);
                  setCfQuery("");
                  setCfResults([]);
                }}
                className={`tap flex items-center gap-3 px-3 py-2 text-left hover:bg-raised transition-colors ${
                  currentSlug === mod.slug ? "bg-raised" : ""
                }`}
              >
                {mod.thumbnailUrl && (
                  <img
                    src={mod.thumbnailUrl}
                    alt=""
                    className="w-8 h-8 rounded-sm object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-body text-ink truncate">{mod.name}</div>
                  <div className="text-meta text-faint truncate">{mod.summary}</div>
                </div>
                <div className="text-meta text-faint shrink-0">
                  {mod.downloadCount >= 1_000_000
                    ? `${(mod.downloadCount / 1_000_000).toFixed(1)}M`
                    : mod.downloadCount >= 1_000
                      ? `${(mod.downloadCount / 1_000).toFixed(0)}K`
                      : mod.downloadCount}{" "}
                  downloads
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results message */}
        {cfQuery.trim() && !cfLoading && cfResults.length === 0 && !cfError && (
          <p className="text-meta text-faint">Ningún modpack encontrado</p>
        )}
      </div>
    );
  }

  function renderModpackMode() {
    const platform: ModpackPlatform | undefined = MODPACK_PLATFORMS.find(
      (p) => p.id === selectedPlatform,
    );
    const compatibleFields = MINECRAFT_FIELDS.filter((f) => f.modpackCompatible);
    const isCurseForge = selectedPlatform === "curseforge";

    return (
      <div className="flex flex-col gap-5">
        {/* Platform selector */}
        <div>
          <label className="block text-meta text-faint uppercase tracking-wider mb-2">
            Platform
          </label>
          <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
            {MODPACK_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => switchPlatform(p.id)}
                className={`tap flex-1 px-3 py-1.5 text-body font-medium rounded-md transition-colors ${
                  selectedPlatform === p.id
                    ? "bg-accent text-accent-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Platform-specific fields */}
        {platform &&
          (isCurseForge ? (
            renderCurseForgeSearch()
          ) : (
            <div className="flex flex-col gap-3">
              {platform.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-meta text-muted mb-1">
                    {f.label}
                    <span className="ml-1.5 text-faint font-normal">{f.description}</span>
                  </label>
                  <input
                    type="text"
                    value={envVars[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-body font-mono text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          ))}

        {/* Common settings that work with modpacks */}
        <div>
          <h3 className="label mb-2">Common Settings</h3>
          <div className="flex flex-col gap-3">{compatibleFields.map(renderField)}</div>
        </div>
      </div>
    );
  }

  function renderOtherVars() {
    if (unknownPairs.length === 0) return null;
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="label">Other Variables</h3>
        </div>
        <div className="flex flex-col gap-2">
          {unknownPairs.map((pair) => (
            <div key={pair.key} className="flex gap-2 items-center">
              <input
                type="text"
                value={pair.key}
                onChange={(e) => updateCustomKey(pair.key, e.target.value)}
                className="flex-1 bg-surface border border-line rounded-lg px-2.5 py-1.5 text-meta font-mono text-ink focus:outline-none focus:border-accent"
              />
              <span className="text-faint">=</span>
              <input
                type="text"
                value={pair.value}
                onChange={(e) => updateCustomValue(pair.key, e.target.value)}
                className="flex-1 bg-surface border border-line rounded-lg px-2.5 py-1.5 text-meta font-mono text-ink focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => removeCustomPair(pair.key)}
                className="tap text-faint hover:text-danger transition-colors shrink-0 px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
        <button
          type="button"
          onClick={() => switchMode("vanilla")}
          className={`tap flex-1 px-3 py-1.5 text-body font-medium rounded-md transition-colors ${
            mode === "vanilla" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
          }`}
        >
          Vanilla o a medida
        </button>
        <button
          type="button"
          onClick={() => switchMode("modpack")}
          className={`tap flex-1 px-3 py-1.5 text-body font-medium rounded-md transition-colors ${
            mode === "modpack" ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
          }`}
        >
          Modpack
        </button>
      </div>

      {/* Mode content */}
      {mode === "vanilla" ? renderVanillaMode() : renderModpackMode()}

      {/* Unknown/custom env vars */}
      {renderOtherVars()}

      {/* Add custom variable */}
      <button
        type="button"
        onClick={addCustomPair}
        className="text-meta text-accent hover:text-accent transition-colors self-start"
      >
        + Add Custom Variable
      </button>
    </div>
  );
}
