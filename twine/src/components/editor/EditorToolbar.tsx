import { useState, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { NoteDetailPanel } from "./NoteDetailPanel";
import { IconLetterDetail, IconEdit, IconLetterStock, IconThemeToggle, IconChat, IconSaveBtn, IconWindowMaximize, IconWindowRestore } from "@/components/common/Icons";
import { notify } from "@/components/ui/NotificationContainer";

export function EditorToolbar() {
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const currentNoteContent = useAppStore((s) => s.currentNoteContent);
  const isEditing = useAppStore((s) => s.isEditing);
  const setEditing = useAppStore((s) => s.setEditing);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const incrementTagRefresh = useAppStore((s) => s.incrementTagRefresh);
  const incrementGraphRefresh = useAppStore((s) => s.incrementGraphRefresh);
  const savedAt = useAppStore((s) => s.savedAt);
  const markSaved = useAppStore((s) => s.markSaved);
  const chatVisible = useAppStore((s) => s.chatVisible);
  const maximizedPanel = useAppStore((s) => s.maximizedPanel);
  const toggleMaximizePanel = useAppStore((s) => s.toggleMaximizePanel);
  const stockTarget = useStockDetailStore((s) => s.target);
  const showStock = useAppStore((s) => s.showStock);
  const commands = useTauriCommands();
  const [showDetail, setShowDetail] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (savedAt > 0) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [savedAt]);

  async function handleSave() {
    if (!currentNotePath) return;
    try {
      await commands.writeFile(currentNotePath, currentNoteContent);
      incrementTagRefresh();
      incrementGraphRefresh();
      markSaved();
      notify({ type: "success", title: "保存成功", message: title });
    } catch (e) {
      console.error("保存失败", e);
      notify({ type: "error", title: "保存失败", message: String(e) });
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
                <span className={`text-[11px] shrink-0 ${showSaved ? "text-green-400" : "text-[var(--color-accent)]"}`}>
                  {showSaved ? "已保存" : "已修改"}
                </span>
              )}
            </>
          )}
        </div>

        {currentNotePath && (
          <div className="flex items-center gap-0.5">
            <button
              className={`icon-btn ${showDetail ? "active" : ""}`}
              onClick={() => setShowDetail(!showDetail)}
              title="笔记详情"
            >
              <IconLetterDetail size={14} />
            </button>
            {isEditing && (
              <button className="icon-btn" onClick={handleSave} title="保存">
                <IconSaveBtn size={13} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => setEditing(true)}
              title="编辑"
            >
              <IconEdit size={12} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-[var(--color-border)]">
          {stockTarget && (
            <button className="icon-btn" onClick={showStock} title="股票详情">
              <IconLetterStock size={14} />
            </button>
          )}
          <button className="icon-btn" onClick={toggleTheme} title="切换主题">
            <IconThemeToggle size={14} />
          </button>
          {!chatVisible && (
            <button className="icon-btn" onClick={toggleChat} title="AI 对话">
              <IconChat size={14} />
            </button>
          )}
          <div className="w-px h-4 bg-[var(--color-border)] mx-0.5" />
          <button
            className="icon-btn"
            onClick={() => toggleMaximizePanel("editor")}
            title={maximizedPanel === "editor" ? "还原 (Ctrl+Shift+M)" : "最大化 (Ctrl+Shift+M)"}
          >
            {maximizedPanel === "editor" ? <IconWindowRestore size={14} /> : <IconWindowMaximize size={14} />}
          </button>
        </div>
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