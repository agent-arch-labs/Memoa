import { useState, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "@/stores/appStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { IconFile } from "@/components/common/Icons";
import type { TagWithCount, NoteSummary } from "@/types";

export function TagsPanel() {
  const commands = useTauriCommands();
  const vaultPath = useAppStore((s) => s.vaultPath);
  const setCurrentNote = useAppStore((s) => s.setCurrentNote);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const tagRefreshKey = useAppStore((s) => s.tagRefreshKey);
  const saveCurrentNote = useAppStore((s) => s.saveCurrentNote);

  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const uniqueNotes = useMemo(() => {
    const seen = new Set<string>();
    return notes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [notes]);

  const loadTags = useCallback(async () => {
    try {
      const result = await commands.listTagsWithCounts();
      setTags(result);
    } catch {
      console.error("加载标签失败");
    }
  }, [commands]);

  const loadNotesForTag = useCallback(async (tagId: string) => {
    setLoading(true);
    try {
      const result = await commands.getNotesByTag(tagId);
      setNotes(result);
    } catch {
      console.error("加载标签笔记失败");
    } finally {
      setLoading(false);
    }
  }, [commands]);

  useEffect(() => {
    loadTags();
  }, [loadTags, tagRefreshKey]);

  useEffect(() => {
    if (activeTag) {
      loadNotesForTag(activeTag);
    } else {
      setNotes([]);
    }
  }, [activeTag, loadNotesForTag]);

  async function handleTagClick(tagId: string) {
    if (activeTag === tagId) {
      setActiveTag(null);
      return;
    }
    setActiveTag(tagId);
  }

  async function handleNoteClick(note: NoteSummary) {
    try {
      const fullPath = note.path.startsWith("/") || !vaultPath
        ? note.path
        : `${vaultPath}/${note.path}`;
      const content = await commands.readFile(fullPath);
      await saveCurrentNote();
      setCurrentNote(fullPath, content);
      setDataSource("local");
      setContextTarget({
        type: "file",
        label: note.title,
        path: fullPath,
      });
    } catch {
      console.error("打开笔记失败");
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          标签
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tags.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            暂无标签
            <br />
            在笔记中使用 #标签名 添加标签
          </div>
        ) : (
          <div className="space-y-0.5">
            {tags.map((tag) => (
              <div key={tag.id}>
                <button
                  className={`sidebar-item w-full text-left justify-between ${
                    activeTag === tag.id
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/8 font-medium"
                      : ""
                  }`}
                  onClick={() => handleTagClick(tag.id)}
                >
                  <span className="text-xs">#{tag.name}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {tag.count}
                  </span>
                </button>

                {activeTag === tag.id && (
                  <div className="ml-3 border-l border-[var(--color-border)] pl-2 space-y-0.5">
                    {loading ? (
                      <div className="px-2 py-2 text-[11px] text-[var(--color-text-muted)]">
                        加载中...
                      </div>
                    ) : uniqueNotes.length === 0 ? (
                      <div className="px-2 py-2 text-[11px] text-[var(--color-text-muted)]">
                        暂无笔记
                      </div>
                    ) : (
                      uniqueNotes.map((note) => (
                        <button
                          key={note.id}
                          className="w-full text-left px-2 py-1 rounded text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors truncate"
                          onClick={() => handleNoteClick(note)}
                          title={note.path}
                        >
                          <span className="text-xs mr-1 opacity-60"><IconFile size={10} /></span>
                          {note.title}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}