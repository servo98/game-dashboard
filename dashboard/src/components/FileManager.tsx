import { useCallback, useEffect, useRef, useState } from "react";
import { api, type FileEntry, uploadFileWithProgress } from "../api";
import { formatSize } from "../utils/format";
import { DownloadIcon, FolderIcon, TrashIcon } from "./Icons";

type Props = {
  serverId: string;
  serverName: string;
  onClose: () => void;
};

type UploadItem = {
  id: string;
  file: File;
  /** Path relative to the drop target, preserving folder structure (e.g. "mods/config/x.json") */
  relativePath: string;
  progress: number; // 0-100
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  /** How many times this file has been attempted (for auto-retry) */
  attempts: number;
  abort?: () => void;
};

// How many files to upload at once. Bulk folder uploads (Foundry modules can be
// thousands of small files) would crawl one-at-a-time, so we run a small pool.
const MAX_CONCURRENT_UPLOADS = 4;
// Auto-retry transient failures (network blips) before giving up on a file.
const MAX_UPLOAD_ATTEMPTS = 3;
// Errors that are deterministic — retrying won't help, so fail fast.
const NON_RETRYABLE = /exceeds|Invalid file name|Invalid path|Expected multipart|No volumes|413/i;

type DroppedFile = { file: File; relativePath: string };

// Read a single file from a FileSystemFileEntry
function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// readEntries() returns at most 100 entries per call — must keep calling until it returns empty
function readAllDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

