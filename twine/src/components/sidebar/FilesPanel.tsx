import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useAppStore } from "@/stores/appStore";
import { IconFile, IconEdit, IconClose } from "@/components/common/Icons";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuEntry } from "@/components/ui/ContextMenu";
import type { FileEntry } from "@/types";

export function FilesPanel() {
  const commands = useTauriCommands();
  const vaultPath = useAppStore((s) => s.vaultPath);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const showEditor = useAppStore((s) => s.showEditor);
  const setSplitNote = useAppStore((s) => s.setSplitNote);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const saveCurrentNote = useAppStore((s) => s.saveCurrentNote);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingName, setCreatingName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createType, setCreateType] = useState<"file" | "folder">("file");
  const [createTarget, setCreateTarget] = useState("");
  const [createError, setCreateError] = useState("");

  const [contextMenu, setContextMenu] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null);

  const fileContextMenuItems = useMemo<MenuEntry[]>(() => {
    if (!contextMenu) return [];
    const entry = contextMenu.entry;
    const fullPath = entry.path.startsWith("/") || !vaultPath
      ? entry.path
      : `${vaultPath}/${entry.path}`;

    if (entry.is_dir) {
      return [
        {
          key: "newFile",
          label: "新建笔记",
          icon: (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4zm-.5 1.5L12.5 5.5H9.5V2.5zM3 14V2h5v4h4v8H3z" />
            </svg>
          ),
          onClick: () => { startCreate("file", entry.path); },
        },
        {
          key: "newFolder",
          label: "新建文件夹",
          icon: (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5.5A1.5 1.5 0 0014.5 4H7.707l-1.854-1.854A.5.5 0 005.5 2H1.5zM1 3.5a.5.5 0 01.5-.5h3.793l1 1H1V3.5zm0 1.5h14v7.5a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5V5z" />
            </svg>
          ),
          onClick: () => { startCreate("folder", entry.path); },
        },
        { key: "sep1", type: "separator" as const },
        {
          key: "rename",
          label: "重命名",
          icon: (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.75.75 0 00-1.06 0L2.854 11a.25.25 0 00-.064.108l-.647 2.266 2.266-.647a.25.25 0 00.108-.064l8.51-8.51a.75.75 0 000-1.06l-1.086-1.086z" />
            </svg>
          ),
          onClick: () => { startRename(entry); },
        },
        {
          key: "delete",
          label: "删除",
          icon: (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--color-error, #ef4444)" }}>
              <path d="M6.5 1h3l1 1H13v1H3V2h2.5l1-1zM4 5h8l-.5 9H4.5L4 5zm1.5 1.5l.3 6h1l-.3-6h-1zm2.5 0v6h1v-6H8zm2.5 0l-.3 6h1l.3-6h-1z" />
            </svg>
          ),
          onClick: () => { handleDelete(entry); },
        },
      ];
    }

    return [
      {
        key: "open",
        label: "打开",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3 1a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4H3zm5.5 1.5L12.5 5.5H8.5V2.5zM3 14V2h4.5v4h4v8H3z" />
          </svg>
        ),
        onClick: async () => {
          const content = await commands.readFile(fullPath);
          await saveCurrentNote();
          setCurrentNote(fullPath, content);
          showEditor();
          setDataSource("local");
          setContextTarget({ type: "file", label: entry.name, path: fullPath });
        },
      },
      {
        key: "splitOpen",
        label: "右侧分屏打开",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H2a1 1 0 01-1-1V2zm7 0v12h6V2H8zM2 2v12h5V2H2z" />
          </svg>
        ),
        onClick: async () => {
          const content = await commands.readFile(fullPath);
          setSplitNote(fullPath, content);
        },
      },
      {
        key: "openWith",
        label: "默认应用打开",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.427 1.527a.5.5 0 01.819-.385l5.5 4.5a.5.5 0 010 .77l-5.5 4.5a.5.5 0 01-.819-.385V7.03a7.002 7.002 0 00-5.5 5.47.5.5 0 01-.986-.165A8.002 8.002 0 016.427 6.03V1.527z" />
          </svg>
        ),
        onClick: async () => {
          await commands.openWithDefaultApp(fullPath);
        },
      },
      { key: "sep1", type: "separator" as const },
      {
        key: "rename",
        label: "重命名",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.75.75 0 00-1.06 0L2.854 11a.25.25 0 00-.064.108l-.647 2.266 2.266-.647a.25.25 0 00.108-.064l8.51-8.51a.75.75 0 000-1.06l-1.086-1.086z" />
          </svg>
        ),
        onClick: () => { startRename(entry); },
      },
      {
        key: "delete",
        label: "删除",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--color-error, #ef4444)" }}>
            <path d="M6.5 1h3l1 1H13v1H3V2h2.5l1-1zM4 5h8l-.5 9H4.5L4 5zm1.5 1.5l.3 6h1l-.3-6h-1zm2.5 0v6h1v-6H8zm2.5 0l-.3 6h1l.3-6h-1z" />
          </svg>
        ),
        onClick: () => { handleDelete(entry); },
      },
    ];
  }, [contextMenu, vaultPath]);

  const blankContextMenuItems = useMemo<MenuEntry[]>(() => [
    {
      key: "newFile",
      label: "新建笔记",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V5l-4-4zm-.5 1.5L12.5 5.5H9.5V2.5zM3 14V2h5v4h4v8H3z" />
        </svg>
      ),
      onClick: () => { startCreate("file", ""); },
    },
    {
      key: "newFolder",
      label: "新建文件夹",
      icon: (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5.5A1.5 1.5 0 0014.5 4H7.707l-1.854-1.854A.5.5 0 005.5 2H1.5zM1 3.5a.5.5 0 01.5-.5h3.793l1 1H1V3.5zm0 1.5h14v7.5a.5.5 0 01-.5.5h-13a.5.5 0 01-.5-.5V5z" />
        </svg>
      ),
      onClick: () => { startCreate("folder", ""); },
    },
  ], []);

  const [renamingPath, setRenamingPath] = useState("");
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState("");

  const [dragSource, setDragSource] = useState<string | null>(null);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const dragCounter = useRef(0);
  const fileListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentNotePath) return;
    const parents: string[] = [];
    let current = currentNotePath;
    while (true) {
      const parent = current.substring(0, current.lastIndexOf("/"));
      if (!parent || parent === vaultPath) break;
      parents.unshift(parent);
      current = parent;
    }
    if (parents.length > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const p of parents) {
          next.add(p);
        }
        return next;
      });
    }
  }, [currentNotePath, vaultPath]);

  useEffect(() => {
    if (!currentNotePath || !fileListRef.current) return;
    const el = fileListRef.current.querySelector(`[data-file-path="${CSS.escape(currentNotePath)}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentNotePath, files.length]);

  const loadFiles = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const entries = await commands.listVault(vaultPath);
      setFiles(entries);
      // 不再自动展开所有目录，保留用户已有的展开状态
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
      // 局部更新：先移除旧路径，再在目标目录添加
      setFiles((prev) => {
        const withoutOld = removeEntryFromTree(prev, dragSource);
        // 需要从旧树中找到被移动的条目
        const movedEntry = findEntry(prev, dragSource);
        if (movedEntry) {
          const renamed = { ...movedEntry, path: newPath, name: fileName.replace(/\.md$/, "") };
          if (renamed.is_dir && renamed.children) {
            renamed.children = updateChildPaths(renamed.children, dragSource, newPath);
          }
          return addEntryToTree(withoutOld, targetDir, renamed);
        }
        return withoutOld;
      });
      // 更新展开状态
      if (expanded.has(dragSource)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(dragSource);
          next.add(newPath);
          return next;
        });
      }
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
      // 局部更新
      setFiles((prev) => {
        const withoutOld = removeEntryFromTree(prev, dragSource);
        const movedEntry = findEntry(prev, dragSource);
        if (movedEntry) {
          const renamed = { ...movedEntry, path: newPath, name: fileName.replace(/\.md$/, "") };
          if (renamed.is_dir && renamed.children) {
            renamed.children = updateChildPaths(renamed.children, dragSource, newPath);
          }
          return addEntryToTree(withoutOld, "", renamed);
        }
        return withoutOld;
      });
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
        await saveCurrentNote();
        setCurrentNote(file.path, content);
        showEditor();
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
    setContextMenu({ entry, x: e.clientX, y: e.clientY });
  }

  async function handleCreate(e?: React.KeyboardEvent) {
    if (e?.nativeEvent.isComposing) return;
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
      // 局部更新：在树中添加新条目
      const fullPath = `${vaultPath}/${relativePath}`;
      const newEntry: FileEntry = {
        name: createType === "folder" ? creatingName : creatingName.replace(/\.md$/, ""),
        path: fullPath,
        is_dir: createType === "folder",
        children: createType === "folder" ? [] : null,
      };
      setFiles((prev) => addEntryToTree(prev, createTarget ? `${vaultPath}/${createTarget}` : "", newEntry));
      // 确保父目录展开
      if (createTarget) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(`${vaultPath}/${createTarget}`);
          return next;
        });
      }
      setIsCreating(false);
      setCreatingName("");
      setCreateTarget("");
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
      // 局部更新：重命名树中条目，保持展开状态
      setFiles((prev) => renameEntryInTree(prev, renamingPath, newPath, renameName));
      // 更新展开状态中的路径
      if (expanded.has(renamingPath)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(renamingPath);
          next.add(newPath);
          return next;
        });
      }
      setRenamingPath("");
      setRenameName("");
      incrementGraphRefresh();
    } catch (err) {
      setRenameError(String(err));
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") {
      setRenamingPath("");
      setRenameName("");
      setRenameError("");
    }
  }

  // 局部更新：从文件树中移除指定路径的条目
  function removeEntryFromTree(entries: FileEntry[], targetPath: string): FileEntry[] {
    return entries
      .filter((e) => e.path !== targetPath)
      .map((e) => {
        if (e.is_dir && e.children) {
          return { ...e, children: removeEntryFromTree(e.children, targetPath) };
        }
        return e;
      });
  }

  // 在文件树中查找指定路径的条目
  function findEntry(entries: FileEntry[], targetPath: string): FileEntry | null {
    for (const e of entries) {
      if (e.path === targetPath) return e;
      if (e.is_dir && e.children) {
        const found = findEntry(e.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  }

  // 局部更新：重命名文件树中的条目
  function renameEntryInTree(entries: FileEntry[], oldPath: string, newPath: string, newName: string): FileEntry[] {
    return entries.map((e) => {
      if (e.path === oldPath) {
        // 重命名自身，同时更新子路径前缀
        const updated = { ...e, name: newName, path: newPath };
        if (e.is_dir && e.children) {
          updated.children = updateChildPaths(e.children, oldPath, newPath);
        }
        return updated;
      }
      if (e.is_dir && e.children) {
        return { ...e, children: renameEntryInTree(e.children, oldPath, newPath, newName) };
      }
      return e;
    });
  }

  // 更新子路径前缀（重命名文件夹时子文件路径也需要更新）
  function updateChildPaths(entries: FileEntry[], oldParent: string, newParent: string): FileEntry[] {
    return entries.map((e) => {
      const newPath = newParent + e.path.slice(oldParent.length);
      const updated: FileEntry = { ...e, path: newPath };
      if (e.is_dir && e.children) {
        updated.children = updateChildPaths(e.children, oldParent, newParent);
      }
      return updated;
    });
  }

  // 局部更新：向指定目录添加新条目
  function addEntryToTree(entries: FileEntry[], parentPath: string, newEntry: FileEntry): FileEntry[] {
    if (!parentPath) {
      return [...entries, newEntry].sort((a, b) => {
        const dirCmp = b.is_dir ? 1 : 0 - (a.is_dir ? 1 : 0);
        if (dirCmp !== 0) return dirCmp;
        return a.name.localeCompare(b.name);
      });
    }
    return entries.map((e) => {
      if (e.path === parentPath && e.is_dir) {
        const children = [...(e.children || []), newEntry].sort((a, b) => {
          const dirCmp = (b.is_dir ? 1 : 0) - (a.is_dir ? 1 : 0);
          if (dirCmp !== 0) return dirCmp;
          return a.name.localeCompare(b.name);
        });
        return { ...e, children };
      }
      if (e.is_dir && e.children) {
        return { ...e, children: addEntryToTree(e.children, parentPath, newEntry) };
      }
      return e;
    });
  }

  async function handleDelete(entry: FileEntry) {
    const label = entry.is_dir ? `文件夹 "${entry.name}"` : `文件 "${entry.name}"`;
    if (!confirm(`确定删除${label}？\n${entry.is_dir ? "（仅当文件夹为空时可删除）" : "（将移到回收站）"}`)) return;
    try {
      await commands.deleteNote(entry.path, false);
      // 局部更新：从树中移除，保持展开状态不变
      setFiles((prev) => removeEntryFromTree(prev, entry.path));
      incrementGraphRefresh();
      incrementTagRefresh();
    } catch (err) {
      alert(`删除失败: ${err}`);
    }
  }

  function collectAllDirPaths(entries: FileEntry[]): string[] {
    const paths: string[] = [];
    function walk(items: FileEntry[]) {
      for (const e of items) {
        if (e.is_dir) {
          paths.push(e.path);
          if (e.children) walk(e.children);
        }
      }
    }
    walk(entries);
    return paths;
  }

  function expandAll() {
    const allDirs = collectAllDirPaths(files);
    setExpanded(new Set(allDirs));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function renderTree(entries: FileEntry[], depth: number = 0) {
    return entries.map((file) => {
      const isRenaming = renamingPath === file.path;
      const isActive = currentNotePath === file.path;
      const isDragOver = dragOverPath === file.path;
      const isExpanded = expanded.has(file.path);

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
              className={`sidebar-item w-full text-left group ${isActive ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : ""} ${isDragOver ? "bg-[var(--color-accent)]/20 ring-1 ring-[var(--color-accent)]/50" : ""}`}
              style={{ paddingLeft: `${12 + depth * 12}px` }}
              data-file-path={file.path}
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
              {file.is_dir ? (
                <span className={`shrink-0 text-[10px] transition-transform duration-150 ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
                  ▾
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]"><IconFile size={10} /></span>
              )}
              <span className="truncate text-xs">{file.name}</span>
            </button>
          )}
          {file.is_dir && isExpanded && file.children && (
            <div className="transition-opacity duration-150">{renderTree(file.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">文件浏览器</span>
        <div className="flex items-center gap-0.5">
          <button
            className="icon-btn icon-btn-sm text-[10px]"
            onClick={expandAll}
            title="展开全部"
          >
            ⊞
          </button>
          <button
            className="icon-btn icon-btn-sm text-[10px]"
            onClick={collapseAll}
            title="折叠全部"
          >
            ⊟
          </button>
          <div className="w-px h-3 bg-[var(--color-border)] mx-0.5" />
          <button
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
            onClick={() => startCreate("file", "")}
            title="新建笔记"
          >
            + 笔记
          </button>
          <button
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
            onClick={() => startCreate("folder", "")}
            title="新建文件夹"
          >
            + 文件夹
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
              <IconClose size={10} />
            </button>
          </div>
          {createError && <p className="text-xs text-red-400 mt-1">{createError}</p>}
        </div>
      )}

      <div
        ref={fileListRef}
        className={`flex-1 overflow-y-auto py-1 ${dragOverRoot ? "bg-[var(--color-accent)]/10 ring-2 ring-[var(--color-accent)]/30 ring-inset" : ""}`}
        onDragEnter={handleDragEnterRoot}
        onDragLeave={handleDragLeaveRoot}
        onDragOver={handleDragOverRoot}
        onDrop={handleDropOnRoot}
        onContextMenu={(e) => {
          e.preventDefault();
          setBlankContextMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {files.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            空知识库
            <br />
            点击 <IconEdit size={10} /> 创建第一篇笔记
          </div>
        ) : (
          renderTree(files)
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={fileContextMenuItems}
        />
      )}

      {blankContextMenu && (
        <ContextMenu
          x={blankContextMenu.x}
          y={blankContextMenu.y}
          onClose={() => setBlankContextMenu(null)}
          items={blankContextMenuItems}
        />
      )}
    </div>
  );
}