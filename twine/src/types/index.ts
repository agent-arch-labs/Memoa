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

export type PanelView = "files" | "search" | "tags" | "graph" | "daily" | "settings" | "knowledge" | "trade" | "review" | "insights" | "similar_k" | "themes" | "stocks" | "strategy" | "review_hub" | "timeline";

export type MaximizedPanel = "sidebar" | "editor" | "chat" | null;

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
  pendingStockPrompt: string | null;
  /** 中间面板当前显示的内容类型 */
  middlePanel: "editor" | "stock";
  /** 当前最大化面板，null 表示无最大化 */
  maximizedPanel: MaximizedPanel;
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
  type: "all" | "folder" | "file" | "stock";
  label: string;
  path?: string;
  kbId?: number;
  parentId?: number;
  category?: string;
  docId?: number;
  stockCode?: string;
  stockName?: string;
  stockMarket?: string;
}

export interface StockSuggestItem {
  code: string;
  market: "sh" | "sz" | "bj";
  fullCode: string;
  name: string;
  type: string;
  hasEsg: boolean;
  alias?: string;
}

export interface KLinePeriod {
  key: "min" | "daily" | "weekly" | "monthly";
  label: string;
}

export const KLINE_PERIODS: KLinePeriod[] = [
  { key: "min", label: "分时" },
  { key: "daily", label: "日K" },
  { key: "weekly", label: "周K" },
  { key: "monthly", label: "月K" },
];

export interface SinaQuoteField {
  code: string;
  name: string;
  open: number;
  yesterdayClose: number;
  current: number;
  high: number;
  low: number;
  // 五档买盘
  buy1Vol: number;
  buy1: number;
  buy2Vol: number;
  buy2: number;
  buy3Vol: number;
  buy3: number;
  buy4Vol: number;
  buy4: number;
  buy5Vol: number;
  buy5: number;
  // 五档卖盘
  sell1Vol: number;
  sell1: number;
  sell2Vol: number;
  sell2: number;
  sell3Vol: number;
  sell3: number;
  sell4Vol: number;
  sell4: number;
  sell5Vol: number;
  sell5: number;
  volume: number;
  amount: number;
  date: string;
  time: string;
  change: number;
  changePercent: number;
}

export interface BaoStockKLine {
  date: string;
  code: string;
  open: number;
  high: number;
  low: number;
  close: number;
  preclose: number;
  volume: number;
  amount: number;
  adjustflag: string;
  turn: number;
  tradestatus: string;
  pctChg: number;
  isST: boolean;
}

export interface BaoStockFinancial {
  code: string;
  pubDate: string;
  statDate: string;
  fields: Record<string, string | number>;
}

export interface BaoStockFinancialResult {
  profit: Record<string, string>[];
  growth: Record<string, string>[];
  balance: Record<string, string>[];
  cashFlow: Record<string, string>[];
  dupont: Record<string, string>[];
  operation: Record<string, string>[];
  express: Record<string, string>[];
  forecast: Record<string, string>[];
}

export interface ScreenerStock {
  code: string;
  name: string;
  isST: boolean;
  close: number;
  pctChg: number;
  volume: number;
  turn: number;
  highDays?: number;
  gainPct?: number;
  periodDays?: number;
  volRatio?: number;
  limitUpDays?: number;
  limitPrice?: number;
  // MA 指标
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  // MACD 指标
  dif?: number;
  dea?: number;
  macdHist?: number;
  // KDJ 指标
  k?: number;
  d?: number;
  j?: number;
  // RSI 指标
  rsi?: number;
  rsiPrev?: number;
  // BOLL 指标
  bollUpper?: number;
  bollMid?: number;
  bollLower?: number;
}

export interface ScreenerResult {
  action: string;
  stocks: ScreenerStock[];
  cached: boolean;
  updatedAt: string;
}

// 概念板块时序图
export interface LeadingStockItem {
  code: string;
  name: string;
  changePercent: number;
}

export interface ConceptBoardItem {
  code: string;
  name: string;
  changePercent: number;
  price: number;
  upCount: number;
  downCount: number;
  leadingCode: string;
  leadingName: string;
  leadingChange: number;
  amount: number;
  topLeadingStocks: LeadingStockItem[];
}

export interface ConceptDayData {
  date: string;
  concepts: ConceptBoardItem[];
}

