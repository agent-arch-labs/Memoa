import { useState, useEffect, useCallback, useRef } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useAppStore } from "@/stores/appStore";
import type { FileEntry } from "@/types";

export function FilesPanel() {
  const commands = useTauriCommands();
  const vaultPath = useAppStore((s) => s.vaultPath);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setSplitNote = useAppStore((s) => s.setSplitNote);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingName, setCreatingName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [createTarget, setCreateTarget] = useState("");
  const [createError, setCreateError] = useState("");

  const [renamingPath, setRenamingPath] = useState("");
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");

  const [contextMenu, setContextMenu] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null);

  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const dragCounter = useRef(0);

  const loadFiles = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const entries = await commands.listVault(vaultPath);
      setFiles(entries);
      const allPaths = new Set<string>();
      function collectDirs(entries: FileEntry[]) {
        for (const e of entries) {
          if (e.is_dir) {
            allPaths.add(e.path);
            if (e.children) collectDirs(e.children);
          }
        }
      }
      collectDirs(entries);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const p of allPaths) {
          if (!next.has(p)) next.add(p);
        }
        return next;
      });
    } catch (e) {
      console.error("加载文件列表失败", e);
    }
  }, [vaultPath, commands]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    function closeMenu() {
      setContextMenu(null);
      setBlankContextMenu(null);
    }
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  function isDescendant(parentPath: string, maybeChild: string): boolean {
    return maybeChild.startsWith(parentPath + "/") || maybeChild.startsWith(parentPath + "\\");
  }

  function handleDragStart(e: React.DragEvent, entry: FileEntry) {
    e.dataTransfer.setData("text/plain", entry.path);
    e.dataTransfer.effectAllowed = "move";
    setDragSource(entry.path);
  }

  function handleDragEnd() {
    setDragSource(null);
    setDragOverPath(null);
    setDragOverRoot(false);
  }

  function handleDragEnterDir(e: React.DragEvent, dirPath: string) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragSource && !isDescendant(dirPath, dragSource) && dragSource !== dirPath) {
      setDragOverPath(dirPath);
    }
  }

  function handleDragLeaveDir(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOverPath(null);
    }
  }

  function handleDragOverDir(e: React.DragEvent, dirPath: string) {
    e.preventDefault();
    e.stopPropagation();
    if (dragSource && !isDescendant(dirPath, dragSource) && dragSource !== dirPath) {
      e.dataTransfer.dropEffect = "move";
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  }

  async function handleDropOnDir(e: React.DragEvent, targetDir: string) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOverPath(null);
    setDragSource(null);

    if (!dragSource) return;
    if (isDescendant(targetDir, dragSource) || dragSource === targetDir) return;

    const fileName = dragSource.split("/").pop() || "";
    const newPath = `${targetDir}/${fileName}`;
    try {
      await commands.renameNote(dragSource, newPath);
      await loadFiles();
      incrementGraphRefresh();
    } catch (err) {
      console.error("移动失败:", err);
    }
  }

  function handleDragEnterRoot(e: React.DragEvent) {
    e.preventDefault();
    if (dragSource) {
      setDragOverRoot(true);
    }
  }

  function handleDragLeaveRoot(e: React.DragEvent) {
    e.preventDefault();
    setDragOverRoot(false);
  }

  function handleDragOverRoot(e: React.DragEvent) {
    e.preventDefault();
    if (dragSource) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  async function handleDropOnRoot(e: React.DragEvent) {
    e.preventDefault();
    setDragOverRoot(false);
    setDragSource(null);

    if (!vaultPath || !dragSource) return;

    const fileName = dragSource.split("/").pop() || "";
    const newPath = `${vaultPath}/${fileName}`;
    try {
      await commands.renameNote(dragSource, newPath);
      await loadFiles();
      incrementGraphRefresh();
    } catch (err) {
      console.error("移动失败:", err);
    }
  }

  async function handleClick(file: FileEntry) {
    setDataSource("local");
    if (file.is_dir) {
      setContextTarget({
        type: "folder",
        label: file.name,
        path: file.path,
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(file.path)) {
          next.delete(file.path);
        } else {
          next.add(file.path);
        }
        return next;
      });
    } else {
      try {
        const content = await commands.readFile(file.path);
        setCurrentNote(file.path, content);
        setContextTarget({
          type: "file",
          label: file.name,
          path: file.path,
        });
      } catch (e) {
        console.error("读取文件失败", e);
      }
    }
  }

  function handleContextMenu(e: React.MouseEvent, entry: FileEntry) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ entry, x: e.clientX - 10, y: e.clientY - 10 });
  }

  async function handleCreate(e?: React.KeyboardEvent) {
    if (e && e.key === "Escape") {
      setIsCreating(false);
      setCreatingName("");
      setCreateError("");
      return;
    }
    if (e && e.key !== "Enter") return;
    if (!vaultPath || !creatingName.trim()) {
      setIsCreating(false);
      setCreatingName("");
      setCreateError("");
      return;
    }
    setCreateError("");
    try {
      const basePath = createTarget || "";
      const relativePath = basePath ? `${basePath}/${creatingName}` : creatingName;
      if (createType === "folder") {
        await commands.createFolder(vaultPath, relativePath);
      } else {
        const name = relativePath;
        await commands.createNote(vaultPath, name);
      }
      setIsCreating(false);
      setCreatingName("");
      setCreateTarget("");
      await loadFiles();
      incrementGraphRefresh();
    } catch (err) {
      setCreateError(String(err));
    }
  }

  function startCreate(type: "file" | "folder", parentPath: string) {
    setCreateType(type);
    setCreateTarget(parentPath);
    setCreatingName("");
    setCreateError("");
    setIsCreating(true);
    setRenamingPath("");
  }

  function startRename(entry: FileEntry) {
    setRenamingPath(entry.path);
    setRenameName(entry.name);
    setRenameError("");
    setIsCreating(false);
  }

  async function commitRename() {
    if (!renameName.trim() || !renamingPath) {
      setRenamingPath("");
      return;
    }
    setRenameError("");
    try {
      const parentDir = renamingPath.substring(0, renamingPath.lastIndexOf("/"));
      const newPath = parentDir ? `${parentDir}/${renameName}` : renameName;
      await commands.renameNote(renamingPath, newPath);
      setRenamingPath("");
      setRenameName("");
      await loadFiles();
      incrementGraphRefresh();
    } catch (err) {
      setRenameError(String(err));
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") {
      setRenamingPath("");
      setRenameName("");
      setRenameError("");
    }
  }

  async function handleDelete(entry: FileEntry) {
    const label = entry.is_dir ? `文件夹 "${entry.name}"` : `文件 "${entry.name}"`;
    if (!confirm(`确定删除${label}？\n${entry.is_dir ? "（仅当文件夹为空时可删除）" : "（将移到回收站）"}`)) return;
    try {
      await commands.deleteNote(entry.path, false);
      await loadFiles();
      incrementGraphRefresh();
      incrementTagRefresh();
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  }

  function renderTree(entries: FileEntry[], depth: number = 0) {
    return entries.map((file) => {
      const isRenaming = renamingPath === file.path;
      const isActive = currentNotePath === file.path;
      const isDragOver = dragOverPath === file.path;

      return (
        <div key={file.path}>
          {isRenaming ? (
            <div className="flex items-center gap-1 px-1 py-0.5" style={{ paddingLeft: `${12 + depth * 12}px` }}>
              <input
                className="input text-xs flex-1 min-w-0"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={commitRename}
                autoFocus
              />
              {renameError && <p className="text-xs text-red-400 shrink-0">!</p>}
            </div>
          ) : (
            <button
              className={`sidebar-item w-full text-left ${isActive ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : ""} ${isDragOver ? "bg-[var(--color-accent)]/20 ring-1 ring-[var(--color-accent)]/50" : ""}`}
              style={{ paddingLeft: `${12 + depth * 12}px` }}
              onClick={() => handleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
              draggable
              onDragStart={(e) => handleDragStart(e, file)}
              onDragEnd={handleDragEnd}
              onDragEnter={file.is_dir ? (e) => handleDragEnterDir(e, file.path) : undefined}
              onDragLeave={file.is_dir ? handleDragLeaveDir : undefined}
              onDragOver={file.is_dir ? (e) => handleDragOverDir(e, file.path) : undefined}
              onDrop={file.is_dir ? (e) => handleDropOnDir(e, file.path) : undefined}
            >
              <span className="shrink-0 text-xs">
                {file.is_dir ? (expanded.has(file.path) ? "▾" : "▸") : "📄"}
              </span>
              <span className="truncate text-xs">{file.name}</span>
            </button>
          )}
          {file.is_dir && expanded.has(file.path) && file.children && (
            <div>{renderTree(file.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">文件浏览器</span>
        <div className="flex items-center gap-1">
          <button
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            onClick={() => startCreate("file", "")}
            title="新建笔记"
          >
            📝
          </button>
          <button
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            onClick={() => startCreate("folder", "")}
            title="新建文件夹"
          >
            📁
          </button>
        </div>
      </div>

      {isCreating && (
        <div className="px-3 py-2 border-b border-[var(--color-border)]">
          <div className="text-[10px] text-[var(--color-text-muted)] mb-1">
            {createType === "folder" ? "新建文件夹" : "新建笔记"}
            {createTarget ? `（在 ${createTarget} 内）` : ""}
          </div>
          <div className="flex items-center gap-1">
            <input
              className="input text-xs flex-1"
              placeholder={createType === "folder" ? "文件夹名" : "笔记名"}
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              onKeyDown={handleCreate}
              autoFocus
            />
            <button
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] shrink-0"
              onClick={() => {
                setIsCreating(false);
                setCreatingName("");
                setCreateError("");
              }}
            >
              ✕
            </button>
          </div>
          {createError && <p className="text-xs text-red-400 mt-1">{createError}</p>}
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto py-1 ${dragOverRoot ? "bg-[var(--color-accent)]/10 ring-2 ring-[var(--color-accent)]/30 ring-inset" : ""}`}
        onDragEnter={handleDragEnterRoot}
        onDragLeave={handleDragLeaveRoot}
        onDragOver={handleDragOverRoot}
        onDrop={handleDropOnRoot}
        onContextMenu={(e) => {
          e.preventDefault();
          setBlankContextMenu({ x: e.clientX - 10, y: e.clientY - 10 });
        }}
      >
        {files.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            空知识库
            <br />
            点击 📝 创建第一篇笔记
          </div>
        ) : (
          renderTree(files)
        )}
      </div>

      {contextMenu && contextMenu.entry.is_dir && (
        <div
          className="absolute z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              startCreate("file", contextMenu.entry.path);
            }}
          >
            📝 新建笔记
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              startCreate("folder", contextMenu.entry.path);
            }}
          >
            📁 新建文件夹
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              startRename(contextMenu.entry);
            }}
          >
            ✏️ 重命名
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/10 text-red-400 flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              handleDelete(contextMenu.entry);
            }}
          >
            🗑️ 删除
          </button>
        </div>
      )}

      {contextMenu && !contextMenu.entry.is_dir && (
        <div
          className="absolute z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={async () => {
              setContextMenu(null);
              const entry = contextMenu.entry;
              const fullPath = entry.path.startsWith("/") || !vaultPath
                ? entry.path
                : `${vaultPath}/${entry.path}`;
              const content = await commands.readFile(fullPath);
              setCurrentNote(fullPath, content);
              setDataSource("local");
              setContextTarget({ type: "file", label: entry.name, path: fullPath });
            }}
          >
            📄 打开
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={async () => {
              setContextMenu(null);
              const entry = contextMenu.entry;
              const fullPath = entry.path.startsWith("/") || !vaultPath
                ? entry.path
                : `${vaultPath}/${entry.path}`;
              const content = await commands.readFile(fullPath);
              setSplitNote(fullPath, content);
            }}
          >
            📑 右侧分屏打开
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={async () => {
              setContextMenu(null);
              const entry = contextMenu.entry;
              const fullPath = entry.path.startsWith("/") || !vaultPath
                ? entry.path
                : `${vaultPath}/${entry.path}`;
              await commands.openWithDefaultApp(fullPath);
            }}
          >
            🔗 默认应用打开
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              startRename(contextMenu.entry);
            }}
          >
            ✏️ 重命名
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-500/10 text-red-400 flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              handleDelete(contextMenu.entry);
            }}
          >
            🗑️ 删除
          </button>
        </div>
      )}

      {blankContextMenu && (
        <div
          className="absolute z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: blankContextMenu.x, top: blankContextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={() => {
              setBlankContextMenu(null);
              startCreate("file", "");
            }}
          >
            📝 新建笔记
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
            onClick={() => {
              setBlankContextMenu(null);
              startCreate("folder", "");
            }}
          >
            📁 新建文件夹
          </button>
        </div>
      )}
    </div>
  );
}