import { useCallback, useEffect, useRef, useState } from "react";
import { api, type FileEntry } from "../api";
import { formatSize } from "../utils/format";
import { DownloadIcon, FolderIcon, TrashIcon } from "./Icons";

type Props = {
  serverId: string;
  serverName: string;
  onClose: () => void;
};

const FILE_ICONS: Record<string, string> = {
  // Folders
  dir: "\u{1F4C1}",
  // Archives
  ".tar": "\u{1F4E6}",
  ".tar.gz": "\u{1F4E6}",
  ".tar.zst": "\u{1F4E6}",
  ".zip": "\u{1F4E6}",
  ".gz": "\u{1F4E6}",
  ".rar": "\u{1F4E6}",
  ".7z": "\u{1F4E6}",
  // Java
  ".jar": "\u2615",
  // Config
  ".json": "\u{1F4CB}",
  ".yml": "\u{1F4CB}",
  ".yaml": "\u{1F4CB}",
  ".toml": "\u{1F4CB}",
  ".properties": "\u{1F4CB}",
  ".cfg": "\u{1F4CB}",
  ".conf": "\u{1F4CB}",
  ".ini": "\u{1F4CB}",
  // Text / logs
  ".txt": "\u{1F4C4}",
  ".log": "\u{1F4DC}",
  ".md": "\u{1F4C4}",
  // Images
  ".png": "\u{1F5BC}",
  ".jpg": "\u{1F5BC}",
  ".jpeg": "\u{1F5BC}",
  ".gif": "\u{1F5BC}",
  ".webp": "\u{1F5BC}",
  ".svg": "\u{1F5BC}",
  // Data
  ".dat": "\u{1F4BE}",
  ".db": "\u{1F4BE}",
  ".sqlite": "\u{1F4BE}",
  ".nbt": "\u{1F4BE}",
  ".mca": "\u{1F4BE}",
  // Scripts
  ".sh": "\u{1F4DC}",
  ".bat": "\u{1F4DC}",
  ".js": "\u{1F4DC}",
  ".ts": "\u{1F4DC}",
  ".py": "\u{1F4DC}",
};

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return FILE_ICONS.dir;
  const lower = name.toLowerCase();
  // Check compound extensions first
  for (const ext of [".tar.gz", ".tar.zst"]) {
    if (lower.endsWith(ext)) return FILE_ICONS[ext];
  }
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = lower.slice(dotIdx);
    if (FILE_ICONS[ext]) return FILE_ICONS[ext];
  }
  return "\u{1F4C4}";
}