export interface ConceptTimelineResult {
  days: ConceptDayData[];
  cached: boolean;
  updatedAt: string;
}

export interface IndustryDayData {
  date: string;
  industries: ConceptBoardItem[];
}

export interface IndustryTimelineResult {
  days: IndustryDayData[];
  cached: boolean;
  updatedAt: string;
}

export interface SyncStatus {
  status: string;
  total: number;
  synced: number;
  skipped?: number;
  errors?: number;
  startTime?: string;
  finishTime?: string;
  lastCode?: string;
  stockCount: number;
  mode?: string;
}

export interface DailySyncStatus {
  status: string;
  total: number;
  synced: number;
  gaps: number;
  backfilled: number;
  errors: number;
  lastSyncDate?: string;
  startTime?: string;
  finishTime?: string;
}

export interface EastStockInfo {
  code: string;
  name: string;
  industry: string;
  region: string;
  concepts: string[];
}

export interface MarketIndex {
  code: string;
  name: string;
  market: string;
  price: number;
  changePercent: number;
  change: number;
}

export type TradeAction = "buy" | "sell" | "add" | "reduce" | "clear";
export type TradeEmotion = "greed" | "fear" | "rational" | "fomo" | "panic";
export type InsightCategory = "psychology" | "technical" | "fundamental" | "theme" | "risk" | "market" | "reading";
export type ThemeCategory = "policy" | "industry" | "event" | "cyclical";
export type ThemeLifecycle = "sprout" | "explode" | "differentiate" | "ebb";
export type StrategyType = "day_trade" | "swing" | "trend" | "value" | "custom";

export interface TradeEntry {
  id: string;
  stockCode: string;
  stockName: string;
  market: "sh" | "sz" | "bj";
  action: TradeAction;
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  reason: string;
  emotion: TradeEmotion;
  strategy?: string;
  themes: string[];
  reviewDate?: string;
  pnl?: number;
  costBasis?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  stockCode: string;
  stockName: string;
  quantity: number;
  costBasis: number;
  currentPrice?: number;
  floatingPnl?: number;
  floatingPnlPercent?: number;
  lastUpdated: string;
}

export interface ReviewEntry {
  id: string;
  date: string;
  period: "daily" | "weekly" | "monthly";
  marketOverview: string;
  sectorRotation: string;
  tradeSummary: string;
  mistakes: string;
  lessons: string;
  nextPlan: string;
  linkedTrades: string[];
  linkedInsights: string[];
  createdAt: string;
}

export interface InsightEntry {
  id: string;
  title: string;
  category: InsightCategory;
  content: string;
  tags: string[];
  relatedStocks: string[];
  relatedTrades: string[];
  relatedReviews: string[];
  confidence: number;
  verified: boolean;
  verificationNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeEntry {
  id: string;
  name: string;
  category: ThemeCategory;
  lifecycle: ThemeLifecycle;
  description: string;
  leadingStocks: { code: string; name: string; role: string; boardHeight: number }[];
  relatedStocks: string[];
  parentTheme?: string;
  childThemes: string[];
  competingThemes: string[];
  keyCatalysts: { date: string; event: string; impact: string }[];
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockProfile {
  code: string;
  name: string;
  market: "sh" | "sz" | "bj";
  industry: string;
  sector: string;
  researchNotes: string;
  themes: string[];
  tradeHistory: string[];
  relatedInsights: string[];
  watchLevel: "none" | "watching" | "holding" | "focus";
  group: string;
  pinned: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockGroup {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

export interface StrategyEntry {
  id: string;
  name: string;
  type: StrategyType;
  entryConditions: string;
  exitConditions: string;
  riskManagement: {
    maxPosition: number;
    stopLoss: number;
    takeProfit: number;
    maxDailyLoss: number;
  };
  applicableThemes: string[];
  applicablePatterns: string[];
  executionLog: { date: string; action: string; result: string; pnl: number; notes: string }[];
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface KLinePattern {
  id: string;
  stockCode: string;
  stockName: string;
  startDate: string;
  endDate: string;
  pattern: string;
  features: {
    shape: string;
    volumeTrend: string;
    macdSignal?: string;
    kdjSignal?: string;
    pricePosition: string;
  };
  outcome: {
    direction: "up" | "down" | "sideways";
    changePercent5d?: number;
    changePercent10d?: number;
    changePercent20d?: number;
    maxDrawdown?: number;
  };
}