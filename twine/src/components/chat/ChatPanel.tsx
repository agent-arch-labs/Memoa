import { useState, useEffect, useRef, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { useSettingsStore, getActiveLlmConfig } from "@/stores/settingsStore";
import { IconAdd, IconHistory, IconFile, IconLetterStock, IconClose, IconKnowledge, IconSearch, IconFolder, IconWindowMaximize, IconWindowRestore } from "@/components/common/Icons";
import { useConversationStore } from "@/stores/conversationStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { ChatInputArea, type SelectedRef } from "./ChatInputArea";
import { ChatMessageList } from "./ChatMessageList";
import { buildSearchRequest } from "../settings/SearchExtensionsSettings";
import { loadConfig } from "../settings/KnowledgeBaseSettings";
import type { ChatMessage, MessageSource, ChatMode, AnswerMode, DataSource, AgentRagStepEvent, AgentRagSource } from "@/types";
import { useSearchExtensions } from "@/hooks/useSearchExtensions";
import { useChatStreaming } from "@/hooks/useChatStreaming";

interface StreamChunk {
  content: string;
  done: boolean;
}

interface ChatPanelProps {
  width: number;
}

export function ChatPanel({ width }: ChatPanelProps) {
  const commands = useTauriCommands();
  const conversations = useConversationStore((s) => s.conversations);
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const createConversation = useConversationStore((s) => s.createConversation);
  const addMessageToConversation = useConversationStore((s) => s.addMessageToConversation);
  const updateMessageInConversation = useConversationStore((s) => s.updateMessageInConversation);
  const updateMessageSourcesInConversation = useConversationStore((s) => s.updateMessageSourcesInConversation);
  const updateMessageFeedbackInConversation = useConversationStore((s) => s.updateMessageFeedbackInConversation);
  const updateLastMessageContent = useConversationStore((s) => s.updateLastMessageContent);
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const chatMessages: ChatMessage[] = activeConversation?.messages ?? [];

  const toggleChat = useAppStore((s) => s.toggleChat);
  const maximizedPanel = useAppStore((s) => s.maximizedPanel);
  const toggleMaximizePanel = useAppStore((s) => s.toggleMaximizePanel);
  const currentNoteContent = useAppStore((s) => s.currentNoteContent);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);
  const contextTarget = useAppStore((s) => s.contextTarget);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const dataSource = useAppStore((s) => s.dataSource);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const pendingStockPrompt = useAppStore((s) => s.pendingStockPrompt);
  const setPendingStockPrompt = useAppStore((s) => s.setPendingStockPrompt);
  const hasStockTarget = useStockDetailStore((s) => s.target !== null);

  // 自动发送股票分析提示词
  useEffect(() => {
    if (pendingStockPrompt) {
      const promptText = pendingStockPrompt;
      setPendingStockPrompt(null);
      setInput("");
      // 股票分析使用联网数据源（Tavily），直接传入覆盖数据源
      sendMessage(promptText, "online");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingStockPrompt]);
  const settings = useSettingsStore();
  const activeLlmConfig = getActiveLlmConfig(settings);
  const { extensions } = useSearchExtensions();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [selectedRefs, setSelectedRefs] = useState<SelectedRef[]>([]);

  const initialAnswerMode: AnswerMode = chatMode === "agent" ? "agent" : "rag";
  const [answerMode, setAnswerMode] = useState<AnswerMode>(initialAnswerMode);
  const [availableAnswerModes, setAvailableAnswerModes] = useState<AnswerMode[]>(["rag"]);
  const [availableDataSources, setAvailableDataSources] = useState<DataSource[]>(["local"]);

  function handleToggleSourceExpand(msgId: string) {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }

  useEffect(() => {
    const sources: DataSource[] = ["local"];
    if (extensions.tavilyApiKey && extensions.tavilyEnabled) {
      sources.push("online");
    }
    for (const cs of extensions.customSearches) {
      if (cs.enabled) {
        sources.push(cs.id);
      }
    }
    const knowledgeConfig = loadConfig();
    if (knowledgeConfig.endpoint.trim()) {
      sources.push("knowledge");
    }
    setAvailableDataSources(sources);
    console.log("[ChatPanel] mount available data sources:", sources);

    commands.agentStatus().then((status) => {
      const modes: AnswerMode[] = ["rag", "agent_rag"];
      if (status.running) {
        modes.push("agent", "deepresearch");
      }
      setAvailableAnswerModes(modes);
      if (!modes.includes(answerMode)) {
        setAnswerMode("rag");
        syncModesToStore("rag", dataSource);
      }
    }).catch(() => {
      setAvailableAnswerModes(["rag", "agent_rag"]);
    });
  }, []);

  useEffect(() => {
    console.log("[ChatPanel] effect available changed", { availableAnswerModes, availableDataSources, answerMode, dataSource });
    if (!availableAnswerModes.includes(answerMode)) {
      setAnswerMode("rag");
      syncModesToStore("rag", dataSource);
    }
    if (!availableDataSources.includes(dataSource)) {
      setDataSource("local");
      syncModesToStore(answerMode, "local");
    }
  }, [availableAnswerModes, availableDataSources]);

  useEffect(() => {
    console.log("[ChatPanel] effect dataSource changed", { dataSource, answerMode });
    syncModesToStore(answerMode, dataSource);
  }, [dataSource]);

  useEffect(() => {
    if (!zoomedImage) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setZoomedImage(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [zoomedImage]);

  function deriveChatMode(am: AnswerMode, ds: DataSource): ChatMode {
    if (am !== "rag") return "agent";
    if (ds === "knowledge") return "knowledge";
    if (ds === "online" || ds !== "local") return "online";
    return "local";
  }

  function syncModesToStore(am: AnswerMode, ds: DataSource) {
    setChatMode(deriveChatMode(am, ds));
  }

  const { currentRequestIdRef, throttledUpdate, flushPending, cancelStream } = useChatStreaming(
    (msgId, content, convId) => {
      updateMessageInConversation(convId, msgId, content);
      updateLastMessageContent(convId, content);
    },
  );

  const genRef = useRef(0);
  const agentCancelRef = useRef<(() => void) | null>(null);

  const handleCancel = useCallback(async () => {
    const cancelGen = genRef.current;
    await cancelStream();
    if (genRef.current !== cancelGen) return;
    agentCancelRef.current?.();
    agentCancelRef.current = null;
    setLoading(false);
    setStreamingMsgId(null);
  }, [cancelStream]);

  function setAnswerModeAndSync(am: AnswerMode) {
    setAnswerMode(am);
    syncModesToStore(am, dataSource);
  }

  function setDataSourceAndSync(ds: DataSource) {
    setDataSource(ds);
    syncModesToStore(answerMode, ds);
  }

  async function sendMessage(overrideText?: string, overrideDataSource?: DataSource) {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    // 如果指定了覆盖数据源，立即应用
    const effectiveDataSource = overrideDataSource || dataSource;
    if (overrideDataSource) {
      setDataSource(overrideDataSource);
    }
    const effectiveChatMode = deriveChatMode(answerMode, effectiveDataSource);

    if (!overrideText) setInput("");
    setLoading(true);
    const currentGen = ++genRef.current;

    const convId = activeConversationId || createConversation(text.slice(0, 50));

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      sources: [],
      timestamp: Date.now(),
    };
    addMessageToConversation(convId, userMsg);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      timestamp: Date.now(),
    };
    addMessageToConversation(convId, assistantMsg);

    setStreamingMsgId(assistantId);

    try {
      const contexts: string[] = [];
      const sources: MessageSource[] = [];

      if (!activeLlmConfig) {
        throw new Error("未配置 AI 模型");
      }

      console.log(
        `[sendMessage] chatMode="${effectiveChatMode}" dataSource="${effectiveDataSource}" answerMode="${answerMode}" contextTarget=`,
        contextTarget
      );

      if (effectiveChatMode === "agent") {
        if (answerMode === "agent_rag") {
          const requestId = crypto.randomUUID();
          currentRequestIdRef.current = requestId;
          const eventName = `agent-rag-${requestId}`;

          const { embeddingConfig } = useSettingsStore.getState();
          const activeEmbedConfig = embeddingConfig?.provider
            ? embeddingConfig
            : undefined;

          let unlisten: UnlistenFn | undefined;
          let fullText = "";
          let cancelled = false;
          let resolveDone: (() => void) | undefined;
          const donePromise = new Promise<void>((resolve) => {
            resolveDone = resolve;
          });

          agentCancelRef.current = () => {
            cancelled = true;
            resolveDone?.();
          };

          try {
            unlisten = await listen<AgentRagStepEvent>(eventName, (event) => {
              if (cancelled) return;
              const evt = event.payload;

              if (evt.step_type === "token" && evt.token) {
                fullText += evt.token;
                updateMessageInConversation(convId, assistantId, fullText);
                updateLastMessageContent(convId, fullText);
              }
              if (evt.step_type === "done") {
                if (evt.answer) {
                  updateMessageInConversation(convId, assistantId, evt.answer);
                  updateLastMessageContent(convId, evt.answer);
                } else {
                  updateMessageInConversation(
                    convId,
                    assistantId,
                    "Agent RAG 完成了思考，但没有产生回答。",
                  );
                  updateLastMessageContent(
                    convId,
                    "Agent RAG 完成了思考，但没有产生回答。",
                  );
                }
                if (evt.sources && evt.sources.length > 0) {
                  const msgs: MessageSource[] = evt.sources.map(
                    (s: AgentRagSource) => ({
                      noteTitle: s.note_title,
                      notePath: s.note_path,
                      snippet: s.text.slice(0, 200),
                      score: s.score,
                      chunkOffset: s.chunk_offset,
                      chunkLength: s.chunk_length,
                    }),
                  );
                  updateMessageSourcesInConversation(convId, assistantId, msgs);
                }
                resolveDone?.();
              }
              if (evt.step_type === "error") {
                updateMessageInConversation(
                  convId,
                  assistantId,
                  `Agent RAG 错误: ${evt.message}`,
                );
                updateLastMessageContent(
                  convId,
                  `Agent RAG 错误: ${evt.message}`,
                );
                resolveDone?.();
              }
            });

            await commands.agentRagRun(
              text,
              "auto",
              activeLlmConfig!,
              activeEmbedConfig,
              requestId,
            );

            await donePromise;
          } catch (e) {
            const errMsg = `Agent RAG 错误: ${e}`;
            updateMessageInConversation(convId, assistantId, errMsg);
            updateLastMessageContent(convId, errMsg);
          } finally {
            agentCancelRef.current = null;
            currentRequestIdRef.current = null;
            if (unlisten) unlisten();
          }

          if (genRef.current === currentGen) {
            setLoading(false);
            setStreamingMsgId(null);
          }
          return;
        }

        let augmentedQuery = text;
        const agentSources: MessageSource[] = [];

        if (effectiveDataSource !== "local" && effectiveDataSource !== "online") {
          const tool = extensions.customSearches.find((s) => s.id === effectiveDataSource);
          if (tool) {
            try {
              const resp = await fetch(tool.url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(tool.apiKey ? { Authorization: `Bearer ${tool.apiKey}` } : {}),
                },
                body: JSON.stringify(buildSearchRequest(text, 5)),
              });
              const data = await resp.json();
              const results: Array<Record<string, unknown>> = data.results || [];
              const searchCtx: string[] = [];
              for (const r of results) {
                const title = String(r.title || "");
                const url = String(r.url || "");
                const content = String(r.content || r.snippet || "");
                const score = Number(r.score) || 0.5;
                searchCtx.push(`[${title}](${url}) score:${score.toFixed(2)}\n${content}`);
                agentSources.push({
                  noteTitle: title,
                  notePath: url,
                  snippet: content.slice(0, 200),
                  score,
                  chunkOffset: 0,
                  chunkLength: 0,
                });
              }
              if (searchCtx.length > 0) {
                augmentedQuery = `${text}\n\n[检索工具: ${tool.name}]\n以下是从外部检索工具获取的参考信息：\n\n${searchCtx.join("\n\n")}\n\n请基于以上参考信息回答用户问题。`;
              }
            } catch {
              // continue with original query if search fails
            }
          }
        }

        currentRequestIdRef.current = null;
        try {
          const result = await commands.agentDeepResearch(augmentedQuery);
          const resultStr = typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
          updateMessageInConversation(convId, assistantId, resultStr);
          updateLastMessageContent(convId, resultStr);

          if (agentSources.length > 0) {
            updateMessageSourcesInConversation(convId, assistantId, agentSources);
          } else if (typeof result === "object" && result !== null) {
            const resultObj = result as Record<string, unknown>;
            if (Array.isArray(resultObj.sources)) {
              const parsedSources: MessageSource[] = (resultObj.sources as Array<Record<string, unknown>>).map((s) => ({
                noteTitle: String(s.title || "Agent Source"),
                notePath: String(s.url || ""),
                snippet: String(s.content || "").slice(0, 200),
                score: Number(s.score || 0.5),
                chunkOffset: 0,
                chunkLength: 0,
              }));
              updateMessageSourcesInConversation(convId, assistantId, parsedSources);
            }
          }
        } catch (e) {
          const errMsg = `Agent 错误: ${e}\n\n请确保 Agent 已启动（设置 -> AI Agent -> 启动 Agent）。`;
          updateMessageInConversation(convId, assistantId, errMsg);
          updateLastMessageContent(convId, errMsg);
        }
        if (genRef.current === currentGen) {
          setLoading(false);
          setStreamingMsgId(null);
        }
        return;
      }

      if (effectiveChatMode === "knowledge") {
        const kbConfig = loadConfig();
        if (!kbConfig.endpoint.trim()) {
          contexts.push("[提示] 知识库服务未配置（设置 -> 知识库）。");
        } else {
          const raw = kbConfig.endpoint.trim().replace(/\/+$/, "");
          const baseUrl = raw.startsWith("http") ? raw : `http://${raw}`;
          const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (kbConfig.apiKey.trim()) {
            reqHeaders["Authorization"] = `Bearer ${kbConfig.apiKey.trim()}`;
          }

          const filters: Record<string, unknown> = { source_type: "document" };
          if (contextTarget.type === "file" && contextTarget.docId) {
            filters.document_ids = [contextTarget.docId];
            if (contextTarget.kbId) filters.knowledge_base_ids = [contextTarget.kbId];
          } else if (contextTarget.type === "folder") {
            if (contextTarget.category) filters.category = contextTarget.category;
            if (contextTarget.kbId) filters.knowledge_base_ids = [contextTarget.kbId];
            if (contextTarget.parentId) filters.parent_filenode_ids = [contextTarget.parentId];
          }

          try {
            const resp = await fetch(`${baseUrl}/api/enhanced_search/v1/retrieval/`, {
              method: "POST",
              headers: reqHeaders,
              body: JSON.stringify({
                query: text,
                search_type: "hybrid",
                top_k: kbConfig.topK || 10,
                score_threshold: kbConfig.threshold ?? 0.5,
                filters,
                include_metadata: true,
                include_highlights: true,
              }),
            });

            if (!resp.ok) {
              console.warn(`[知识库检索] HTTP ${resp.status}`);
              throw new Error(`HTTP ${resp.status}`);
            }

            const data = await resp.json();
            const results: Array<Record<string, unknown>> = data?.data?.results || data?.results || [];

            console.log(
              `[知识库检索] query="${text.slice(0, 80)}" filters=${JSON.stringify(filters)} results=${results.length} total=${data?.data?.total ?? data?.total ?? "?"}`
            );

            const refEntries: string[] = [];
            let hasImages = false;
            for (let i = 0; i < results.length; i++) {
              const item = results[i];
              const title = String(item.title || "未命名文档");
              const content = String(item.content || "");
              const highlights = String(item.highlights || "");
              const score = Number(item.score || 0);
              const metadata = (item.metadata || {}) as Record<string, unknown>;

              console.log(`  [${score.toFixed(3)}] ${title}`);

              const kbName = String(metadata.knowledge_base_name || "");
              const folderName = String(metadata.parent_filenode_name || "");
              const fileType = String(metadata.file_type || "");
              const uploader = String(metadata.uploader || "");
              const isImage = Boolean(metadata.is_image);
              const imageUrl = String(metadata.image_url || "");

              const metaParts = [
                kbName && `📚${kbName}`,
                folderName && `📁${folderName}`,
                fileType,
                uploader && `👤${uploader}`,
                `相关度: ${(score * 100).toFixed(1)}%`,
              ].filter(Boolean);
              const highlightText = highlights
                ? `\n>> ${highlights.replace(/\n/g, "\n>> ")}`
                : "";

              if (isImage && imageUrl) {
                hasImages = true;
                contexts.push(
                  `[来源 ${i + 1}] ${title}\n${metaParts.join(" · ")}\n` +
                  `**⚠️ 图片片段**\n` +
                  `- 描述：${content}\n` +
                  `- URL：${imageUrl}\n` +
                  `- **要求：在回答中必须用 Markdown 输出该图片 \`![${content.slice(0, 50)}](${imageUrl})\`**\n${highlightText}`
                );
                refEntries.push(
                  `[${i + 1}] ${title}${kbName ? ` (${kbName})` : ""} ${(score * 100).toFixed(0)}% 🖼️`
                );
              } else {
                contexts.push(
                  `[来源 ${i + 1}] ${title}\n${metaParts.join(" · ")}\n\n${content}${highlightText}`
                );
                refEntries.push(
                  `[${i + 1}] ${title}${kbName ? ` (${kbName})` : ""} ${(score * 100).toFixed(0)}%`
                );
              }

              sources.push({
                noteTitle: title,
                notePath: String(metadata.document_id || item.id || ""),
                snippet: content.slice(0, 200),
                score,
                chunkOffset: 0,
                chunkLength: 0,
              });
            }

            if (hasImages) {
              contexts.push(`---\n🖼️ **图片渲染规则**：上述来源中标记为"图片片段"的内容，必须在回答中使用 Markdown 图片语法输出。不要忽略图片片段，也不要仅用文字描述图片，必须输出 \`![描述](URL)\` 以便在回答中直接渲染图片。`);
            }
            if (refEntries.length > 0) {
              contexts.push(`---\n📋 请在回答中引用来源编号（如 [1][2]），引用格式示例: "[1] 根据..."\n${refEntries.join("\n")}`);
            }
          } catch (e) {
            contexts.push(`[知识库检索失败] ${String(e).slice(0, 300)}`);
          }
        }
      } else if (effectiveChatMode === "local") {

        if (contextTarget.type === "file" && currentNoteContent) {
          const title = currentNotePath?.split("/").pop() || "";
          contexts.push(`[当前文档: ${title}]\n${currentNoteContent.slice(0, 4000)}`);
          sources.push({
            noteTitle: title,
            notePath: currentNotePath || "",
            snippet: currentNoteContent.slice(0, 200),
            score: 1.0,
            chunkOffset: 0,
            chunkLength: 0,
          });
        }

        // 股票分析上下文
        if (contextTarget.type === "stock" && contextTarget.stockCode) {
          const stockCtx = `[股票分析: ${contextTarget.stockName || contextTarget.stockCode} (${contextTarget.stockMarket?.toUpperCase()}${contextTarget.stockCode})]\n请对该股票进行深度技术分析和基本面分析。`;
          contexts.push(stockCtx);
        }

        if (selectedRefs.length > 0 && vaultPath) {
          const fileRefs = selectedRefs.filter((r) => r.type === "file");
          const folderRefs = selectedRefs.filter((r) => r.type === "folder");

          for (const ref of fileRefs) {
            try {
              const content = await commands.readFile(vaultPath + "/" + ref.path);
              const title = ref.name;
              contexts.push(`[引用文档: ${title}]\n${content.slice(0, 3000)}`);
              sources.push({
                noteTitle: title,
                notePath: ref.path,
                snippet: content.slice(0, 200),
                score: 1.0,
                chunkOffset: 0,
                chunkLength: 0,
              });
            } catch {
              // skip unreadable files
            }
          }

          if (folderRefs.length > 0) {
            const folderFilter = folderRefs.map((r) => r.path).join("|");
            try {
              const embedConfig = {
                provider: settings.embeddingConfig.provider,
                modelId: settings.embeddingConfig.modelId,
                apiUrl: settings.embeddingConfig.apiUrl,
                apiKey: settings.embeddingConfig.apiKey,
              };
              const results = await commands.multiSearch(text, 3, embedConfig, folderFilter);
              for (const r of results) {
                if (!contexts.some((c) => c.includes(r.note_title))) {
                  contexts.push(`[${r.note_title}]\n${r.text}`);
                  sources.push({
                    noteTitle: r.note_title,
                    notePath: r.note_id,
                    snippet: r.text.slice(0, 120),
                    chunkText: r.text,
                    score: r.score,
                    chunkOffset: r.chunk_offset,
                    chunkLength: r.chunk_length,
                  });
                }
              }
            } catch {
              // folder search fallback
            }
          }
        }

        if (selectedRefs.length === 0) {
          const folderFilter = contextTarget.type === "folder" ? contextTarget.path : undefined;
          try {
            const embedConfig = {
              provider: settings.embeddingConfig.provider,
              modelId: settings.embeddingConfig.modelId,
              apiUrl: settings.embeddingConfig.apiUrl,
              apiKey: settings.embeddingConfig.apiKey,
            };
            const results = await commands.multiSearch(text, 5, embedConfig, folderFilter);
            if (results.length > 0) {
              for (const r of results) {
                const scorePct = (r.score * 100).toFixed(0);
                const header = r.note_title ? `${r.note_title} (${scorePct}%)` : `来源 (${scorePct}%)`;
                contexts.push(`## 📄 ${header}\n\n${r.text}`);
                sources.push({
                  noteTitle: r.note_title,
                  notePath: r.note_id,
                  snippet: r.text.slice(0, 120),
                  chunkText: r.text,
                  score: r.score,
                  chunkOffset: r.chunk_offset,
                  chunkLength: r.chunk_length,
                });
              }
            } else {
              contexts.push("> 本地文件中暂未找到直接相关的内容，请尝试换个问法或确认相关笔记已存在。\n\n建议：请确保已完成文件索引（设置 → 重建索引），且向量化模型服务已正常运行。");
            }
          } catch (e) {
            const errStr = String(e).slice(0, 200);
            contexts.push(`> 多路检索失败(${errStr})。\n\n请检查：\n1. 设置中是否已配置向量化模型\n2. 向量化模型服务是否正在运行\n3. 是否已构建文件索引`);
            if (currentNoteContent && currentNotePath) {
              const title = currentNotePath.split("/").pop() || "";
              contexts.push(`[当前打开的笔记: ${title}]\n${currentNoteContent.slice(0, 2000)}`);
            }
          }
        }
      } else if (effectiveChatMode === "online") {
        if (effectiveDataSource !== "local" && effectiveDataSource !== "online") {
          const cs = extensions.customSearches.find((s) => s.id === effectiveDataSource);
          if (cs) {
            try {
              const resp = await fetch(cs.url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(cs.apiKey ? { Authorization: `Bearer ${cs.apiKey}` } : {}),
                },
                body: JSON.stringify(buildSearchRequest(text, 10)),
              });
              const data = await resp.json();
              const results: Array<Record<string, unknown>> = data.results || [];
              for (const r of results) {
                const title = String(r.title || "");
                const url = String(r.url || "");
                const content = String(r.content || r.snippet || "");
                const score = Number(r.score) || 0.5;
                const metadata = r.metadata ? ` [${JSON.stringify(r.metadata)}]` : "";
                contexts.push(`[${title}](${url})\n${content}${metadata}`);
                const extra = r.highlights ? ` · ${String(r.highlights).slice(0, 100)}` : "";
                sources.push({
                  noteTitle: title,
                  notePath: url,
                  snippet: content.slice(0, 200) + extra,
                  score,
                  chunkOffset: 0,
                  chunkLength: 0,
                });
              }
            } catch (e) {
              contexts.push(`[${cs.name} 检索失败] ${e}`);
            }
          }
        } else if (extensions.tavilyEnabled && extensions.tavilyApiKey) {
          try {
            const result = await commands.tavilySearch(text, extensions.tavilyApiKey);
            if (result.answer) {
              contexts.push(`[Tavily 摘要]\n${result.answer}`);
            }
            for (const r of result.results) {
              contexts.push(`[${r.title}](${r.url})\n${r.content}`);
              sources.push({
                noteTitle: r.title,
                notePath: r.url,
                snippet: r.content.slice(0, 200),
                score: r.score,
                chunkOffset: 0,
                chunkLength: 0,
              });
            }
          } catch (e) {
            contexts.push(`[Tavily 检索失败] ${e}`);
          }
        } else {
          contexts.push("[提示] 联网模式需要配置 Tavily API Key（设置 -> 检索扩展 -> Tavily）。");
        }
      }

      const seenSources = new Map<string, MessageSource>();
      for (const s of sources) {
        const key = `${s.notePath}::${s.chunkOffset}`;
        seenSources.set(key, s);
      }
      const dedupedSources = Array.from(seenSources.values());

      updateMessageSourcesInConversation(convId, assistantId, dedupedSources);

      const requestId = crypto.randomUUID();
      currentRequestIdRef.current = requestId;
      const eventName = `chat-stream-${requestId}`;
      let fullContent = "";
      let chunkCount = 0;
      let unlisten: UnlistenFn | null = null;

      console.log(`[ChatPanel] stream start requestId=${requestId} contexts=${contexts.length} model=${activeLlmConfig?.modelId}`);

      try {
        unlisten = await listen<StreamChunk>(eventName, (event) => {
          const chunk = event.payload;
          chunkCount++;
          if (chunk.content) {
            fullContent += chunk.content;
            throttledUpdate(assistantId, fullContent, convId);
          }
          if (chunk.done) {
            return;
          }
        });

        await commands.modelChatStream(text, contexts, activeLlmConfig, requestId);
        console.log(`[ChatPanel] stream end requestId=${requestId} chunkCount=${chunkCount} contentLen=${fullContent.length}`);
      } finally {
        if (unlisten) unlisten();
      }

      if (genRef.current === currentGen) {
        flushPending();
        if (!fullContent) {
          console.warn(`[ChatPanel] stream empty requestId=${requestId} chunkCount=${chunkCount} model=${activeLlmConfig?.modelId}`);
        }
        if (fullContent.startsWith("错误") || fullContent.startsWith("API") || fullContent.startsWith("模型调用失败") || fullContent.startsWith("Ollama") || fullContent.startsWith("智谱")) {
          console.error(`[ChatPanel] stream error: ${fullContent.slice(0, 200)}`);
        }
        const finalContent = fullContent || "模型未返回任何内容，请检查：\n1. 模型 API 地址和密钥是否配置正确\n2. 模型服务是否正常运行\n3. 网络连接是否正常\n\n可打开浏览器开发者工具 (F12) 查看 Console 中的详细错误日志。";
        updateMessageInConversation(convId, assistantId, finalContent);
        updateLastMessageContent(convId, finalContent);
      }
    } catch (e) {
      console.error(`[ChatPanel] sendMessage error:`, e);
      const errMsg = `错误: ${e}\n\n请检查模型配置是否正确，并确保服务已启动。`;
      updateMessageInConversation(convId, assistantId, errMsg);
      updateLastMessageContent(convId, errMsg);
    } finally {
      if (genRef.current === currentGen) {
        setLoading(false);
        setStreamingMsgId(null);
        currentRequestIdRef.current = null;
      }
    }
  }

  async function handleRegenerate(msgId: string) {
    if (loading) return;

    const state = useConversationStore.getState();
    const currentConv = state.conversations.find((c) => c.id === state.activeConversationId);
    const msgs = currentConv?.messages ?? [];
    const msgIndex = msgs.findIndex((m) => m.id === msgId);
    if (msgIndex < 1) return;

    let userMsgIndex = msgIndex - 1;
    while (userMsgIndex >= 0 && msgs[userMsgIndex].role !== "user") {
      userMsgIndex--;
    }
    if (userMsgIndex < 0) return;
    const userMsg = msgs[userMsgIndex];

    setLoading(true);
    const currentRegenGen = ++genRef.current;

    const newAssistantId = crypto.randomUUID();
    const newAssistantMsg: ChatMessage = {
      id: newAssistantId,
      role: "assistant",
      content: "",
      sources: [],
      timestamp: Date.now(),
    };
    if (activeConversationId) {
      addMessageToConversation(activeConversationId, newAssistantMsg);
    }

    setStreamingMsgId(newAssistantId);

    try {
      const contexts: string[] = [];
      const sources: MessageSource[] = [];

      if (!activeLlmConfig) {
        throw new Error("未配置 AI 模型");
      }

      if (chatMode === "knowledge") {
        const kbConfig = loadConfig();
        if (!kbConfig.endpoint.trim()) {
          contexts.push("[提示] 知识库服务未配置（设置 -> 知识库）。");
        } else {
          const raw = kbConfig.endpoint.trim().replace(/\/+$/, "");
          const baseUrl = raw.startsWith("http") ? raw : `http://${raw}`;
          const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (kbConfig.apiKey.trim()) {
            reqHeaders["Authorization"] = `Bearer ${kbConfig.apiKey.trim()}`;
          }

          const filters: Record<string, unknown> = { source_type: "document" };
          if (contextTarget.type === "file" && contextTarget.docId) {
            filters.document_ids = [contextTarget.docId];
            if (contextTarget.kbId) filters.knowledge_base_ids = [contextTarget.kbId];
          } else if (contextTarget.type === "folder") {
            if (contextTarget.category) filters.category = contextTarget.category;
            if (contextTarget.kbId) filters.knowledge_base_ids = [contextTarget.kbId];
            if (contextTarget.parentId) filters.parent_filenode_ids = [contextTarget.parentId];
          }

          try {
            const resp = await fetch(`${baseUrl}/api/enhanced_search/v1/retrieval/`, {
              method: "POST",
              headers: reqHeaders,
              body: JSON.stringify({
                query: userMsg.content,
                search_type: "hybrid",
                top_k: kbConfig.topK || 10,
                score_threshold: kbConfig.threshold ?? 0.5,
                filters,
                include_metadata: true,
                include_highlights: true,
              }),
            });
            if (!resp.ok) {
              console.warn(`[知识库检索] HTTP ${resp.status}`);
              throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            const results: Array<Record<string, unknown>> = data?.data?.results || data?.results || [];
            console.log(
              `[知识库检索] query="${userMsg.content.slice(0, 80)}" filters=${JSON.stringify(filters)} results=${results.length} total=${data?.data?.total ?? data?.total ?? "?"}`
            );
            const refEntries: string[] = [];
            let hasImages = false;
            for (let i = 0; i < results.length; i++) {
              const item = results[i];
              const title = String(item.title || "未命名文档");
              const content = String(item.content || "");
              const highlights = String(item.highlights || "");
              const score = Number(item.score || 0);
              const metadata = (item.metadata || {}) as Record<string, unknown>;
              console.log(`  [${score.toFixed(3)}] ${title}`);
              const kbName = String(metadata.knowledge_base_name || "");
              const folderName = String(metadata.parent_filenode_name || "");
              const fileType = String(metadata.file_type || "");
              const uploader = String(metadata.uploader || "");
              const isImage = Boolean(metadata.is_image);
              const imageUrl = String(metadata.image_url || "");
              const metaParts = [
                kbName && `📚${kbName}`,
                folderName && `📁${folderName}`,
                fileType,
                uploader && `👤${uploader}`,
                `相关度: ${(score * 100).toFixed(1)}%`,
              ].filter(Boolean);
              const highlightText = highlights
                ? `\n>> ${highlights.replace(/\n/g, "\n>> ")}`
                : "";

              if (isImage && imageUrl) {
                hasImages = true;
                contexts.push(
                  `[来源 ${i + 1}] ${title}\n${metaParts.join(" · ")}\n` +
                  `**⚠️ 图片片段**\n` +
                  `- 描述：${content}\n` +
                  `- URL：${imageUrl}\n` +
                  `- **要求：在回答中必须用 Markdown 输出该图片 \`![${content.slice(0, 50)}](${imageUrl})\`**\n${highlightText}`
                );
                refEntries.push(
                  `[${i + 1}] ${title}${kbName ? ` (${kbName})` : ""} ${(score * 100).toFixed(0)}% 🖼️`
                );
              } else {
                contexts.push(
                  `[来源 ${i + 1}] ${title}\n${metaParts.join(" · ")}\n\n${content}${highlightText}`
                );
                refEntries.push(
                  `[${i + 1}] ${title}${kbName ? ` (${kbName})` : ""} ${(score * 100).toFixed(0)}%`
                );
              }

              sources.push({
                noteTitle: title,
                notePath: String(metadata.document_id || item.id || ""),
                snippet: content.slice(0, 200),
                score,
                chunkOffset: 0,
                chunkLength: 0,
              });
            }

            if (hasImages) {
              contexts.push(`---\n🖼️ **图片渲染规则**：上述来源中标记为"图片片段"的内容，必须在回答中使用 Markdown 图片语法输出。不要忽略图片片段，也不要仅用文字描述图片，必须输出 \`![描述](URL)\` 以便在回答中直接渲染图片。`);
            }
            if (refEntries.length > 0) {
              contexts.push(`---\n📋 请在回答中引用来源编号（如 [1][2]），引用格式示例: "[1] 根据..."\n${refEntries.join("\n")}`);
            }
          } catch (e) {
            contexts.push(`[知识库检索失败] ${String(e).slice(0, 300)}`);
          }
        }
      } else if (chatMode === "local") {
        if (contextTarget.type === "file" && currentNoteContent) {
          const title = currentNotePath?.split("/").pop() || "";
          contexts.push(`[当前文档: ${title}]\n${currentNoteContent.slice(0, 4000)}`);
          sources.push({
            noteTitle: title,
            notePath: currentNotePath || "",
            snippet: currentNoteContent.slice(0, 200),
            score: 1.0,
            chunkOffset: 0,
            chunkLength: 0,
          });
        }

        // 股票分析上下文
        if (contextTarget.type === "stock" && contextTarget.stockCode) {
          const stockCtx = `[股票分析: ${contextTarget.stockName || contextTarget.stockCode} (${contextTarget.stockMarket?.toUpperCase()}${contextTarget.stockCode})]\n请对该股票进行深度技术分析和基本面分析。`;
          contexts.push(stockCtx);
        }

        if (selectedRefs.length > 0 && vaultPath) {
          const fileRefs = selectedRefs.filter((r) => r.type === "file");
          const folderRefs = selectedRefs.filter((r) => r.type === "folder");

          for (const ref of fileRefs) {
            try {
              const content = await commands.readFile(vaultPath + "/" + ref.path);
              const title = ref.name;
              contexts.push(`[引用文档: ${title}]\n${content.slice(0, 3000)}`);
              sources.push({
                noteTitle: title,
                notePath: ref.path,
                snippet: content.slice(0, 200),
                score: 1.0,
                chunkOffset: 0,
                chunkLength: 0,
              });
            } catch {
              // skip
            }
          }

          if (folderRefs.length > 0) {
            const folderFilter = folderRefs.map((r) => r.path).join("|");
            try {
              const embedConfig = {
                provider: settings.embeddingConfig.provider,
                modelId: settings.embeddingConfig.modelId,
                apiUrl: settings.embeddingConfig.apiUrl,
                apiKey: settings.embeddingConfig.apiKey,
              };
              const results = await commands.multiSearch(userMsg.content, 3, embedConfig, folderFilter);
              for (const r of results) {
                if (!contexts.some((c) => c.includes(r.note_title))) {
                  contexts.push(`[${r.note_title}]\n${r.text}`);
                  sources.push({
                    noteTitle: r.note_title,
                    notePath: r.note_id,
                    snippet: r.text.slice(0, 120),
                    chunkText: r.text,
                    score: r.score,
                    chunkOffset: r.chunk_offset,
                    chunkLength: r.chunk_length,
                  });
                }
              }
            } catch {
              // folder search fallback
            }
          }
        }

        if (selectedRefs.length === 0) {
          const folderFilter = contextTarget.type === "folder" ? contextTarget.path : undefined;
          try {
            const embedConfig = {
              provider: settings.embeddingConfig.provider,
              modelId: settings.embeddingConfig.modelId,
              apiUrl: settings.embeddingConfig.apiUrl,
              apiKey: settings.embeddingConfig.apiKey,
            };
            const results = await commands.multiSearch(userMsg.content, 5, embedConfig, folderFilter);
            if (results.length > 0) {
              for (const r of results) {
                contexts.push(`[${r.note_title}]\n${r.text}`);
                sources.push({
                  noteTitle: r.note_title,
                  notePath: r.note_id,
                  snippet: r.text.slice(0, 120),
                  chunkText: r.text,
                  score: r.score,
                  chunkOffset: r.chunk_offset,
                  chunkLength: r.chunk_length,
                });
              }
            } else {
              contexts.push("[提示] 本地文件中暂未找到直接相关的内容，请尝试换个问法或确认相关笔记已存在。\n\n建议：请确保已完成文件索引（设置 -> 重建索引），且向量化模型服务（如 Ollama）已正常运行。");
          }
        } catch (e) {
          const errStr = String(e).slice(0, 200);
          contexts.push(`[提示] 多路检索失败(${errStr})。\n\n请检查：\n1. 设置中是否已配置向量化模型\n2. Ollama 服务是否正在运行\n3. 是否已构建文件索引`);
          }
        }
      } else if (chatMode === "online") {
        if (dataSource !== "local" && dataSource !== "online") {
          const cs = extensions.customSearches.find((s) => s.id === dataSource);
          if (cs) {
            try {
              const resp = await fetch(cs.url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(cs.apiKey ? { Authorization: `Bearer ${cs.apiKey}` } : {}),
                },
                body: JSON.stringify(buildSearchRequest(userMsg.content, 10)),
              });
              const data = await resp.json();
              const results: Array<Record<string, unknown>> = data.results || [];
              for (const r of results) {
                const title = String(r.title || "");
                const url = String(r.url || "");
                const content = String(r.content || r.snippet || "");
                const score = Number(r.score) || 0.5;
                const metadata = r.metadata ? ` [${JSON.stringify(r.metadata)}]` : "";
                contexts.push(`[${title}](${url})\n${content}${metadata}`);
                const extra = r.highlights ? ` · ${String(r.highlights).slice(0, 100)}` : "";
                sources.push({
                  noteTitle: title,
                  notePath: url,
                  snippet: content.slice(0, 200) + extra,
                  score,
                  chunkOffset: 0,
                  chunkLength: 0,
                });
              }
            } catch (e) {
              contexts.push(`[${cs.name} 检索失败] ${e}`);
            }
          }
        } else if (extensions.tavilyEnabled && extensions.tavilyApiKey) {
          try {
            const result = await commands.tavilySearch(userMsg.content, extensions.tavilyApiKey);
            if (result.answer) {
              contexts.push(`[Tavily 摘要]\n${result.answer}`);
            }
            for (const r of result.results) {
              contexts.push(`[${r.title}](${r.url})\n${r.content}`);
              sources.push({
                noteTitle: r.title,
                notePath: r.url,
                snippet: r.content.slice(0, 200),
                score: r.score,
                chunkOffset: 0,
                chunkLength: 0,
              });
            }
          } catch (e) {
            contexts.push(`[Tavily 检索失败] ${e}`);
          }
        } else {
          contexts.push("[提示] 联网模式需要配置 Tavily API Key（设置 -> 检索扩展 -> Tavily）。");
        }
      }

      const seenSources = new Map<string, MessageSource>();
      for (const s of sources) {
        const key = `${s.notePath}::${s.chunkOffset}`;
        seenSources.set(key, s);
      }
      const dedupedSources = Array.from(seenSources.values());

      updateMessageSourcesInConversation(activeConversationId || "", newAssistantId, dedupedSources);

      const requestId = crypto.randomUUID();
      currentRequestIdRef.current = requestId;
      const eventName = `chat-stream-${requestId}`;
      let fullContent = "";
      let unlisten: UnlistenFn | null = null;

      try {
        unlisten = await listen<StreamChunk>(eventName, (event) => {
          const chunk = event.payload;
          if (chunk.content) {
            fullContent += chunk.content;
            throttledUpdate(newAssistantId, fullContent, activeConversationId || "");
          }
          if (chunk.done) return;
        });

        await commands.modelChatStream(userMsg.content, contexts, activeLlmConfig, requestId);
      } finally {
        if (unlisten) unlisten();
      }

      if (genRef.current === currentRegenGen) {
        flushPending();
        const finalContent = fullContent || "模型未返回任何内容，请检查模型配置或重试。";
        updateMessageInConversation(activeConversationId || "", newAssistantId, finalContent);
        updateLastMessageContent(activeConversationId || "", finalContent);
      }
    } catch (e) {
      const errMsg = `重新生成失败: ${e}`;
      updateMessageInConversation(activeConversationId || "", newAssistantId, errMsg);
      updateLastMessageContent(activeConversationId || "", errMsg);
    } finally {
      if (genRef.current === currentRegenGen) {
        setLoading(false);
        setStreamingMsgId(null);
        currentRequestIdRef.current = null;
      }
    }
  }

  async function handleCopy(msg: ChatMessage) {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = msg.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function handleFeedback(msgId: string, type: "like" | "dislike") {
    const msg = chatMessages.find((m) => m.id === msgId);
    if (!msg) return;
    const next = msg.feedback === type ? null : type;
    updateMessageFeedbackInConversation(activeConversationId || "", msgId, next);
  }

  async function handleShare(msg: ChatMessage) {
    const userMsgIndex = chatMessages.findIndex((m) => m.id === msg.id) - 1;
    const userMsg = userMsgIndex >= 0 ? chatMessages[userMsgIndex] : null;

    let shareText = "";
    if (userMsg && userMsg.role === "user") {
      shareText += `**问:** ${userMsg.content}\n\n`;
    }
    shareText += `**答:** ${msg.content}`;

    if (msg.sources.length > 0) {
      shareText += `\n\n---\n📚 参考来源:\n`;
      msg.sources.forEach((s, i) => {
        shareText += `${i + 1}. ${s.noteTitle}\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  async function handleSelectConversation(id: string) {
    setActiveConversation(id);
    setShowHistory(false);
  }

  async function handleNewConversation() {
    setActiveConversation(null);
    createConversation("");
    setShowHistory(false);
  }

  async function handleDeleteConversation(id: string) {
    deleteConversation(id);
    if (activeConversationId === id) {
      setActiveConversation(null);
    }
  }

  function openNote(notePath: string, chunkText?: string, chunkOffset?: number, chunkLength?: number) {
    // 网络链接在浏览器中打开
    if (notePath.startsWith("http://") || notePath.startsWith("https://")) {
      window.open(notePath, "_blank");
      return;
    }
    const vaultPath = useAppStore.getState().vaultPath;
    if (!vaultPath) return;
    let fullPath: string;
    if (notePath.startsWith("/") || notePath.startsWith(vaultPath)) {
      fullPath = notePath;
    } else {
      fullPath = `${vaultPath}/${notePath}`;
    }
    commands.readFile(fullPath).then((content) => {
      useAppStore.getState().setCurrentNote(fullPath, content);
      if (chunkText && chunkOffset !== undefined && chunkLength !== undefined) {
        useAppStore.getState().setHighlight(chunkText, chunkOffset, chunkLength);
      } else if (chunkText) {
        useAppStore.getState().setHighlightText(chunkText);
      }
    }).catch(console.error);
  }

  const isKnowledgeContext = dataSource === "knowledge" || !!contextTarget.kbId || !!contextTarget.category || !!contextTarget.docId;

      return (
    <>
      <aside
        className="flex flex-col bg-[var(--color-surface-secondary)] border-l border-[var(--color-border)] shrink-0 relative"
        style={{ width }}
      >
      {/* 顶部栏 - 简洁，只显示范围 */}
      <div className="flex items-center px-3 h-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <div className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
          {contextTarget.type === "stock" && dataSource === "online" ? (
            <>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-medium text-[11px]">
                <span className="inline-flex items-center"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM5.2 13.2A5.5 5.5 0 013.7 8.5h2a9 9 0 00.5 2.7 5.5 5.5 0 00-1 2zm5.6 0a5.5 5.5 0 01-1-2 9 9 0 00.5-2.7h2a5.5 5.5 0 01-1.5 4.7zM8 14c-.5 0-1.2-.8-1.6-2.1a7.5 7.5 0 01-.4-1.9h4a7.5 7.5 0 01-.4 1.9C9.2 13.2 8.5 14 8 14zm-2.5-5a7.5 7.5 0 01.4-1.9C6.3 5.8 7 5 7.5 5h1c.5 0 1.2.8 1.6 2.1.2.6.3 1.2.4 1.9h-5zm5.3 0h-2a9 9 0 00-.5-2.7 5.5 5.5 0 011-2A5.5 5.5 0 0113.3 8.5h-2.5zm-7.6 0H3.2a5.5 5.5 0 012.6-4.7 5.5 5.5 0 011 2A9 9 0 006.2 8.5z" /></svg></span>
                <span className="truncate max-w-[140px]">{contextTarget.label}</span>
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">联网分析</span>
            </>
          ) : (
            <span className={`font-medium truncate ${
              contextTarget.type === "all"
                ? "text-[var(--color-text-muted)]"
                : "text-[var(--color-accent)]"
            }`}>
              {contextTarget.type === "all" && (isKnowledgeContext ? <><IconKnowledge size={12} /> 全部知识库</> : <><IconSearch size={12} /> 全部文件</>)}
              {contextTarget.type === "folder" && <><IconFolder size={12} /> {contextTarget.label}</>}
              {contextTarget.type === "file" && <><IconFile size={12} /> {contextTarget.label}</>}
              {contextTarget.type === "stock" && <><IconLetterStock size={12} /> {contextTarget.label}</>}
            </span>
          )}
          {contextTarget.type !== "all" && (
            <button
              className="icon-btn icon-btn-sm shrink-0"
              onClick={() => setContextTarget({ type: "all", label: isKnowledgeContext ? "全部知识库" : "全部文件" })}
              title="重置范围"
            >
              <IconClose size={10} />
            </button>
          )}
        </div>
        <button
          className="icon-btn icon-btn-sm shrink-0"
          onClick={() => toggleMaximizePanel("chat")}
          title={maximizedPanel === "chat" ? "还原 (Ctrl+Shift+M)" : "最大化 (Ctrl+Shift+M)"}
        >
          {maximizedPanel === "chat" ? <IconWindowRestore size={10} /> : <IconWindowMaximize size={10} />}
        </button>
      </div>

      {showHistory && (
        <div className="border-b border-[var(--color-border)]">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              对话历史
            </span>
            <button
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
              onClick={handleNewConversation}
            >
              <IconAdd size={10} /> 新对话
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-[var(--color-text-muted)] text-center">
                暂无历史记录
              </div>
            ) : (
              conversations
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((conv) => (
                  <div
                    key={conv.id}
                    className={`px-3 py-1.5 flex items-center justify-between cursor-pointer text-xs hover:bg-[var(--color-surface-hover)] ${
                      conv.id === activeConversationId
                        ? "bg-[var(--color-surface-hover)] border-l-2 border-[var(--color-accent)]"
                        : ""
                    }`}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <span className="truncate flex-1">
                      {conv.title || "新对话"}
                    </span>
                    <button
                      className="icon-btn icon-btn-sm ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      title="删除"
                    >
                      <IconClose size={8} />
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      <ChatMessageList
        chatMessages={chatMessages}
        streamingMsgId={streamingMsgId}
        expandedSources={expandedSources}
        onToggleSourceExpand={handleToggleSourceExpand}
        onOpenNote={openNote}
        onCopy={handleCopy}
        onRegenerate={handleRegenerate}
        onFeedback={handleFeedback}
        onShare={handleShare}
        copiedId={copiedId}
        loading={loading}
        onZoomImage={setZoomedImage}
        contextLabel={contextTarget.type !== "all" ? contextTarget.label : ""}
        answerMode={answerMode}
        dataSource={dataSource}
        isKnowledgeContext={isKnowledgeContext}
        zoomedImage={zoomedImage}
      />

      <ChatInputArea
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        onCancel={handleCancel}
        loading={loading}
        answerMode={answerMode}
        dataSource={dataSource}
        contextTarget={contextTarget}
        onSetAnswerMode={setAnswerModeAndSync}
        onSetDataSource={setDataSourceAndSync}
        selectedRefs={selectedRefs}
        onSelectedRefsChange={setSelectedRefs}
        availableAnswerModes={availableAnswerModes}
        availableDataSources={availableDataSources}
      />

      {/* 底部工具栏 - 操作按钮在左下角 */}
      <div className="flex items-center gap-0.5 px-2 h-8 border-t border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
          onClick={() => setShowHistory(!showHistory)}
          title="历史记录"
        >
          <IconHistory size={12} /> 历史
        </button>
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
          onClick={handleNewConversation}
          title="新对话"
        >
          <IconAdd size={12} /> 新对话
        </button>
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
          onClick={() => useAppStore.getState().showEditor()}
          title="切换到编辑器"
        >
          <IconFile size={12} /> 文档
        </button>
        {hasStockTarget && (
          <button
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
            onClick={() => useAppStore.getState().showStock()}
            title="切换到股票详情"
          >
            <IconLetterStock size={12} /> 股票
          </button>
        )}
        <div className="flex-1" />
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-all duration-150"
          onClick={toggleChat}
          title="关闭面板"
        >
          收起 <IconClose size={10} />
        </button>
      </div>
      </aside>
    </>
  );
}