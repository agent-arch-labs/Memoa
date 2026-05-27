import { useState, useRef, useCallback, useEffect } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import type { FileEntry } from "@/types";
import type { SelectedRef } from "./ChatInputArea";

interface FilePickerPopoverProps {
  mode: "file" | "folder";
  visible: boolean;
  vaultPath: string | null;
  selectedRefs: SelectedRef[];
  onConfirm: (refs: SelectedRef[]) => void;
  onClose: () => void;
}

export function FilePickerPopover({
  mode,
  visible,
  vaultPath,
  selectedRefs,
  onConfirm,
  onClose,
}: FilePickerPopoverProps) {
  const commands = useTauriCommands();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerFiles, setPickerFiles] = useState<FileEntry[]>([]);
  const [pickerFilter, setPickerFilter] = useState("");
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set());

  useClickOutside(pickerRef, onClose, visible);

  const loadFiles = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const entries = await commands.listVault(vaultPath);
      if (mode === "folder") {
        const filterDirs = (items: FileEntry[]): FileEntry[] =>
          items.filter((e) => e.is_dir).map((e) => ({
            ...e,
            children: e.children ? filterDirs(e.children) : null,
          }));
        setPickerFiles(filterDirs(entries));
      } else {
        setPickerFiles(entries);
      }
    } catch (e) {
      console.error("加载文件列表失败", e);
    }
  }, [vaultPath, commands, mode]);

  useEffect(() => {
    if (visible) {
      setPickerFilter("");
      setTempSelected(new Set(selectedRefs.filter((r) => r.type === mode).map((r) => r.path)));
      loadFiles();
    }
  }, [visible, mode]);

  function toggleItem(path: string) {
    const next = new Set(tempSelected);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setTempSelected(next);
  }

  function handleConfirm() {
    const existingOthers = selectedRefs.filter((r) => r.type !== mode);
    const newRefs: SelectedRef[] = [];
    function collect(items: FileEntry[]) {
      for (const item of items) {
        if (tempSelected.has(item.path)) {
          newRefs.push({
            path: item.path,
            name: item.name,
            type: mode,
          });
        }
        if (item.children) collect(item.children);
      }
    }
    collect(pickerFiles);
    onConfirm([...existingOthers, ...newRefs]);
    onClose();
  }

  if (!visible) return null;

  const filtered = (items: FileEntry[]): FileEntry[] => {
    if (!pickerFilter) return items;
    return items
      .filter((item) => item.name.toLowerCase().includes(pickerFilter.toLowerCase()))
      .map((item) => ({
        ...item,
        children: item.children ? filtered(item.children) : null,
      }));
  };

  function renderTree(items: FileEntry[], depth: number = 0): React.ReactNode {
    const visibleItems = filtered(items);

    if (visibleItems.length === 0 && depth === 0) {
      return (
        <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
          {pickerFilter ? "无匹配结果" : mode === "folder" ? "暂无文件夹" : "暂无笔记"}
        </div>
      );
    }

    return visibleItems.map((item) => {
      const isChecked = tempSelected.has(item.path);
      const isDir = item.is_dir;

      return (
        <div key={item.path}>
          <button
            className={`w-full text-left px-2 py-1 flex items-center gap-1.5 text-xs rounded transition-colors ${
              isChecked
                ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]"
            }`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => {
              if (mode === "file" && isDir) return;
              toggleItem(item.path);
            }}
          >
            <span
              className={`shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] transition-colors ${
                isChecked
                  ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                  : "border-[var(--color-border)]"
              }`}
            >
              {isChecked && "✓"}
            </span>
            <span className="shrink-0 text-xs">
              {isDir ? "📁" : "📄"}
            </span>
            <span className="truncate">{item.name}</span>
          </button>
          {item.children && (
            <div>{renderTree(item.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  return (
    <div
      ref={pickerRef}
      className="absolute bottom-full left-3 right-3 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50 max-h-[320px] flex flex-col animate-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {mode === "file" ? "选择文档" : "选择文件夹"}
        </span>
        <button
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="px-3 py-2">
        <input
          className="input text-xs w-full"
          placeholder="搜索..."
          value={pickerFilter}
          onChange={(e) => setPickerFilter(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {renderTree(pickerFiles)}
      </div>

      <div className="px-3 py-2 border-t border-[var(--color-border)] flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-text-muted)]">
          已选 {tempSelected.size} 项
        </span>
        <button
          className="px-3 py-1 rounded-lg text-[11px] font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
          onClick={handleConfirm}
        >
          确认
        </button>
      </div>
    </div>
  );
}