function formatDate(ts: number): string {
  if (ts === 0) return "";
  return new Date(ts * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FileManager({ serverId, serverName, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchEntries = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.listFiles(serverId, path);
        setEntries(list);
      } catch (err) {
        setError((err as Error).message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [serverId],
  );

  useEffect(() => {
    fetchEntries(currentPath);
  }, [currentPath, fetchEntries]);

  function navigate(name: string) {
    const next = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    setCurrentPath(next);
  }

  function navigateUp() {
    if (currentPath === "/") return;
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length === 0 ? "/" : `/${parts.join("/")}`);
  }

  function navigateToBreadcrumb(index: number) {
    if (index === -1) {
      setCurrentPath("/");
      return;
    }
    const parts = currentPath.split("/").filter(Boolean);
    setCurrentPath(`/${parts.slice(0, index + 1).join("/")}`);
  }

  async function handleUpload(files: FileList | File[]) {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadFiles(serverId, currentPath, Array.from(files));
      await fetchEntries(currentPath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  function handleDeleteClick(name: string) {
    if (confirmDelete === name) {
      // Confirmed — do the delete
      const filePath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      api
        .deleteFile(serverId, filePath)
        .then(() => fetchEntries(currentPath))
        .catch((err) => setError((err as Error).message));
      setConfirmDelete(null);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    } else {
      setConfirmDelete(name);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = setTimeout(() => setConfirmDelete(null), 3000);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const dirPath =
      currentPath === "/" ? `/${newFolderName.trim()}` : `${currentPath}/${newFolderName.trim()}`;
    setError(null);
    try {
      await api.createDirectory(serverId, dirPath);
      setShowNewFolder(false);
      setNewFolderName("");
      await fetchEntries(currentPath);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <FolderIcon className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-white">{serverName} — Files</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewFolder(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            >
              New Folder
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white transition-colors"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUpload(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors ml-2 text-xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-gray-800 text-sm overflow-x-auto">
          <button
            onClick={() => navigateToBreadcrumb(-1)}
            className="text-brand-400 hover:text-brand-300 shrink-0"
          >
            /
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <span className="text-gray-600">/</span>
              <button
                onClick={() => navigateToBreadcrumb(i)}
                className={`hover:text-brand-300 transition-colors ${
                  i === pathParts.length - 1 ? "text-white" : "text-brand-400"
                }`}
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* New folder input */}
        {showNewFolder && (
          <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-800">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }
              }}
              placeholder="Folder name"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-brand-500"
            />
            <button
              onClick={handleCreateFolder}
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewFolder(false);
                setNewFolderName("");
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center text-gray-600 py-16 text-sm">
              {currentPath === "/" ? "No files found" : "Empty directory"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left px-5 py-2 font-medium">Name</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Size</th>
                  <th className="text-right px-3 py-2 font-medium w-40 hidden sm:table-cell">
                    Modified
                  </th>
                  <th className="text-right px-5 py-2 font-medium w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Go up row */}
                {currentPath !== "/" && (
                  <tr
                    onClick={navigateUp}
                    className="hover:bg-gray-800/50 cursor-pointer border-b border-gray-800/50"
                  >
                    <td className="px-5 py-2 text-gray-400" colSpan={4}>
                      <span className="mr-2">..</span>
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr
                    key={entry.name}
                    className="hover:bg-gray-800/50 border-b border-gray-800/50 group"
                  >
                    <td className="px-5 py-2">
                      {entry.isDirectory ? (
                        <button
                          onClick={() => navigate(entry.name)}
                          className="flex items-center gap-2 text-white hover:text-brand-400 transition-colors"
                        >
                          <span>{getFileIcon(entry.name, true)}</span>
                          <span>{entry.name}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 text-gray-300">
                          <span>{getFileIcon(entry.name, false)}</span>
                          <span>{entry.name}</span>
                        </span>
                      )}
                    </td>
                    <td className="text-right px-3 py-2 text-gray-500 text-xs">
                      {entry.isDirectory ? "" : formatSize(entry.size)}
                    </td>
                    <td className="text-right px-3 py-2 text-gray-500 text-xs hidden sm:table-cell">
                      {formatDate(entry.modifiedAt)}
                    </td>
                    <td className="text-right px-5 py-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!entry.isDirectory && (
                          <a
                            href={api.downloadFileUrl(
                              serverId,
                              currentPath === "/"
                                ? `/${entry.name}`
                                : `${currentPath}/${entry.name}`,
                            )}
                            className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors inline-flex"
                            title="Download"
                          >
                            <DownloadIcon className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteClick(entry.name)}
                          className={`p-1 rounded transition-colors inline-flex ${
                            confirmDelete === entry.name
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400"
                          }`}
                          title={confirmDelete === entry.name ? "Click again to confirm" : "Delete"}
                        >
                          {confirmDelete === entry.name ? (
                            <span className="text-xs px-1">Confirm?</span>
                          ) : (
                            <TrashIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Drop zone footer */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-t px-5 py-3 text-center text-xs transition-colors ${
            dragOver
              ? "border-brand-500 bg-brand-500/10 text-brand-400"
              : "border-gray-800 text-gray-600"
          }`}
        >
          {uploading ? "Uploading..." : "Drag & drop files here to upload"}
        </div>
      </div>
    </div>
  );
}
