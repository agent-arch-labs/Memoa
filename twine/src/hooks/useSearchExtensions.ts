import { useMemo } from "react";
import { loadSearchExtensions, type SearchToolConfig } from "@/components/settings/SearchExtensionsSettings";
import type { DataSource } from "@/types";

const BUILTIN_DATA_SOURCE_ICONS: Record<string, string> = { local: "📁", online: "🌐", knowledge: "📚" };
const BUILTIN_DATA_SOURCE_LABELS: Record<string, string> = { local: "本地文件", online: "联网", knowledge: "知识库" };
const BUILTIN_DATA_SOURCE_DESCS: Record<string, string> = { local: "基于本地文件检索", online: "Tavily 联网检索 + RAG", knowledge: "基于远程知识库检索" };

export function useSearchExtensions() {
  const extensions = useMemo(() => loadSearchExtensions(), []);

  const getDataSourceIcon = (source: DataSource): string =>
    BUILTIN_DATA_SOURCE_ICONS[source] || extensions.customSearches.find((s) => s.id === source)?.name.slice(0, 1) || "🔍";

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