// Recursively collect every file under an entry, building its relative path
async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: DroppedFile[],
): Promise<void> {
  if (entry.isFile) {
    const file = await readEntryFile(entry as FileSystemFileEntry);
    out.push({ file, relativePath: prefix + entry.name });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllDirEntries(reader);
    for (const child of children) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

// Collect dropped files, descending into folders. Entries must be captured
// synchronously from the drop event before any await (the list is invalidated after).
async function collectFromEntries(entries: (FileSystemEntry | null)[]): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  for (const entry of entries) {
    if (entry) await walkEntry(entry, "", out);
  }
  return out;
}

const FILE_ICONS: Record<string, string> = {
  dir: "\u{1F4C1}",
  ".tar": "\u{1F4E6}",
  ".tar.gz": "\u{1F4E6}",
  ".tar.zst": "\u{1F4E6}",
  ".zip": "\u{1F4E6}",
  ".gz": "\u{1F4E6}",
  ".rar": "\u{1F4E6}",
  ".7z": "\u{1F4E6}",
  ".jar": "\u2615",
  ".json": "\u{1F4CB}",
  ".yml": "\u{1F4CB}",
  ".yaml": "\u{1F4CB}",
  ".toml": "\u{1F4CB}",
  ".properties": "\u{1F4CB}",
  ".cfg": "\u{1F4CB}",
  ".conf": "\u{1F4CB}",
  ".ini": "\u{1F4CB}",
  ".txt": "\u{1F4C4}",
  ".log": "\u{1F4DC}",
  ".md": "\u{1F4C4}",
  ".png": "\u{1F5BC}",
  ".jpg": "\u{1F5BC}",
  ".jpeg": "\u{1F5BC}",
  ".gif": "\u{1F5BC}",
  ".webp": "\u{1F5BC}",
  ".svg": "\u{1F5BC}",
  ".dat": "\u{1F4BE}",
  ".db": "\u{1F4BE}",
  ".sqlite": "\u{1F4BE}",
  ".nbt": "\u{1F4BE}",
  ".mca": "\u{1F4BE}",
  ".sh": "\u{1F4DC}",
  ".bat": "\u{1F4DC}",
  ".js": "\u{1F4DC}",
  ".ts": "\u{1F4DC}",
  ".py": "\u{1F4DC}",
};

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return FILE_ICONS.dir;
  const lower = name.toLowerCase();
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

let uploadIdCounter = 0;

export default function FileManager({ serverId, serverName, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const dragCounterRef = useRef(0);

  // Upload queue
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const processingRef = useRef(false);
  // IDs currently claimed by a worker — prevents two workers grabbing the same file
  const claimedRef = useRef<Set<string>>(new Set());
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const fetchEntries = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const list = await api.listFiles(serverId, path);
        setEntries(list);
      } catch (err) {
        const msg = (err as Error).message;
        setError(
          msg === "No volumes configured"
            ? "Este servidor no tiene volumenes de datos configurados. Agrega un volume en la config para poder navegar archivos."
            : msg,
        );
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

  // Upload a single file, retrying transient failures up to MAX_UPLOAD_ATTEMPTS.
  const uploadOne = useCallback(
    async (item: UploadItem) => {
      const uploadPath = currentPathRef.current;

      for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
        try {
          const { promise, abort } = uploadFileWithProgress(
            serverId,
            uploadPath,
            item.file,
            item.relativePath,
            (loaded, total) => {
              const pct = Math.round((loaded / total) * 100);
              setUploads((prev) =>
                prev.map((u) => (u.id === item.id ? { ...u, progress: pct } : u)),
              );
            },
          );

          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? { ...u, abort, status: "uploading" as const, attempts: attempt }
                : u,
            ),
          );

          await promise;

          setUploads((prev) =>
            prev.map((u) =>
              u.id === item.id
                ? { ...u, status: "done" as const, progress: 100, error: undefined }
                : u,
            ),
          );
          return;
        } catch (err) {
          const msg = (err as Error).message;
          // User cancelled — the item is being removed by dismissUpload, just stop.
          if (msg === "Upload cancelled") return;

          // Give up on deterministic errors or after the last attempt.
          if (NON_RETRYABLE.test(msg) || attempt === MAX_UPLOAD_ATTEMPTS) {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === item.id
                  ? { ...u, status: "error" as const, error: msg, attempts: attempt }
                  : u,
              ),
            );
            return;
          }

          // Transient failure — back off, then retry.
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    },
    [serverId],
  );

  // Process the upload queue with a small pool of concurrent workers.
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    const worker = async () => {
      while (true) {
        const next = uploadsRef.current.find(
          (u) => u.status === "pending" && !claimedRef.current.has(u.id),
        );
        if (!next) break;
        claimedRef.current.add(next.id); // synchronous claim — no two workers grab the same file
        setUploads((prev) =>
          prev.map((u) => (u.id === next.id ? { ...u, status: "uploading" as const } : u)),
        );
        await uploadOne(next);
        claimedRef.current.delete(next.id);
      }
    };

    await Promise.all(Array.from({ length: MAX_CONCURRENT_UPLOADS }, () => worker()));

    processingRef.current = false;
    // Refresh file list after all uploads settle
    fetchEntries(currentPathRef.current);
  }, [uploadOne, fetchEntries]);

  function enqueueFiles(files: DroppedFile[]) {
    if (files.length === 0) return;

    const newItems: UploadItem[] = files.map(({ file, relativePath }) => ({
      id: `upload-${++uploadIdCounter}`,
      file,
      relativePath,
      progress: 0,
      status: "pending" as const,
      attempts: 0,
    }));

    setUploads((prev) => [...prev, ...newItems]);
    // Start processing after state update
    setTimeout(() => processQueue(), 0);
  }

  // Re-queue only the files that failed, leaving successful ones untouched.
  function retryFailed() {
    setUploads((prev) =>
      prev.map((u) =>
        u.status === "error"
          ? { ...u, status: "pending" as const, progress: 0, error: undefined, attempts: 0 }
          : u,
      ),
    );
    setTimeout(() => processQueue(), 0);
  }

  function dismissUpload(id: string) {
    setUploads((prev) => {
      const item = prev.find((u) => u.id === id);
      if (item?.status === "uploading" && item.abort) {
        item.abort();
      }
      return prev.filter((u) => u.id !== id);
    });
  }

  function clearFinished() {
    setUploads((prev) => prev.filter((u) => u.status !== "done" && u.status !== "error"));
  }

  // Drag handlers for the entire file list area
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragOver(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragOver(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragOver(false);

    const dt = e.dataTransfer;
    // Capture entries synchronously — dataTransfer.items is cleared after the event handler returns
    const entries: (FileSystemEntry | null)[] = [];
    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i];
        if (it.kind === "file" && typeof it.webkitGetAsEntry === "function") {
          entries.push(it.webkitGetAsEntry());
        }
      }
    }

    if (entries.some(Boolean)) {
      // Folder-aware path: descend into any dropped directories
      collectFromEntries(entries).then((dropped) => {
        if (dropped.length > 0) enqueueFiles(dropped);
      });
    } else if (dt.files.length > 0) {
      // Fallback for browsers without the entries API
      enqueueFiles(Array.from(dt.files).map((file) => ({ file, relativePath: file.name })));
    }
  }

  function handleDeleteClick(name: string) {
    if (confirmDelete === name) {
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
  const hasActiveUploads = uploads.length > 0;
  const totalUploads = uploads.length;
  const uploadingCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending",
  ).length;
  const doneCount = uploads.filter((u) => u.status === "done").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;
  const hasFinished = uploads.some((u) => u.status === "done" || u.status === "error");
  // Render only the actionable rows (in-flight + failed). Pending/done are summarized
  // as counts so a 1700-file folder upload doesn't render thousands of DOM rows.
  const visibleUploads = uploads.filter((u) => u.status === "uploading" || u.status === "error");

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
              className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors"
            >
              Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  enqueueFiles(
                    Array.from(e.target.files).map((file) => ({ file, relativePath: file.name })),
                  );
                }
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
              {i > 0 && <span className="text-gray-600">/</span>}
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

        {/* File list — entire area is a drop zone */}
        <div
          className="flex-1 overflow-y-auto min-h-0 relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drop overlay */}
          {dragOver && (
            <div className="absolute inset-0 bg-brand-500/10 border-2 border-dashed border-brand-500 rounded-lg z-10 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-3xl mb-2">&#x1F4E4;</div>
                <p className="text-brand-400 font-medium text-sm">
                  Drop files or folders to upload
                </p>
                <p className="text-brand-400/60 text-xs mt-1">
                  to {currentPath === "/" ? "root" : currentPath}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center text-gray-600 py-16 text-sm">
              <p>{currentPath === "/" ? "No files found" : "Empty directory"}</p>
              <p className="mt-2 text-gray-700">Drag & drop files here to upload</p>
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

        {/* Upload queue panel */}
        {hasActiveUploads && (
          <div className="border-t border-gray-800 bg-gray-950">
            <div className="flex items-center justify-between px-4 py-2 gap-3">
              <span className="text-xs text-gray-400 flex items-center gap-2 min-w-0">
                <span className="truncate">
                  {uploadingCount > 0
                    ? `Subiendo ${doneCount}/${totalUploads}...`
                    : errorCount > 0
                      ? "Subida finalizada con errores"
                      : "Subida completa"}
                </span>
                {doneCount > 0 && <span className="text-green-400 shrink-0">✓ {doneCount}</span>}
                {errorCount > 0 && <span className="text-red-400 shrink-0">✗ {errorCount}</span>}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {errorCount > 0 && uploadingCount === 0 && (
                  <button
                    onClick={retryFailed}
                    className="text-[11px] px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    Reintentar fallidos ({errorCount})
                  </button>
                )}
                {hasFinished && (
                  <button
                    onClick={clearFinished}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>
            {visibleUploads.length > 0 && (
              <div className="max-h-40 overflow-y-auto px-4 pb-3 flex flex-col gap-1.5">
                {visibleUploads.map((item) => (
                  <UploadRow key={item.id} item={item} onDismiss={() => dismissUpload(item.id)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Drop hint footer — only when no uploads showing */}
        {!hasActiveUploads && (
          <div className="border-t border-gray-800 px-5 py-2.5 text-center text-xs text-gray-600">
            Drag & drop files anywhere to upload
          </div>
        )}
      </div>
    </div>
  );
}

function UploadRow({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const isDone = item.status === "done";
  const isError = item.status === "error";
  const isActive = item.status === "uploading";
  const isPending = item.status === "pending";

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all ${
        isDone ? "bg-green-950/20" : isError ? "bg-red-950/20" : "bg-gray-900"
      }`}
    >
      {/* Icon/status */}
      <div className="shrink-0 w-4 flex items-center justify-center">
        {isPending && <span className="text-gray-500">&#x23F3;</span>}
        {isActive && (
          <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        )}
        {isDone && <span className="text-green-400">&#x2713;</span>}
        {isError && <span className="text-red-400">&#x2717;</span>}
      </div>

      {/* File info + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-gray-300 truncate" title={item.relativePath}>
            {item.relativePath}
          </span>
          <span className="text-gray-500 shrink-0">{formatSize(item.file.size)}</span>
        </div>
        {(isActive || isPending) && (
          <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
        {isError && item.error && (
          <p className="text-red-400 mt-0.5 truncate" title={item.error}>
            {item.error}
            {item.attempts > 1 ? ` (tras ${item.attempts} intentos)` : ""}
          </p>
        )}
      </div>

      {/* Percentage / dismiss */}
      <div className="shrink-0 w-12 text-right">
        {isActive && <span className="text-gray-400">{item.progress}%</span>}
        {(isDone || isError) && (
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            &#x2715;
          </button>
        )}
        {isPending && <span className="text-gray-600">Queue</span>}
      </div>
    </div>
  );
}
