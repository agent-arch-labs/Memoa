import { useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  VaultInfo,
  FileEntry,
  SearchResult,
  VectorSearchResult,
  Backlink,
  GraphData,
  IndexStats,
  SummarizeResult,
  EmbeddingResult,
  TagWithCount,
  NoteSummary,
  RecentNote,
  TavilySearchResult,
  AgentStatus,
  AgentToolInfo,
  AgentWorkflowResult,
  AgentRagStrategy,
} from "@/types";
import type { ModelConfig } from "@/stores/settingsStore";
import { modelConfigToTauriArgs } from "@/stores/settingsStore";

type TauriCommands = {
  getHomeDir: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  listVault: (vaultPath: string) => Promise<FileEntry[]>;
  createNote: (vaultPath: string, relativePath: string) => Promise<string>;
  createFolder: (vaultPath: string, relativePath: string) => Promise<string>;
  deleteNote: (path: string, permanent: boolean) => Promise<void>;
  renameNote: (oldPath: string, newPath: string) => Promise<void>;
  openVault: (path: string) => Promise<VaultInfo>;
  switchVault: (path: string) => Promise<VaultInfo>;
  getVaultInfo: () => Promise<VaultInfo | null>;
  reindexVault: (embedConfig?: ModelConfig) => Promise<IndexStats>;
  searchNotes: (query: string) => Promise<SearchResult[]>;
  getBacklinks: (targetTitle: string) => Promise<Backlink[]>;
  getGraphData: () => Promise<GraphData>;
  getLocalGraph: (noteId: string, depth: number) => Promise<GraphData>;
  modelChat: (prompt: string, context: string[], modelConfig: ModelConfig) => Promise<string>;
  modelChatStream: (prompt: string, context: string[], modelConfig: ModelConfig, requestId: string) => Promise<void>;
  modelEmbed: (text: string, modelConfig: ModelConfig) => Promise<EmbeddingResult>;
  modelHealthCheck: (modelConfig: ModelConfig) => Promise<boolean>;
  modelChatCheck: (modelConfig: ModelConfig) => Promise<boolean>;
  ollamaEmbed: (text: string, model?: string, ollamaUrl?: string) => Promise<EmbeddingResult>;
  ollamaChat: (prompt: string, context: string[], model?: string, ollamaUrl?: string) => Promise<string>;
  vectorSearch: (query: string, topK?: number, embedConfig?: ModelConfig, folderFilter?: string) =>
        Promise<VectorSearchResult[]>;
  bm25Build: () => Promise<void>;
  bm25Search: (query: string, topK?: number, folderFilter?: string) => Promise<VectorSearchResult[]>;
  multiSearch: (query: string, topK?: number, embedConfig?: ModelConfig, folderFilter?: string) =>
        Promise<VectorSearchResult[]>;
  vectorIndexBatch: (
    chunks: { noteId: string; chunkIndex: number; text: string }[],
    embeddings: number[][],
  ) => Promise<void>;
  summarizeNote: (content: string, noteTitle: string, modelConfig?: ModelConfig) => Promise<SummarizeResult>;
  listTagsWithCounts: () => Promise<TagWithCount[]>;
  getNotesByTag: (tagId: string) => Promise<NoteSummary[]>;
  listRecentNotes: (limit?: number) => Promise<RecentNote[]>;
  findNoteByTitle: (title: string) => Promise<RecentNote | null>;
  findNoteByPath: (prefix: string) => Promise<RecentNote | null>;
  findNoteByPathFlexible: (query: string) => Promise<RecentNote | null>;
  openWithDefaultApp: (path: string) => Promise<void>;
  tavilySearch: (query: string, apiKey: string) => Promise<TavilySearchResult>;
  agentStatus: () => Promise<AgentStatus>;
  agentStart: (pythonCmd: string, args: string[]) => Promise<AgentStatus>;
  agentStop: () => Promise<AgentStatus>;
  agentListTools: () => Promise<AgentToolInfo[]>;
  agentDeepResearch: (query: string) => Promise<unknown>;
  agentRunWorkflow: (definition: string, input: Record<string, unknown>) => Promise<AgentWorkflowResult>;
  agentRagListStrategies: () => Promise<AgentRagStrategy[]>;
  agentRagRun: (query: string, strategyId: string, modelConfig: ModelConfig, embedConfig?: ModelConfig, requestId?: string) => Promise<void>;
  agentRagMemoryLoad: () => Promise<unknown>;
  agentRagMemoryUpdateProfile: (text: string) => Promise<void>;
  agentRagMemoryClear: () => Promise<void>;
};

