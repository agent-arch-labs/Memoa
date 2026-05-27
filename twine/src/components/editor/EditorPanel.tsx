import { useAppStore } from "@/stores/appStore";
import { EditorToolbar } from "./EditorToolbar";
import { EditorContent } from "./EditorContent";
import { WelcomeScreen } from "./WelcomeScreen";
import { SplitEditorContent } from "./SplitEditorContent";

export function EditorPanel() {
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const currentNoteContent = useAppStore((s) => s.currentNoteContent);
  const splitNotePath = useAppStore((s) => s.splitNotePath);
  const vaultPath = useAppStore((s) => s.vaultPath);

  if (!vaultPath) {
    return <WelcomeScreen />;
  }

  if (splitNotePath) {
    return (
      <div className="h-full flex flex-col">
        <EditorToolbar />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 min-w-0 border-r border-[var(--color-border)] overflow-hidden">
            {currentNotePath ? (
              <EditorContent content={currentNoteContent} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
                Ctrl/Cmd+O 打开笔记
              </div>
            )}
          </div>
          <SplitEditorContent />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <EditorToolbar />
      <div className="flex-1 overflow-hidden">
        {currentNotePath ? (
          <EditorContent content={currentNoteContent} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
            Ctrl/Cmd+O 打开笔记，或从左侧文件浏览器选择
          </div>
        )}
      </div>
    </div>
  );
}