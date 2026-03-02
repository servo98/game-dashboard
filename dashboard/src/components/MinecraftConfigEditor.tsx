import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type CurseForgeModpack } from "../api";
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
        setCfError(err instanceof Error ? err.message : "Search failed");
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
            <label className="block text-xs text-gray-400 mb-1">
              {field.label}
              <span className="ml-1.5 text-gray-600 font-normal">{field.description}</span>
            </label>
            <select
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500 appearance-none cursor-pointer"
            >
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                  {opt.description ? ` — ${opt.description}` : ""}
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
              <span className="text-sm text-white">{field.label}</span>
              <span className="ml-1.5 text-xs text-gray-600">{field.description}</span>
            </div>
            <button
              type="button"
              onClick={() => set(field.key, isOn ? "FALSE" : "TRUE")}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isOn ? "bg-brand-500" : "bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  isOn ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        );
      }

      case "number":
        return (
          <div key={field.key}>
            <label className="block text-xs text-gray-400 mb-1">
              {field.label}
              <span className="ml-1.5 text-gray-600 font-normal">{field.description}</span>
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
            />
          </div>
        );

      case "text":
        return (
          <div key={field.key}>
            <label className="block text-xs text-gray-400 mb-1">
              {field.label}
              <span className="ml-1.5 text-gray-600 font-normal">{field.description}</span>
            </label>
            <input
              type="text"
              value={value}
              placeholder={field.default || undefined}
              onChange={(e) => set(field.key, e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
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
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section}
              </h3>
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
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-400">Selected:</span>
            <span className="text-sm font-mono text-white">{currentSlug}</span>
            <button
              type="button"
              onClick={() => {
                remove("CF_SLUG");
                setCfQuery("");
                setCfResults([]);
              }}
              className="ml-auto text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Search input */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Search Modpacks
            <span className="ml-1.5 text-gray-600 font-normal">
              Type to search CurseForge modpacks
            </span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={cfQuery}
              placeholder="e.g. all the mods"
              onChange={(e) => searchCurseForge(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
            />
            {cfLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gray-600 border-t-brand-400 rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {cfError && <p className="text-xs text-red-400">{cfError}</p>}

        {/* Results */}
        {cfResults.length > 0 && (
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto border border-gray-700 rounded-lg">
            {cfResults.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  set("CF_SLUG", mod.slug);
                  setCfQuery("");
                  setCfResults([]);
                }}
                className={`flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-800 transition-colors ${
                  currentSlug === mod.slug ? "bg-gray-800" : ""
                }`}
              >
                {mod.thumbnailUrl && (
                  <img
                    src={mod.thumbnailUrl}
                    alt=""
                    className="w-8 h-8 rounded object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{mod.name}</div>
                  <div className="text-xs text-gray-500 truncate">{mod.summary}</div>
                </div>
                <div className="text-xs text-gray-600 shrink-0">
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
          <p className="text-xs text-gray-500">No modpacks found</p>
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
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">
            Platform
          </label>
          <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1">
            {MODPACK_PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => switchPlatform(p.id)}
                className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedPlatform === p.id
                    ? "bg-brand-500 text-white"
                    : "text-gray-400 hover:text-white"
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
                  <label className="block text-xs text-gray-400 mb-1">
                    {f.label}
                    <span className="ml-1.5 text-gray-600 font-normal">{f.description}</span>
                  </label>
                  <input
                    type="text"
                    value={envVars[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-brand-500"
                  />
                </div>
              ))}
            </div>
          ))}

        {/* Common settings that work with modpacks */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Common Settings
          </h3>
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
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Other Variables
          </h3>
        </div>
        <div className="flex flex-col gap-2">
          {unknownPairs.map((pair) => (
            <div key={pair.key} className="flex gap-2 items-center">
              <input
                type="text"
                value={pair.key}
                onChange={(e) => updateCustomKey(pair.key, e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
              />
              <span className="text-gray-600">=</span>
              <input
                type="text"
                value={pair.value}
                onChange={(e) => updateCustomValue(pair.key, e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={() => removeCustomPair(pair.key)}
                className="text-gray-600 hover:text-red-400 transition-colors shrink-0 px-1"
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
      <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1">
        <button
          type="button"
          onClick={() => switchMode("vanilla")}
          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "vanilla" ? "bg-brand-500 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          Vanilla / Custom
        </button>
        <button
          type="button"
          onClick={() => switchMode("modpack")}
          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            mode === "modpack" ? "bg-brand-500 text-white" : "text-gray-400 hover:text-white"
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
        className="text-xs text-brand-400 hover:text-brand-300 transition-colors self-start"
      >
        + Add Custom Variable
      </button>
    </div>
  );
}
