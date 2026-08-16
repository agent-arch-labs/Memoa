/**
 * 编辑器内容区域
 * 编辑模式：CodeMirror 6 专业编辑器
 * 预览模式：Markdown 渲染预览
 */
import { useAppStore } from "@/stores/appStore";
import { CmEditor } from "./CmEditor";
import { MarkdownPreview } from "./MarkdownPreview";

interface Props {
  content: string;
}

export function EditorContent({ content }: Props) {
  const isEditing = useAppStore((s) => s.isEditing);

  if (isEditing) {
    return <CmEditor content={content} />;
  }

  return <MarkdownPreview content={content} />;
}
