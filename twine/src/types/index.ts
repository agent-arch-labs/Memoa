export interface Note {
  id: string;
  title: string;
  path: string;
  content: string;
  checksum: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  frontmatter: Record<string, unknown>;
}

export interface VaultInfo {
  name: string;
  path: string;
  note_count: number;
  last_indexed_at: string | null;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  snippet: string;
  score: number;
  updated_at: string;
}

export interface VectorSearchResult {
  note_id: string;
  note_title: string;
  chunk_index: number;
  text: string;
  score: number;
  chunk_offset: number;
  chunk_length: number;
}

export interface Backlink {
  id: string;
  source_title: string;
  source_path: string;
  context: string;
  line: number;
}

export interface GraphNode {
  id: string;
  title: string;
  path: string;
  link_count: number;
  incoming_count: number;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TagWithCount {
  id: string;
  name: string;
  count: number;
}

export interface NoteSummary {
  id: string;
  title: string;
  path: string;
}

export interface RecentNote extends NoteSummary {
  updated_at: string;
}

export interface IndexStats {
  total_notes: number;
  new_notes: number;
  updated_notes: number;
  skipped_notes: number;
  errors: string[];
}

export interface SummarizeResult {
  summary: string;
  key_points: string[];
}

export interface EmbeddingResult {
  embedding: number[];
  token_count: number;
}

export interface TavilySearchResult {
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  answer: string | null;
}

export interface AgentStatus {
  running: boolean;
  pid: number | null;
  python_cmd: string;
  args: string[];
  tools: AgentToolInfo[];
}

export interface AgentToolInfo {
  name: string;
  description: string;
  input_schema: Record<string, unknown> | null;
}

export interface AgentWorkflowResult {
  workflow_name: string;
  status: string;
  node_results: AgentNodeResult[];
  final_output: unknown;
  total_duration_ms: number;
  error: string | null;
}

export interface AgentNodeResult {
  node_id: string;
  node_type: string;
  status: string;
  output: unknown;
  duration_ms: number;
  error: string | null;
}

export interface AgentRagStrategy {
  id: string;
  name: string;
  description: string;
}

export interface AgentRagStepEvent {
  step_type: "tool_call" | "tool_result" | "reasoning" | "route_decision" | "token" | "done" | "error";
  tool?: string;
  params?: Record<string, unknown>;
  summary?: string;
  detail?: unknown;
  text?: string;
  router?: string;
  decision?: string;
  token?: string;
  answer?: string;
  sources?: AgentRagSource[];
  message?: string;
}

export interface AgentRagSource {
  note_id: string;
  note_title: string;
  note_path: string;
  chunk_index: number;
  text: string;
  score: number;
  chunk_offset: number;
  chunk_length: number;
}

export type PanelView = "files" | "search" | "tags" | "graph" | "daily" | "settings" | "knowledge";

export interface AppState {
  vaultPath: string | null;
  vaultInfo: VaultInfo | null;
  currentNotePath: string | null;
  currentNoteContent: string;
  sidebarVisible: boolean;
  chatVisible: boolean;
  sidebarView: PanelView;
  isDark: boolean;
  isEditing: boolean;
  searchQuery: string;
  chatMessages: ChatMessage[];
  isIndexing: boolean;
  chatMode: ChatMode;
  contextTarget: ContextTarget;
  dataSource: DataSource;
  tagRefreshKey: number;
  graphRefreshKey: number;
  splitNotePath: string | null;
  splitNoteContent: string;
  highlightText: string | null;
  highlightOffset: number;
  highlightLength: number;
  settingsVisible: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: MessageSource[];
  timestamp: number;
  feedback?: "like" | "dislike" | null;
}

export interface MessageSource {
  noteTitle: string;
  notePath: string;
  snippet: string;
  chunkText?: string;
  score: number;
  chunkOffset: number;
  chunkLength: number;
}

export type ChatMode = "local" | "online" | "agent" | "knowledge";

export type AnswerMode = "rag" | "agent" | "deepresearch" | "agent_rag";

export type DataSource = "local" | "online" | string;

export interface ContextTarget {
  type: "all" | "folder" | "file";
  label: string;
  path?: string;
  kbId?: number;
  parentId?: number;
  category?: string;
  docId?: number;
}