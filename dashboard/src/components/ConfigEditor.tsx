import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ConfigFileEntry, type ServerConfig } from "../api";
import { DEFAULT_THEMES } from "../theme";
import { extractColors } from "../utils/color-extract";
import IniFileEditor from "./game-config/IniFileEditor";
import ListFileEditor from "./game-config/ListFileEditor";
import { ValheimEnvSection, ValheimWorldSection } from "./game-config/ValheimConfigEditor";
import {
  getValheimKnownKeys,
  LIST_OVERRIDE_ENV,
  VALHEIM_SECTIONS,
  type ValheimSection,
} from "./game-config/valheim-config";
import MinecraftConfigEditor from "./MinecraftConfigEditor";

type Props = {
  serverId: string;
  serverName: string;
  gameType?: string;
  open: boolean;
  isRunning?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type EnvPair = { key: string; value: string };

type FileState = {
  original: string;
  current: string;
  loading: boolean;
  error: string | null;
};

type PanelGroup = "General" | "Juego" | "Archivos de config" | "Avanzado";

type Panel = {
  id: string;
  label: string;
  sublabel?: string;
  group: PanelGroup;
};

function isMinecraftImage(image: string): boolean {
  return image.includes("itzg/minecraft-server");
}

/** El editor guiado trabaja con un record; la lista de pares guarda el orden. */
function pairsToRecord(pairs: EnvPair[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (key) record[key] = pair.value;
  }
  return record;
}

/**
 * Vuelca un record sobre la lista de pares conservando el orden original y las
 * filas que el usuario esté escribiendo a medias (clave todavía vacía).
 */
function applyRecordToPairs(pairs: EnvPair[], record: Record<string, string>): EnvPair[] {
  const seen = new Set<string>();
  const next: EnvPair[] = [];

  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key) {
      next.push(pair);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    if (!(key in record)) continue;
    next.push({ key: pair.key, value: record[key] });
  }

  for (const [key, value] of Object.entries(record)) {
    if (!seen.has(key)) next.push({ key, value });
  }

  return next;
}

