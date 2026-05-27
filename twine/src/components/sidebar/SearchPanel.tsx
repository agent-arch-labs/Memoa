import { useState, useMemo } from "react";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useAppStore } from "@/stores/appStore";
import { useDebounce } from "@/hooks/useDebounce";
import type { SearchResult } from "@/types";

export function SearchPanel() {
  const commands = useTauriCommands();
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedResults = useMemo(() => {
    const groupMap = new Map<string, SearchResult[]>();
    for (const r of results) {
      const key = r.path;
      const arr = groupMap.get(key);
      if (arr) {
        arr.push(r);
      } else {
        groupMap.set(key, [r]);
      }
    }
    return Array.from(groupMap.entries()).map(([path, children]) => ({
      title: children[0].title,
      path,
      snippet: children[0].snippet || "",
      count: children.length,
      children,
      expanded: expandedGroups.has(path),
    }));
  }, [results, expandedGroups]);

  const doSearch = useDebounce(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await commands.searchNotes(q);
      setResults(r);
    } catch (e) {
      console.error("搜索失败", e);
    } finally {
      setSearching(false);
    }
  }, 300);

  async function handleInput(val: string) {
    setQuery(val);
    doSearch(val);
  }

  async function handleResultClick(result: SearchResult) {
    try {
      const vaultPath = useAppStore.getState().vaultPath;
      if (!vaultPath) {
        console.error("未打开仓库");
        return;
      }
      const fullPath = `${vaultPath}/${result.path.replace(/^\//, "")}`;
      const content = await commands.readFile(fullPath);
      setCurrentNote(fullPath, content);
      setContextTarget({
        type: "file",
        label: result.title,
        path: fullPath,
      });
    } catch (e) {
      console.error("打开搜索结果失败", e);
    }
  }

  function toggleGroup(path: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <input
          className="input text-xs"
          placeholder="搜索笔记..."
          value={query}
          onChange={(e) => handleInput(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
            搜索中...
          </div>
        )}
        {groupedResults.map((group) => (
          <div key={group.path}>
            <button
              className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border)]/50"
              onClick={() => {
                if (group.count <= 1) {
                  handleResultClick(group.children[0]);
                } else {
                  toggleGroup(group.path);
                }
              }}
            >
              <div className="flex items-center gap-1">
                {group.count > 1 && (
                  <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
                    {group.expanded ? "▾" : "▸"}
                  </span>
                )}
                <span className="text-xs font-medium truncate">{group.title}</span>
                {group.count > 1 && (
                  <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 ml-1">
                    ({group.count})
                  </span>
                )}
              </div>
              {group.count === 1 && group.snippet && (
                <div className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
                  {group.snippet}
                </div>
              )}
            </button>
            {group.expanded && group.count > 1 && group.children.map((child, idx) => (
              <button
                key={`${child.path}-${idx}`}
                className="w-full text-left pl-8 pr-3 py-1.5 hover:bg-[var(--color-surface-hover)] border-b border-[var(--color-border)]/30 text-[11px] text-[var(--color-text-muted)]"
                onClick={() => handleResultClick(child)}
              >
                <span className="truncate block">
                  {child.snippet || `匹配项 ${idx + 1}`}
                </span>
              </button>
            ))}
          </div>
        ))}
        {!searching && query && results.length === 0 && (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            未找到相关笔记
          </div>
        )}
      </div>
    </div>
  );
}