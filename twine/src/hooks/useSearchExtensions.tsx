import { useMemo, type ReactNode } from "react";
import { loadSearchExtensions, type SearchToolConfig } from "@/components/settings/SearchExtensionsSettings";
import type { DataSource } from "@/types";

const BUILTIN_DATA_SOURCE_ICONS: Record<string, ReactNode> = {
  local: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4H8l-1-2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1zm-1 9H3V6h10v7z" /></svg>,
  online: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM5.2 13.2A5.5 5.5 0 013.7 8.5h2a9 9 0 00.5 2.7 5.5 5.5 0 00-1 2zm5.6 0a5.5 5.5 0 01-1-2 9 9 0 00.5-2.7h2a5.5 5.5 0 01-1.5 4.7zM8 14c-.5 0-1.2-.8-1.6-2.1a7.5 7.5 0 01-.4-1.9h4a7.5 7.5 0 01-.4 1.9C9.2 13.2 8.5 14 8 14zm-2.5-5a7.5 7.5 0 01.4-1.9C6.3 5.8 7 5 7.5 5h1c.5 0 1.2.8 1.6 2.1.2.6.3 1.2.4 1.9h-5zm5.3 0h-2a9 9 0 00-.5-2.7 5.5 5.5 0 011-2A5.5 5.5 0 0113.3 8.5h-2.5zm-7.6 0H3.2a5.5 5.5 0 012.6-4.7 5.5 5.5 0 011 2A9 9 0 006.2 8.5z" /></svg>,
  knowledge: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 1.5l-6 3v7l6 3 6-3v-7l-6-3zm0 1.1l4.5 2.25-4.5 2.25L4 4.85 8.5 2.6zM3 5.4l5 2.5v5.5l-5-2.5V5.4zm6 8V7.9l5-2.5v5.5l-5 2.5z" /></svg>,
};
const BUILTIN_DATA_SOURCE_LABELS: Record<string, string> = { local: "本地文件", online: "联网", knowledge: "知识库" };
const BUILTIN_DATA_SOURCE_DESCS: Record<string, string> = { local: "基于本地文件检索", online: "Tavily 联网检索 + RAG", knowledge: "基于远程知识库检索" };

export function useSearchExtensions() {
  const extensions = useMemo(() => loadSearchExtensions(), []);

  const getDataSourceIcon = (source: DataSource): ReactNode =>
    BUILTIN_DATA_SOURCE_ICONS[source] ?? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="6.5" cy="6.5" r="4.5" /><line x1="10" y1="10" x2="14" y2="14" /></svg>;

  const getDataSourceLabel = (source: DataSource): string =>
    BUILTIN_DATA_SOURCE_LABELS[source] || extensions.customSearches.find((s) => s.id === source)?.name || source;

  const getDataSourceDesc = (source: DataSource): string =>
    BUILTIN_DATA_SOURCE_DESCS[source] || extensions.customSearches.find((s) => s.id === source)?.description || source;

  const findSearchTool = (source: DataSource): SearchToolConfig | undefined =>
    extensions.customSearches.find((s) => s.id === source);

  const enabledCustomSearches = useMemo(
    () => extensions.customSearches.filter((s) => s.enabled),
    [extensions.customSearches],
  );

  return {
    extensions,
    getDataSourceIcon,
    getDataSourceLabel,
    getDataSourceDesc,
    findSearchTool,
    enabledCustomSearches,
  };
}