export function useTauriCommands(): TauriCommands {
  const call = useCallback(
    async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
      return invoke<T>(cmd, args);
    },
    [],
  );

  return useMemo(
    () => ({
      getHomeDir: () => call<string>("get_home_dir"),
      readFile: (path: string) => call<string>("read_file", { path }),
      writeFile: (path: string, content: string) => call<void>("write_file", { path, content }),
      listVault: (vaultPath: string) => call<FileEntry[]>("list_vault", { vaultPath }),
      createNote: (vaultPath: string, relativePath: string) =>
        call<string>("create_note", { vaultPath, relativePath }),
      createFolder: (vaultPath: string, relativePath: string) =>
        call<string>("create_folder", { vaultPath, relativePath }),
      deleteNote: (path: string, permanent: boolean) =>
        call<void>("delete_note", { path, permanent }),
      renameNote: (oldPath: string, newPath: string) =>
        call<void>("rename_note", { oldPath, newPath }),
      openVault: (path: string) => call<VaultInfo>("open_vault", { path }),
      switchVault: (path: string) => call<VaultInfo>("switch_vault", { path }),
      getVaultInfo: () => call<VaultInfo | null>("get_vault_info"),
      reindexVault: (embedConfig?: ModelConfig) =>
        call<IndexStats>("reindex_vault", {
          embedConfig: embedConfig ? modelConfigToTauriArgs(embedConfig) : undefined,
        }),
      searchNotes: (query: string) => call<SearchResult[]>("search_notes", { query }),
      getBacklinks: (targetTitle: string) =>
        call<Backlink[]>("get_backlinks", { targetTitle }),
      getGraphData: () =>
        call<GraphData>("get_graph_data"),
      getLocalGraph: (noteId: string, depth: number) =>
        call<GraphData>("get_local_graph", { noteId, depth }),
      ollamaEmbed: (text: string, model?: string, ollamaUrl?: string) =>
        call<EmbeddingResult>("ollama_embed", { text, model, ollamaUrl }),
      ollamaChat: (prompt: string, context: string[], model?: string, ollamaUrl?: string) =>
        call<string>("ollama_chat", { prompt, context, model, ollamaUrl }),
      modelChat: (prompt: string, context: string[], modelConfig: ModelConfig) =>
        call<string>("model_chat", { prompt, context, modelConfig: modelConfigToTauriArgs(modelConfig) }),
      modelChatStream: (prompt: string, context: string[], modelConfig: ModelConfig, requestId: string) =>
        call<void>("model_chat_stream", {
          prompt,
          context,
          modelConfig: modelConfigToTauriArgs(modelConfig),
          requestId,
        }),
      modelEmbed: (text: string, modelConfig: ModelConfig) =>
        call<EmbeddingResult>("model_embed", { text, modelConfig: modelConfigToTauriArgs(modelConfig) }),
      modelHealthCheck: (modelConfig: ModelConfig) =>
        call<boolean>("model_health_check", { modelConfig: modelConfigToTauriArgs(modelConfig) }),
      modelChatCheck: (modelConfig: ModelConfig) =>
        call<boolean>("model_chat_check", { modelConfig: modelConfigToTauriArgs(modelConfig) }),
      vectorSearch: (query: string, topK?: number, embedConfig?: ModelConfig, folderFilter?: string) =>
        call<VectorSearchResult[]>("vector_search", {
          query,
          topK,
          embedConfig: embedConfig ? modelConfigToTauriArgs(embedConfig) : undefined,
          folderFilter: folderFilter || undefined,
        }),
      bm25Build: () => call<void>("bm25_build"),
      bm25Search: (query: string, topK?: number, folderFilter?: string) =>
        call<VectorSearchResult[]>("bm25_search", {
          query,
          topK,
          folderFilter: folderFilter || undefined,
        }),
      multiSearch: (query: string, topK?: number, embedConfig?: ModelConfig, folderFilter?: string) =>
        call<VectorSearchResult[]>("multi_search", {
          query,
          topK,
          embedConfig: embedConfig ? modelConfigToTauriArgs(embedConfig) : undefined,
          folderFilter: folderFilter || undefined,
        }),
      vectorIndexBatch: (
        chunks: { noteId: string; chunkIndex: number; text: string }[],
        embeddings: number[][],
      ) => call<void>("vector_index_batch", { chunks, embeddings }),
      summarizeNote: (content: string, noteTitle: string, modelConfig?: ModelConfig) =>
        call<SummarizeResult>("summarize_note", {
          content,
          noteTitle,
          modelConfig: modelConfig ? modelConfigToTauriArgs(modelConfig) : undefined,
        }),
      listTagsWithCounts: () => call<TagWithCount[]>("list_tags_with_counts"),
      getNotesByTag: (tagId: string) =>
        call<NoteSummary[]>("get_notes_by_tag", { tagId }),
      listRecentNotes: (limit?: number) =>
        call<RecentNote[]>("list_recent_notes", { limit: limit ?? 50 }),
      findNoteByTitle: (title: string) =>
        call<RecentNote | null>("find_note_by_title", { title }),
      findNoteByPath: (prefix: string) =>
        call<RecentNote | null>("find_note_by_path", { prefix }),
      findNoteByPathFlexible: (query: string) =>
        call<RecentNote | null>("find_note_by_path_flexible", { query }),
      openWithDefaultApp: (path: string) =>
        call<void>("open_with_default_app", { path }),
      tavilySearch: (query: string, apiKey: string) =>
        call<TavilySearchResult>("tavily_search", { query, apiKey }),
      agentStatus: () => call<AgentStatus>("agent_status"),
      agentStart: (pythonCmd: string, args: string[]) =>
        call<AgentStatus>("agent_start", { pythonCmd, args }),
      agentStop: () => call<AgentStatus>("agent_stop"),
      agentListTools: () => call<AgentToolInfo[]>("agent_list_tools"),
      agentDeepResearch: (query: string) =>
        call<unknown>("agent_deep_research", { query }),
      agentRunWorkflow: (definition: string, input: Record<string, unknown>) =>
        call<AgentWorkflowResult>("agent_run_workflow", { definition, input }),
      agentRagListStrategies: () =>
        call<AgentRagStrategy[]>("agent_rag_list_strategies"),
      agentRagRun: (query: string, strategyId: string, modelConfig: ModelConfig, embedConfig?: ModelConfig, requestId?: string) =>
        call<void>("agent_rag_run", {
          query,
          strategyId,
          modelConfig: modelConfigToTauriArgs(modelConfig),
          embedConfig: embedConfig ? modelConfigToTauriArgs(embedConfig) : null,
          requestId: requestId || crypto.randomUUID(),
        }),
      agentRagMemoryLoad: () =>
        call<unknown>("agent_rag_memory_load"),
      agentRagMemoryUpdateProfile: (text: string) =>
        call<void>("agent_rag_memory_update_profile", { text }),
      agentRagMemoryClear: () =>
        call<void>("agent_rag_memory_clear"),
    }),
    [call],
  );
}