/** Compress an image file using canvas (resize + JPEG compression) */
function compressImage(file: File, maxWidth: number, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

const INPUT_CLASS =
  "w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500";

export default function ConfigEditor({
  serverId,
  serverName,
  gameType,
  open,
  isRunning = false,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [port, setPort] = useState(0);
  const [dockerImage, setDockerImage] = useState("");
  const [envPairs, setEnvPairs] = useState<EnvPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRestartPrompt, setShowRestartPrompt] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [panelId, setPanelId] = useState("general");

  // Ficheros de configuración descubiertos en los volúmenes del server
  const [configFiles, setConfigFiles] = useState<ConfigFileEntry[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileState, setFileState] = useState<Record<string, FileState>>({});

  // Theme state
  const [bannerPath, setBannerPath] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [suggestedColors, setSuggestedColors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const envRecord = useMemo(() => pairsToRecord(envPairs), [envPairs]);
  const isMinecraft = isMinecraftImage(dockerImage);
  const isValheim = gameType === "valheim" || dockerImage.includes("valheim-server");

  const setEnvRecord = useCallback((record: Record<string, string>) => {
    setEnvPairs((prev) => applyRecordToPairs(prev, record));
  }, []);

  const defaultTheme =
    gameType && DEFAULT_THEMES[gameType] ? DEFAULT_THEMES[gameType] : DEFAULT_THEMES._default;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSuggestedColors([]);
    setBannerPreview(null);
    setShowRestartPrompt(false);
    setRestarting(false);
    setPanelId("general");
    setFileState({});
    setConfigFiles([]);
    setFilesError(null);

    api
      .getServerConfig(serverId)
      .then((cfg: ServerConfig) => {
        setName(cfg.name);
        setPort(cfg.port);
        setDockerImage(cfg.docker_image);
        setEnvPairs(Object.entries(cfg.env_vars).map(([key, value]) => ({ key, value })));
        setBannerPath(cfg.banner_path);
        setAccentColor(cfg.accent_color);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    // El escaneo puede tardar más que la config: no bloquea al modal.
    api
      .listConfigFiles(serverId)
      .then(setConfigFiles)
      .catch((err: Error) => setFilesError(err.message));
  }, [open, serverId]);

  // Carga perezosa del fichero seleccionado
  useEffect(() => {
    if (!panelId.startsWith("file:")) return;
    const path = panelId.slice("file:".length);
    if (fileState[path]) return;

    setFileState((prev) => ({
      ...prev,
      [path]: { original: "", current: "", loading: true, error: null },
    }));

    api
      .readTextFile(serverId, path)
      .then((res) =>
        setFileState((prev) => ({
          ...prev,
          [path]: { original: res.content, current: res.content, loading: false, error: null },
        })),
      )
      .catch((err: Error) =>
        setFileState((prev) => ({
          ...prev,
          [path]: { original: "", current: "", loading: false, error: err.message },
        })),
      );
  }, [panelId, serverId, fileState]);

  const dirtyPaths = useMemo(
    () =>
      Object.entries(fileState)
        .filter(([, state]) => !state.loading && state.current !== state.original)
        .map(([path]) => path),
    [fileState],
  );

  const panels = useMemo<Panel[]>(() => {
    const list: Panel[] = [
      { id: "general", label: "Servidor y contenedor", group: "General" },
      { id: "theme", label: "Apariencia", group: "General" },
    ];

    if (isMinecraft) {
      list.push({ id: "game:minecraft", label: "Minecraft", group: "Juego" });
    } else if (isValheim) {
      list.push({ id: "game:Servidor", label: "Servidor", group: "Juego" });
      list.push({ id: "game:world", label: "Mundo y dificultad", group: "Juego" });
      for (const section of VALHEIM_SECTIONS) {
        if (section === "Servidor") continue;
        list.push({ id: `game:${section}`, label: section, group: "Juego" });
      }
    }

    for (const file of configFiles) {
      const dir = file.path.slice(0, file.path.length - file.name.length).replace(/\/$/, "");
      list.push({
        id: `file:${file.path}`,
        label: file.name,
        sublabel: dir || undefined,
        group: "Archivos de config",
      });
    }

    list.push({ id: "env", label: "Variables de entorno", group: "Avanzado" });
    return list;
  }, [isMinecraft, isValheim, configFiles]);

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const env_vars = Object.fromEntries(
        envPairs.filter((p) => p.key.trim()).map((p) => [p.key.trim(), p.value]),
      );
      await api.updateServerConfig(serverId, {
        name,
        port,
        docker_image: dockerImage,
        env_vars,
        accent_color: accentColor,
      } as ServerConfig);

      for (const path of dirtyPaths) {
        await api.writeTextFile(serverId, path, fileState[path].current);
      }
      if (dirtyPaths.length > 0) {
        setFileState((prev) => {
          const next = { ...prev };
          for (const path of dirtyPaths) {
            next[path] = { ...next[path], original: next[path].current };
          }
          return next;
        });
      }

      if (isRunning) {
        setShowRestartPrompt(true);
      } else {
        onSaved();
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestartConfirm() {
    setRestarting(true);
    setError(null);
    try {
      await api.stopServer(serverId);
      await api.startServer(serverId);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestarting(false);
      setShowRestartPrompt(false);
    }
  }

  function handleRestartDecline() {
    setShowRestartPrompt(false);
    onSaved();
    onClose();
  }

  async function handleBannerUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file, 1920, 0.8);
      const colors = await extractColors(compressed, 4);
      setSuggestedColors(colors);
      if (colors.length > 0 && !accentColor) {
        setAccentColor(colors[0]);
      }
      const result = await api.uploadBanner(serverId, compressed);
      setBannerPath(result.banner_path);
      setBannerPreview(URL.createObjectURL(compressed));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleResetTheme() {
    setError(null);
    try {
      await api.deleteBanner(serverId);
      setBannerPath(null);
      setBannerPreview(null);
      setAccentColor(null);
      setSuggestedColors([]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addEnvPair() {
    setEnvPairs((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeEnvPair(index: number) {
    setEnvPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEnvPair(index: number, field: "key" | "value", val: string) {
    setEnvPairs((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: val } : p)));
  }

  function setFileContent(path: string, content: string) {
    setFileState((prev) => ({ ...prev, [path]: { ...prev[path], current: content } }));
  }

  function revertFile(path: string) {
    setFileState((prev) => ({ ...prev, [path]: { ...prev[path], current: prev[path].original } }));
  }

  const displayBanner = bannerPreview || (bannerPath ? bannerPath : defaultTheme.banner);

  // ── Paneles ──

  function renderGeneral() {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1.5">Nombre del panel</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <div className="sm:w-32">
            <label className="block text-xs text-gray-500 mb-1.5">Puerto</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className={`${INPUT_CLASS} font-mono`}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Imagen Docker</label>
          {isMinecraft ? (
            <div className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm font-mono text-gray-400 break-all">
              {dockerImage}
            </div>
          ) : (
            <input
              type="text"
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
              className={`${INPUT_CLASS} font-mono`}
            />
          )}
          {isMinecraft && (
            <p className="text-xs text-gray-600 mt-1.5">
              La imagen la elige el editor de Minecraft según la versión.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderTheme() {
    return (
      <div className="flex flex-col gap-4 max-w-2xl">
        <div className="relative h-32 rounded-xl overflow-hidden bg-gray-900">
          <img src={displayBanner} alt="Banner preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
          <div className="absolute bottom-2 left-3 text-xs text-gray-400">
            {bannerPath ? "Banner propio" : "Banner por defecto"}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleBannerUpload(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? "Subiendo..." : "Subir banner"}
          </button>
          {(bannerPath || accentColor) && (
            <button
              onClick={handleResetTheme}
              className="px-3 py-1.5 text-gray-500 hover:text-red-400 text-xs transition-colors"
            >
              Volver al de por defecto
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-500">Color de acento</label>
          <input
            type="color"
            value={accentColor || "#4f6ef7"}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-8 h-8 rounded-lg border border-gray-700 bg-transparent cursor-pointer"
          />
          {accentColor && <span className="text-xs font-mono text-gray-400">{accentColor}</span>}
        </div>

        {suggestedColors.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Sugeridos:</span>
            <div className="flex gap-1.5">
              {suggestedColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setAccentColor(color)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    accentColor === color
                      ? "border-white scale-110"
                      : "border-gray-700 hover:border-gray-500"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderEnvPairs() {
    return (
      <div className="flex flex-col gap-3 max-w-3xl">
        <p className="text-xs text-gray-500">
          Todas las variables tal cual se le pasan al contenedor. Lo que toques en las otras
          secciones acaba aquí.
        </p>
        <div className="flex flex-col gap-2">
          {envPairs.map((pair, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="CLAVE"
                value={pair.key}
                onChange={(e) => updateEnvPair(i, "key", e.target.value)}
                className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
              />
              <span className="text-gray-600">=</span>
              <input
                type="text"
                placeholder="valor"
                value={pair.value}
                onChange={(e) => updateEnvPair(i, "value", e.target.value)}
                className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={() => removeEnvPair(i)}
                className="text-gray-600 hover:text-red-400 transition-colors shrink-0 px-1"
              >
                ✕
              </button>
            </div>
          ))}
          {envPairs.length === 0 && (
            <p className="text-xs text-gray-600">No hay variables definidas.</p>
          )}
        </div>
        <div>
          <button
            onClick={addEnvPair}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            + Añadir variable
          </button>
        </div>
      </div>
    );
  }

  function renderFilePanel(path: string) {
    const state = fileState[path];
    if (!state || state.loading) {
      return (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (state.error) {
      return (
        <div className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
          {state.error}
        </div>
      );
    }

    const fileName = path.split("/").pop() ?? path;
    const overrideEnv = LIST_OVERRIDE_ENV[fileName];
    const isIdList = !!overrideEnv;
    const dirty = state.current !== state.original;

    return (
      <div className="flex flex-col gap-4">
        {dirty && (
          <div className="flex items-center gap-3 text-xs text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded-lg px-3 py-2">
            <span>Hay cambios sin guardar en este fichero.</span>
            <button
              onClick={() => revertFile(path)}
              className="ml-auto text-amber-200 hover:text-white transition-colors"
            >
              Descartar
            </button>
          </div>
        )}
        {isIdList ? (
          <ListFileEditor
            path={path}
            content={state.current}
            overrideEnv={overrideEnv}
            overrideActive={!!envRecord[overrideEnv]?.trim()}
            onChange={(next) => setFileContent(path, next)}
          />
        ) : (
          <IniFileEditor
            path={path}
            content={state.current}
            onChange={(next) => setFileContent(path, next)}
          />
        )}
      </div>
    );
  }

  function renderPanel() {
    if (panelId === "general") return renderGeneral();
    if (panelId === "theme") return renderTheme();
    if (panelId === "env") return renderEnvPairs();
    if (panelId === "game:minecraft") {
      return <MinecraftConfigEditor envVars={envRecord} onChange={setEnvRecord} />;
    }
    if (panelId === "game:world") {
      return <ValheimWorldSection envVars={envRecord} onChange={setEnvRecord} />;
    }
    if (panelId.startsWith("game:")) {
      return (
        <ValheimEnvSection
          section={panelId.slice("game:".length) as ValheimSection}
          envVars={envRecord}
          onChange={setEnvRecord}
        />
      );
    }
    if (panelId.startsWith("file:")) return renderFilePanel(panelId.slice("file:".length));
    return null;
  }

  const groups: PanelGroup[] = ["General", "Juego", "Archivos de config", "Avanzado"];
  const activePanel = panels.find((p) => p.id === panelId);
  const unknownEnvCount = isValheim
    ? envPairs.filter((p) => p.key.trim() && !getValheimKnownKeys().has(p.key.trim())).length
    : 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-6xl h-[92vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-white truncate">
              Configuración — {name || serverName}
            </h2>
            {activePanel && (
              <p className="text-xs text-gray-500 truncate">
                {activePanel.group} · {activePanel.label}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 shrink-0"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex justify-center items-center">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col md:flex-row min-h-0">
            {/* Navegación */}
            <nav className="md:w-60 shrink-0 border-b md:border-b-0 md:border-r border-gray-800 md:overflow-y-auto overflow-x-auto">
              <div className="flex md:flex-col gap-1 p-2 md:p-3 min-w-max md:min-w-0">
                {groups.map((group) => {
                  const items = panels.filter((p) => p.group === group);
                  if (items.length === 0 && group !== "Archivos de config") return null;
                  return (
                    <div
                      key={group}
                      className="flex md:flex-col gap-1 md:mb-2 items-center md:items-stretch"
                    >
                      <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider px-2 md:mb-1 whitespace-nowrap">
                        {group}
                      </span>
                      {items.length === 0 ? (
                        <span className="text-xs text-gray-700 px-2 py-1.5 whitespace-nowrap">
                          {filesError ? "No disponible" : "Ninguno encontrado"}
                        </span>
                      ) : (
                        items.map((panel) => {
                          const path = panel.id.startsWith("file:")
                            ? panel.id.slice("file:".length)
                            : null;
                          const dirty = path ? dirtyPaths.includes(path) : false;
                          return (
                            <button
                              key={panel.id}
                              onClick={() => setPanelId(panel.id)}
                              className={`text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap md:whitespace-normal ${
                                panelId === panel.id
                                  ? "bg-gray-800 text-white"
                                  : "text-gray-400 hover:text-white hover:bg-gray-900"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="truncate">{panel.label}</span>
                                {dirty && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                )}
                              </span>
                              {panel.sublabel && (
                                <span className="block text-[10px] text-gray-600 font-mono truncate">
                                  {panel.sublabel}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>

            {/* Panel activo */}
            <div className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5">
              {error && (
                <div className="mb-4 text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {panelId === "env" && unknownEnvCount > 0 && (
                <div className="mb-4 text-xs text-gray-500">
                  {unknownEnvCount} variable(s) no tienen control en el formulario guiado de
                  Valheim.
                </div>
              )}
              {renderPanel()}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800 shrink-0">
          {showRestartPrompt ? (
            <>
              <span className="text-sm text-gray-300 mr-auto">
                ¿Reiniciar el servidor para aplicar los cambios?
              </span>
              <button
                onClick={handleRestartDecline}
                disabled={restarting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                No
              </button>
              <button
                onClick={handleRestartConfirm}
                disabled={restarting}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
              >
                {restarting ? "Reiniciando..." : "Sí"}
              </button>
            </>
          ) : (
            <>
              {dirtyPaths.length > 0 && (
                <span className="text-xs text-amber-400 mr-auto">
                  {dirtyPaths.length} fichero(s) con cambios sin guardar
                </span>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
