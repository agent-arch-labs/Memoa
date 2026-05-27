import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore, getActiveLlmConfig } from "@/stores/settingsStore";
import { useConversationStore } from "@/stores/conversationStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { ChatInputArea, type SelectedRef } from "./ChatInputArea";
import { buildSearchRequest } from "../settings/SearchExtensionsSettings";
import { loadConfig } from "../settings/KnowledgeBaseSettings";
import type { ChatMessage, MessageSource, ChatMode, AnswerMode, DataSource, AgentRagStepEvent, AgentRagSource } from "@/types";
import { useSearchExtensions } from "@/hooks/useSearchExtensions";

interface StreamChunk {
  content: string;
  done: boolean;
}

interface ChatPanelProps {
  width: number;
}

export function ChatPanel({ width }: ChatPanelProps) {
  const commands = useTauriCommands();
  const chatMessages = useAppStore((s) => s.chatMessages);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const updateChatMessage = useAppStore((s) => s.updateChatMessage);
  const updateChatMessageFeedback = useAppStore((s) => s.updateChatMessageFeedback);
  const updateChatMessageSources = useAppStore((s) => s.updateChatMessageSources);
  const clearChat = useAppStore((s) => s.clearChat);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const currentNoteContent = useAppStore((s) => s.currentNoteContent);
  const currentNotePath = useAppStore((s) => s.currentNotePath);
  const chatMode = useAppStore((s) => s.chatMode);
  const setChatMode = useAppStore((s) => s.setChatMode);
  const contextTarget = useAppStore((s) => s.contextTarget);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const dataSource = useAppStore((s) => s.dataSource);
  const setDataSource = useAppStore((s) => s.setDataSource);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const settings = useSettingsStore();
  const activeLlmConfig = getActiveLlmConfig(settings);
  const { extensions } = useSearchExtensions();

  const conversations = useConversationStore((s) => s.conversations);
  const activeConversationId = useConversationStore((s) => s.activeConversationId);
  const createConversation = useConversationStore((s) => s.createConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation);
  const addMessageToConversation = useConversationStore((s) => s.addMessageToConversation);
  const updateLastMessageContent = useConversationStore((s) => s.updateLastMessageContent);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [selectedRefs, setSelectedRefs] = useState<SelectedRef[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const initialAnswerMode: AnswerMode = chatMode === "agent" ? "agent" : "rag";
  const [answerMode, setAnswerMode] = useState<AnswerMode>(initialAnswerMode);
  const [availableAnswerModes, setAvailableAnswerModes] = useState<AnswerMode[]>(["rag"]);
  const [availableDataSources, setAvailableDataSources] = useState<DataSource[]>(["local"]);

  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { className?: string; children?: React.ReactNode }) {
      const match = /language-(\w+)/.exec(className || "");
      const inline = !match && (!className || !String(children).includes("\n"));
      if (inline) {
        return <code className="bg-[var(--color-surface-hover)] px-1 py-0.5 rounded text-[11px]" {...props}>{children}</code>;
      }
      return (
        <pre className="bg-[var(--color-surface-hover)] rounded p-2 overflow-x-auto my-1">
          <code className="text-[11px]" {...props}>{children}</code>
        </pre>
      );
    },
    p({ children }: { children?: React.ReactNode }) {
      return <p className="mb-1 last:mb-0">{children}</p>;
    },
    ul({ children }: { children?: React.ReactNode }) {
      return <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>;
    },
    ol({ children }: { children?: React.ReactNode }) {
      return <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>;
    },
    li({ children }: { children?: React.ReactNode }) {
      return <li className="text-xs">{children}</li>;
    },
    blockquote({ children }: { children?: React.ReactNode }) {
      return <blockquote className="border-l-2 border-[var(--color-accent)]/50 pl-2 italic text-[var(--color-text-muted)] my-1">{children}</blockquote>;
    },
    a({ children, href }: { children?: React.ReactNode; href?: string }) {
      return <a className="text-[var(--color-accent)] underline decoration-[var(--color-accent)]/30 hover:decoration-[var(--color-accent)]" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    table({ children }: { children?: React.ReactNode }) {
      return <div className="overflow-x-auto my-1"><table className="text-[11px] border-collapse border border-[var(--color-border)] w-full">{children}</table></div>;
    },
    th({ children }: { children?: React.ReactNode }) {
      return <th className="border border-[var(--color-border)] px-2 py-1 bg-[var(--color-surface-hover)] text-left">{children}</th>;
    },
    td({ children }: { children?: React.ReactNode }) {
      return <td className="border border-[var(--color-border)] px-2 py-1">{children}</td>;
    },
    hr() {
      return <hr className="border-[var(--color-border)] my-2" />;
    },
    h1({ children }: { children?: React.ReactNode }) {
      return <h1 className="text-sm font-bold mt-2 mb-1">{children}</h1>;
    },
    h2({ children }: { children?: React.ReactNode }) {
      return <h2 className="text-xs font-bold mt-1.5 mb-1">{children}</h2>;
    },
    h3({ children }: { children?: React.ReactNode }) {
      return <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>;
    },
    img({ src, alt }: { src?: string; alt?: string }) {
      if (!src) return null;
      return (
        <div className="flex justify-center my-2">
          <img
            src={src}
            alt={alt || ""}
            className="rounded-md cursor-zoom-in border border-[var(--color-border)] transition-transform hover:scale-[1.02] hover:shadow-md"
            style={{ maxWidth: "100%", maxHeight: "360px", objectFit: "contain" }}
            onClick={(e) => { e.stopPropagation(); setZoomedImage(src); }}
            loading="lazy"
          />
        </div>
      );
    },
  }), [setZoomedImage]);

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

  const throttleTimerRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ msgId: string; content: string; convId: string } | null>(null);

  function throttledUpdate(msgId: string, content: string, convId: string) {
    if (throttleTimerRef.current) {
      pendingUpdateRef.current = { msgId, content, convId };
      return;
    }
    updateChatMessage(msgId, content);
    updateLastMessageContent(convId, content);
    throttleTimerRef.current = window.setTimeout(() => {
      throttleTimerRef.current = null;
      const pending = pendingUpdateRef.current;
      if (pending) {
        pendingUpdateRef.current = null;
        updateChatMessage(pending.msgId, pending.content);
        updateLastMessageContent(pending.convId, pending.content);
      }
    }, 80);
  }

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [chatMessages]);

  function handleScrollContainer() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  function setAnswerModeAndSync(am: AnswerMode) {
    setAnswerMode(am);
    syncModesToStore(am, dataSource);
  }

  function setDataSourceAndSync(ds: DataSource) {
    setDataSource(ds);
    syncModesToStore(answerMode, ds);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    isAtBottomRef.current = true;

    const convId = activeConversationId || createConversation(text.slice(0, 50));

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      sources: [],
      timestamp: Date.now(),
    };
    addChatMessage(userMsg);
    addMessageToConversation(convId, userMsg);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      timestamp: Date.now(),
    };
    addChatMessage(assistantMsg);
    addMessageToConversation(convId, assistantMsg);

    setStreamingMsgId(assistantId);

    try {
      const contexts: string[] = [];
      const sources: MessageSource[] = [];

      if (!activeLlmConfig) {
        throw new Error("未配置 AI 模型");
      }

      console.log(
        `[sendMessage] chatMode="${chatMode}" dataSource="${dataSource}" answerMode="${answerMode}" contextTarget=`,
        contextTarget
      );

      if (chatMode === "agent") {
        if (answerMode === "agent_rag") {
          const requestId = crypto.randomUUID();
          const eventName = `agent-rag-${requestId}`;

          const { embeddingConfig } = useSettingsStore.getState();
          const activeEmbedConfig = embeddingConfig?.provider
            ? embeddingConfig
            : undefined;

          let unlisten: UnlistenFn | undefined;
          let fullText = "";
          let resolveDone: (() => void) | undefined;
          const donePromise = new Promise<void>((resolve) => {
            resolveDone = resolve;
          });

          try {
            unlisten = await listen<AgentRagStepEvent>(eventName, (event) => {
              const evt = event.payload;

              if (evt.step_type === "token" && evt.token) {
                fullText += evt.token;
                updateChatMessage(assistantId, fullText);
                updateLastMessageContent(convId, fullText);
              }
              if (evt.step_type === "done") {
                if (evt.answer) {
                  updateChatMessage(assistantId, evt.answer);
                  updateLastMessageContent(convId, evt.answer);
                } else {
                  updateChatMessage(
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
                  updateChatMessageSources(assistantId, msgs);
                }
                resolveDone?.();
              }
              if (evt.step_type === "error") {
                updateChatMessage(
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
            updateChatMessage(assistantId, errMsg);
            updateLastMessageContent(convId, errMsg);
          } finally {
            if (unlisten) unlisten();
          }

          setLoading(false);
          setStreamingMsgId(null);
          return;
        }

        let augmentedQuery = text;
        const agentSources: MessageSource[] = [];

        if (dataSource !== "local" && dataSource !== "online") {
          const tool = extensions.customSearches.find((s) => s.id === dataSource);
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

        try {
          const result = await commands.agentDeepResearch(augmentedQuery);
          const resultStr = typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
          updateChatMessage(assistantId, resultStr);
          updateLastMessageContent(convId, resultStr);

          if (agentSources.length > 0) {
            updateChatMessageSources(assistantId, agentSources);
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
              updateChatMessageSources(assistantId, parsedSources);
            }
          }
        } catch (e) {
          const errMsg = `Agent 错误: ${e}\n\n请确保 Agent 已启动（设置 -> AI Agent -> 启动 Agent）。`;
          updateChatMessage(assistantId, errMsg);
          updateLastMessageContent(convId, errMsg);
        }
        setLoading(false);
        setStreamingMsgId(null);
        return;
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
            if (currentNoteContent && currentNotePath) {
              const title = currentNotePath.split("/").pop() || "";
              contexts.push(`[当前打开的笔记: ${title}]\n${currentNoteContent.slice(0, 2000)}`);
            }
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

      updateChatMessageSources(assistantId, dedupedSources);

      const requestId = crypto.randomUUID();
      const eventName = `chat-stream-${requestId}`;
      let fullContent = "";
      let unlisten: UnlistenFn | null = null;

      try {
        unlisten = await listen<StreamChunk>(eventName, (event) => {
          const chunk = event.payload;
          if (chunk.done) {
            return;
          }
          fullContent += chunk.content;
          throttledUpdate(assistantId, fullContent, convId);
        });

        await commands.modelChatStream(text, contexts, activeLlmConfig, requestId);
      } finally {
        if (unlisten) unlisten();
      }

      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
        pendingUpdateRef.current = null;
      }
      updateChatMessage(assistantId, fullContent);
      updateLastMessageContent(convId, fullContent);
    } catch (e) {
      const errMsg = `错误: ${e}\n\n请检查模型配置是否正确，并确保服务已启动。`;
      updateChatMessage(assistantId, errMsg);
      updateLastMessageContent(convId, errMsg);
    } finally {
      setLoading(false);
      setStreamingMsgId(null);
    }
  }

  async function handleRegenerate(msgId: string) {
    if (loading) return;

    const msgs = useAppStore.getState().chatMessages;
    const msgIndex = msgs.findIndex((m) => m.id === msgId);
    if (msgIndex < 1) return;

    let userMsgIndex = msgIndex - 1;
    while (userMsgIndex >= 0 && msgs[userMsgIndex].role !== "user") {
      userMsgIndex--;
    }
    if (userMsgIndex < 0) return;
    const userMsg = msgs[userMsgIndex];

    setLoading(true);
    isAtBottomRef.current = true;

    const newAssistantId = crypto.randomUUID();
    const newAssistantMsg: ChatMessage = {
      id: newAssistantId,
      role: "assistant",
      content: "",
      sources: [],
      timestamp: Date.now(),
    };
    addChatMessage(newAssistantMsg);
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

      updateChatMessageSources(newAssistantId, dedupedSources);

      const requestId = crypto.randomUUID();
      const eventName = `chat-stream-${requestId}`;
      let fullContent = "";
      let unlisten: UnlistenFn | null = null;

      try {
        unlisten = await listen<StreamChunk>(eventName, (event) => {
          const chunk = event.payload;
          if (chunk.done) return;
          fullContent += chunk.content;
          throttledUpdate(newAssistantId, fullContent, activeConversationId || "");
        });

        await commands.modelChatStream(userMsg.content, contexts, activeLlmConfig, requestId);
      } finally {
        if (unlisten) unlisten();
      }

      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
        pendingUpdateRef.current = null;
      }
      updateChatMessage(newAssistantId, fullContent);
      updateLastMessageContent(activeConversationId || "", fullContent);
    } catch (e) {
      const errMsg = `重新生成失败: ${e}`;
      updateChatMessage(newAssistantId, errMsg);
      updateLastMessageContent(activeConversationId || "", errMsg);
    } finally {
      setLoading(false);
      setStreamingMsgId(null);
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
    updateChatMessageFeedback(msgId, next);
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
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      clearChat();
      conv.messages.forEach((m) => addChatMessage(m));
    }
    setShowHistory(false);
  }

  async function handleNewConversation() {
    clearChat();
    setActiveConversation(null);
    createConversation("");
    setShowHistory(false);
  }

  async function handleDeleteConversation(id: string) {
    deleteConversation(id);
    if (activeConversationId === id) {
      clearChat();
      setActiveConversation(null);
    }
  }

  function openNote(notePath: string, chunkText?: string, chunkOffset?: number, chunkLength?: number) {
    const vaultPath = useAppStore.getState().vaultPath;
    if (!vaultPath) return;
    const fullPath = `${vaultPath}/${notePath}`;
    commands.readFile(fullPath).then((content) => {
      useAppStore.getState().setCurrentNote(fullPath, content);
      if (chunkText && chunkOffset !== undefined && chunkLength !== undefined) {
        useAppStore.getState().setHighlight(chunkText, chunkOffset, chunkLength);
      } else if (chunkText) {
        useAppStore.getState().setHighlightText(chunkText);
      }
    }).catch(console.error);
  }

  function MessageContent({ msg }: { msg: ChatMessage }) {
    if (!msg.content) {
      return <span className="italic text-[var(--color-text-muted)]">思考中...</span>;
    }
    if (msg.role === "user") {
      return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
    }
    try {
      return (
        <div className="prose prose-xs max-w-none text-xs text-[var(--color-text-primary)] break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        </div>
      );
    } catch {
      return <div className="whitespace-pre-wrap break-words">{msg.content}</div>;
    }
  }

  function ActionBar({ msg }: { msg: ChatMessage }) {
    if (msg.role !== "assistant" || !msg.content) return null;

    return (
      <div className="flex items-center gap-0.5 mt-2 pt-1.5 border-t border-[var(--color-border)]/30">
        <button
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={() => handleCopy(msg)}
          title="复制"
        >
          {copiedId === msg.id ? "✅" : "📋"}
          <span>{copiedId === msg.id ? "已复制" : "复制"}</span>
        </button>
        <button
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          onClick={() => handleRegenerate(msg.id)}
          disabled={loading}
          title="重新生成"
        >
          🔄
          <span>刷新</span>
        </button>
        <button
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
            msg.feedback === "like"
              ? "text-green-500 bg-green-500/10"
              : "text-[var(--color-text-muted)] hover:text-green-500 hover:bg-green-500/5"
          }`}
          onClick={() => handleFeedback(msg.id, "like")}
          title="点赞"
        >
          👍
        </button>
        <button
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
            msg.feedback === "dislike"
              ? "text-orange-500 bg-orange-500/10"
              : "text-[var(--color-text-muted)] hover:text-orange-500 hover:bg-orange-500/5"
          }`}
          onClick={() => handleFeedback(msg.id, "dislike")}
          title="踩"
        >
          👎
        </button>
        <button
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors ml-auto"
          onClick={() => handleShare(msg)}
          title="分享"
        >
          {copiedId === msg.id ? "✅" : "📤"}
          <span>{copiedId === msg.id ? "已复制" : "分享"}</span>
        </button>
      </div>
    );
  }

  function SourceBar({ msg }: { msg: ChatMessage }) {
    if (msg.role !== "assistant" || msg.sources.length === 0) return null;

    const isExpanded = expandedSources.has(msg.id);
    const hasMore = msg.sources.length > 5;
    const visibleSources = isExpanded ? msg.sources : msg.sources.slice(0, 5);

    function toggleExpand() {
      setExpandedSources((prev) => {
        const next = new Set(prev);
        if (isExpanded) {
          next.delete(msg.id);
        } else {
          next.add(msg.id);
        }
        return next;
      });
    }

    return (
      <div className="mt-1.5 pt-1.5 border-t border-[var(--color-border)]/30">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
            📚 参考来源
          </span>
          {hasMore && (
            <button
              className="text-[10px] text-[var(--color-accent)] hover:underline"
              onClick={toggleExpand}
            >
              {isExpanded ? "收起" : `更多 (${msg.sources.length})`}
            </button>
          )}
        </div>
        <div className="space-y-1">
          {visibleSources.map((source, i) => (
            <button
              key={`${source.notePath}-${i}`}
              className="w-full text-left px-1.5 py-1 rounded text-[10px] hover:bg-[var(--color-surface-hover)] transition-colors group"
              onClick={() => openNote(source.notePath, source.chunkText, source.chunkOffset, source.chunkLength)}
              title={`打开: ${source.noteTitle}`}
            >
              <div className="flex items-center gap-1">
                <span className="shrink-0 text-[var(--color-accent)] font-medium tabular-nums">[{i + 1}]</span>
                <span className="shrink-0">📄</span>
                <span className="truncate text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
                  {source.noteTitle}
                </span>
                {source.score > 0 && (
                  <span className="shrink-0 text-[var(--color-text-muted)] ml-auto">
                    {source.score <= 1 ? `${Math.round(source.score * 100)}%` : `${Math.round(source.score)}`}
                  </span>
                )}
              </div>
              {source.snippet && (
                <p className="text-[var(--color-text-muted)] truncate mt-0.5 ml-5">
                  {source.snippet}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isKnowledgeContext = dataSource === "knowledge" || !!contextTarget.kbId || !!contextTarget.category || !!contextTarget.docId;

      return (
    <>
      <aside
        className="flex flex-col bg-[var(--color-surface-secondary)] border-l border-[var(--color-border)] shrink-0 relative"
        style={{ width }}
      >
      <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-[var(--color-text-muted)]">范围:</span>
          <span className={`font-medium ${
            contextTarget.type === "all"
              ? "text-[var(--color-text-primary)]"
              : "text-[var(--color-accent)]"
          }`}>
            {contextTarget.type === "all" && (isKnowledgeContext ? "📚 全部知识库" : "🔍 全部文件")}
            {contextTarget.type === "folder" && `📁 ${contextTarget.label}`}
            {contextTarget.type === "file" && `📄 ${contextTarget.label}`}
          </span>
          {contextTarget.type !== "all" && (
            <button
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              onClick={() => setContextTarget({ type: "all", label: isKnowledgeContext ? "全部知识库" : "全部文件" })}
              title={`重置为${isKnowledgeContext ? "全部知识库" : "全部文件"}`}
            >
              ✕ 重置
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            className="btn btn-ghost px-1.5 text-xs"
            onClick={() => setShowHistory(!showHistory)}
            title="历史记录"
          >
            📋
          </button>
          <button
            className="btn btn-ghost px-1.5 text-xs"
            onClick={clearChat}
            title="清空对话"
          >
            🗑
          </button>
          <button
            className="btn btn-ghost px-1.5 text-xs"
            onClick={toggleChat}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="border-b border-[var(--color-border)]">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              对话历史
            </span>
            <button
              className="btn btn-ghost text-xs py-0.5 px-2"
              onClick={handleNewConversation}
            >
              + 新对话
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
                      className="btn btn-ghost px-1 text-[10px] ml-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={scrollContainerRef} onScroll={handleScrollContainer}>
        {chatMessages.length === 0 && (() => {
            const scope = contextTarget.type === "folder"
              ? `【${contextTarget.label}】`
              : contextTarget.type === "file"
              ? `【${contextTarget.label}】`
              : "";

            const title = isKnowledgeContext
              ? scope ? `向知识库${scope}提问` : "向你的知识库提问"
              : dataSource === "online"
              ? scope ? `联网检索 ${scope}` : "向你的联网检索提问"
              : scope ? `向本地文件${scope}提问` : "向你的本地文件提问";

            const subtitle = answerMode === "rag"
              ? dataSource === "online"
                ? "Tavily 联网检索，AI 基于网络结果回答"
                : isKnowledgeContext
                ? "基于远程知识库检索增强回答"
                : dataSource !== "local"
                ? "检索工具，AI 调用外部检索接口获取知识"
                : scope
                ? `基于 RAG 检索增强回答，聚焦 ${contextTarget.label}`
                : "基于 RAG 检索增强回答，从你的笔记中寻找答案"
              : answerMode === "agent_rag"
              ? "多策略 Agent RAG，智能选择检索与推理策略逐步回答"
              : answerMode === "agent"
              ? "启用 Agent Mode，AI 自主调用工具完成任务"
              : "启用 UltraRAG Deep Research，AI 深度研究分析";

            return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-3xl mb-3 opacity-60">🤖</div>
            <div className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
              {title}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)] max-w-[200px]">
              {subtitle}
            </div>
          </div>
            );
          })()}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`text-xs ${
              msg.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }`}
          >
            <div className={`max-w-[88%] ${
              msg.role === "user" ? "" : "w-full"
            }`}>
              <div
                className={`rounded-xl px-3 py-2.5 relative group ${
                  msg.role === "user"
                    ? "bg-[var(--color-accent)] text-white rounded-br-md"
                    : "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-bl-md"
                }`}
              >
                <MessageContent msg={msg} />
                {streamingMsgId === msg.id && (
                  <span className="inline-block w-1.5 h-3 bg-[var(--color-accent)] animate-pulse ml-0.5 align-middle rounded-sm" />
                )}
                {msg.role === "user" && msg.content && (
                  <button
                    className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-white/60 hover:text-white hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(msg);
                    }}
                    title="复制"
                  >
                    {copiedId === msg.id ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                    )}
                  </button>
                )}
              </div>
              <SourceBar msg={msg} />
              <ActionBar msg={msg} />
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <ChatInputArea
        value={input}
        onChange={setInput}
        onSend={sendMessage}
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
      </aside>
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={() => setZoomedImage(null)}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}