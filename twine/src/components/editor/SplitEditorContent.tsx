import { useAppStore } from "@/stores/appStore";
import { EditorContent } from "./EditorContent";

export function SplitEditorContent() {
  const splitNotePath = useAppStore((s) => s.splitNotePath);
  const splitNoteContent = useAppStore((s) => s.splitNoteContent);
  const closeSplitNote = useAppStore((s) => s.closeSplitNote);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <span className="text-xs text-[var(--color-text-muted)] truncate flex-1">
          {splitNotePath?.split("/").pop() || ""}
        </span>
        <button
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-1 text-sm leading-none ml-2 shrink-0"
          onClick={closeSplitNote}
          title="关闭分屏"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorContent content={splitNoteContent} />
      </div>
    </div>
  );
}