import { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { NoteDetailPanel } from "./NoteDetailPanel";

export function EditorToolbar() {
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const currentNoteContent = useAppStore((s) => s.currentNoteContent);
  const isEditing = useAppStore((s) => s.isEditing);
  const setEditing = useAppStore((s) => s.setEditing);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const commands = useTauriCommands();
  const [showDetail, setShowDetail] = useState(false);

  async function handleSave() {
    if (!currentNotePath) return;
    try {
      await commands.writeFile(currentNotePath, currentNoteContent);
      incrementTagRefresh();
      incrementGraphRefresh();
      setEditing(false);
    } catch (e) {
      console.error("保存失败", e);
    }
  }

  const rawTitle = currentNotePath
    ? currentNotePath.split("/").pop() || "Untitled"
    : "";
  const title = rawTitle.replace(/\.md$/, "");

  return (
    <>
      <header
        className="flex items-center gap-1 px-3 h-10 border-b border-[var(--color-border)] shrink-0"
      >
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {title && (
            <>
              <span className="text-sm font-medium truncate">{title}</span>
              {isEditing && (
                <span className="text-[11px] text-[var(--color-accent)] shrink-0">
                  已修改
                </span>
              )}
            </>
          )}
        </div>

        {currentNotePath && (
          <>
            <button
              className={`btn btn-ghost px-1 ${showDetail ? "text-[var(--color-accent)]" : ""}`}
              onClick={() => setShowDetail(!showDetail)}
              title="笔记详情"
            >
              <span className="text-sm">ℹ</span>
            </button>
            {isEditing && (
              <button className="btn btn-primary py-1 px-2 text-xs" onClick={handleSave}>
                保存
              </button>
            )}
            <button
              className="btn btn-ghost px-1"
              onClick={() => setEditing(true)}
              title="编辑"
            >
              <span className="text-sm">✎</span>
            </button>
          </>
        )}

        <button className="btn btn-ghost px-1" onClick={toggleTheme} title="切换主题">
          <span className="text-sm">🌓</span>
        </button>

        <button className="btn btn-ghost px-1" onClick={toggleChat} title="AI 对话">
          <span className="text-sm">🤖</span>
        </button>
      </header>

      {showDetail && currentNotePath && (
        <NoteDetailPanel
          content={currentNoteContent}
          filePath={currentNotePath}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}