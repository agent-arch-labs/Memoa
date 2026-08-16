import { useMemo, useState, useRef } from "react";
import { useAppStore } from "@/stores/appStore";
import { useClickOutside } from "@/hooks/useClickOutside";

interface BreadcrumbItem {
  label: string;
  path: string;
}

export function Breadcrumbs() {
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const vaultPath = useAppStore((s) => s.vaultPath);

  const [dropdownPath, setDropdownPath] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(dropdownRef, () => setDropdownPath(null));

  const items = useMemo<BreadcrumbItem[]>(() => {
    if (!currentNotePath || !vaultPath) return [];
    const relative = currentNotePath.startsWith(vaultPath + "/")
      ? currentNotePath.slice(vaultPath.length + 1)
      : currentNotePath;
    const parts = relative.split("/");
    const result: BreadcrumbItem[] = [];
    let accumulated = vaultPath;
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      result.push({
        label: part.replace(/\.md$/, ""),
        path: accumulated,
      });
    }
    return result;
  }, [currentNotePath, vaultPath]);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 px-3 h-6 text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface)] border-b border-[var(--color-border)]/50 shrink-0 overflow-x-auto select-none" style={{ scrollbarWidth: "none" }}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const isDir = !isLast;

        return (
          <div key={item.path} className="flex items-center gap-0.5 shrink-0" ref={dropdownPath === item.path ? dropdownRef : undefined}>
            {i > 0 && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-[var(--color-text-muted)]/40 shrink-0">
                <path d="M6 4l4 4-4 4" />
              </svg>
            )}
            {isDir ? (
              <button
                className="flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
                onClick={() => setDropdownPath(dropdownPath === item.path ? null : item.path)}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                  <path d="M1.5 2A1.5 1.5 0 000 3.5v9A1.5 1.5 0 001.5 14h13a1.5 1.5 0 001.5-1.5V5.5A1.5 1.5 0 0014.5 4H7.707l-1.854-1.854A.5.5 0 005.5 2H1.5z" />
                </svg>
                <span>{item.label}</span>
              </button>
            ) : (
              <span className="px-1 py-0.5 text-[var(--color-text-primary)] font-medium truncate max-w-[200px]">
                {item.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
