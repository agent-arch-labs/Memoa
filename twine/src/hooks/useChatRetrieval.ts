import { useAppStore } from "@/stores/appStore";
import { useSettingsStore, getActiveLlmConfig } from "@/stores/settingsStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { useSearchExtensions } from "@/hooks/useSearchExtensions";
import { buildSearchRequest } from "@/components/settings/SearchExtensionsSettings";
import { loadConfig } from "@/components/settings/KnowledgeBaseSettings";
import type { MessageSource, DataSource, ContextTarget } from "@/types";

interface SearchOutcome {
  sources: MessageSource[];
  contexts: string[];
}

export function useChatRetrieval() {
  const commands = useTauriCommands();
  const vaultPath = useAppStore((s) => s.vaultPath);
  const settings = useSettingsStore();
  const activeLlmConfig = getActiveLlmConfig(settings);
  const { extensions } = useSearchExtensions();

  async function searchLocal(query: string, topK: number = 10): Promise<SearchOutcome> {
    const sources: MessageSource[] = [];
    const contexts: string[] = [];

    if (!vaultPath || !activeLlmConfig) {
      return { sources, contexts };
    }

    try {
      const results = await commands.multiSearch(query, topK, activeLlmConfig);
      for (const r of results) {
        const noteTitle = r.note_title;
        const extra = r.chunk_length > 0 ? ` (offset ${r.chunk_offset}, len ${r.chunk_length})` : "";
        sources.push({
          noteTitle,
          notePath: r.note_id,
          snippet: r.text.slice(0, 200) + extra,
          score: r.score,
          chunkOffset: r.chunk_offset,
          chunkLength: r.chunk_length,
        });
        contexts.push(`[来源: ${noteTitle}]\n${r.text}`);
      }
    } catch (e) {
      contexts.push(`[提示] 多路检索失败(${String(e).slice(0, 200)})。`);
    }

    return { sources, contexts };
  }

  async function searchTavily(query: string): Promise<SearchOutcome> {
    const sources: MessageSource[] = [];
    const contexts: string[] = [];

    if (!extensions.tavilyEnabled || !extensions.tavilyApiKey) {
      contexts.push("[提示] 联网模式需要配置 Tavily API Key。");
      return { sources, contexts };
    }

    try {
      const result = await commands.tavilySearch(query, extensions.tavilyApiKey);
      if (result.answer) {
        contexts.push(`[Tavily 摘要]\n${result.answer}`);
      }
      for (const r of result.results) {
        contexts.push(`[${r.title}](${r.url})\n${r.content}`);
        sources.push({
          noteTitle: r.title,
          notePath: r.url,
          snippet: r.content.slice(0, 200),
          score: r.score || 0,
          chunkOffset: 0,
          chunkLength: 0,
        });
      }
    } catch (e) {
      contexts.push(`[Tavily 检索失败] ${e}`);
    }

    return { sources, contexts };
  }

  async function searchCustom(query: string, toolId: string, topK: number = 10): Promise<SearchOutcome> {
    const sources: MessageSource[] = [];
    const contexts: string[] = [];

    const tool = extensions.customSearches.find((s) => s.id === toolId);
    if (!tool) {
      contexts.push(`[提示] 检索工具 "${toolId}" 未找到。`);
      return { sources, contexts };
    }

    try {
      const resp = await fetch(tool.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tool.apiKey ? { Authorization: `Bearer ${tool.apiKey}` } : {}),
        },
        body: JSON.stringify(buildSearchRequest(query, topK)),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const items = data.results || data.data || [];

      for (const item of items) {
        const content = item.content || item.text || "";
        const url = item.url || item.metadata?.url || "";
        const title = item.title || (url ? new URL(url).hostname : "") || "";
        const extra = url ? `\n来源: ${url}` : "";

        sources.push({
          noteTitle: title,
          notePath: url,
          snippet: content.slice(0, 200) + extra,
          score: item.score || 0,
          chunkOffset: 0,
          chunkLength: 0,
        });
        contexts.push(`[${tool.name}: ${title}]\n${content}${extra}`);
      }
    } catch (e) {
      contexts.push(`[${tool.name} 检索失败] ${e}`);
    }

    return { sources, contexts };
  }

  async function searchKnowledge(
    query: string,
    contextTarget: ContextTarget,
    topK: number = 10,
  ): Promise<SearchOutcome> {
    const sources: MessageSource[] = [];
    const contexts: string[] = [];

    const config = loadConfig();
    if (!config.endpoint.trim()) {
      contexts.push("[提示] 知识库服务未配置（设置 -> 知识库 -> 服务位置）。");
      return { sources, contexts };
    }

    const baseUrl = config.endpoint.trim().replace(/\/+$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey.trim()) {
      headers["Authorization"] = `Bearer ${config.apiKey.trim()}`;
    }

    const filters: Record<string, unknown> = { source_type: "document" };

    if (contextTarget.type === "folder") {
      if (contextTarget.kbId) {
        filters.knowledge_base_ids = [contextTarget.kbId];
      }
      if (contextTarget.parentId) {
        filters.parent_filenode_ids = [contextTarget.parentId];
      }
      if (contextTarget.category) {
        filters.category = contextTarget.category;
      }
    }

    try {
      const resp = await fetch(`${baseUrl}/api/enhanced_search/v1/retrieval/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query,
          search_type: "hybrid",
          top_k: topK,
          filters,
          include_metadata: true,
          include_highlights: true,
        }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
      }

      const data = await resp.json();
      const results = data?.data?.results || data?.results || [];

      for (const item of results) {
        const title = item.title || "";
        const content = item.content || "";
        const highlights = item.highlights || "";
        const score = item.score || 0;
        const metadata = item.metadata || {};

        const kbName = String(metadata.knowledge_base_name || "");
        const fileType = String(metadata.file_type || "");
        const uploader = String(metadata.uploader || "");

        const sourceLabel = kbName ? `[知识库: ${kbName}]` : "[知识库]";
        const metaLine = [kbName && `📚${kbName}`, fileType && `${fileType}`, uploader && `👤${uploader}`]
          .filter(Boolean).join(" · ");

        const highlightText = highlights ? `\n> ${String(highlights).replace(/\n/g, "\n> ")}` : "";
        const contextText = `${sourceLabel} ${title}\n${metaLine}\n\n${content}${highlightText}`;
        contexts.push(contextText);

        sources.push({
          noteTitle: title,
          notePath: String(metadata.document_id || item.id || ""),
          snippet: content.slice(0, 200),
          score,
          chunkOffset: 0,
          chunkLength: 0,
        });
      }
    } catch (e) {
      contexts.push(`[知识库检索失败] ${String(e).slice(0, 300)}`);
    }

    return { sources, contexts };
  }

  async function search(
    query: string,
    dataSource: DataSource,
    topK: number = 10,
  ): Promise<SearchOutcome> {
    const sources: MessageSource[] = [];
    const contexts: string[] = [];

    if (dataSource === "local") {
      const local = await searchLocal(query, topK);
      sources.push(...local.sources);
      contexts.push(...local.contexts);
    } else if (dataSource === "online") {
      const online = await searchTavily(query);
      sources.push(...online.sources);
      contexts.push(...online.contexts);
    } else if (dataSource === "knowledge") {
      const knowledge = await searchKnowledge(query, useAppStore.getState().contextTarget, topK);
      sources.push(...knowledge.sources);
      contexts.push(...knowledge.contexts);
    } else {
      const custom = await searchCustom(query, dataSource, topK);
      sources.push(...custom.sources);
      contexts.push(...custom.contexts);
    }

    return { sources, contexts };
  }

  return { searchLocal, searchTavily, searchCustom, searchKnowledge, search };
}