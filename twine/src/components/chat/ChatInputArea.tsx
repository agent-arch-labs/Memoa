import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useSearchExtensions } from "@/hooks/useSearchExtensions";
import { FilePickerPopover } from "./FilePickerPopover";
import type { AnswerMode, DataSource, ContextTarget } from "@/types";

const ANSWER_MODE_ICONS: Record<AnswerMode, string> = { rag: "🔍", agent: "🧠", deepresearch: "🔬", agent_rag: "⚡" };
const ANSWER_MODE_LABELS: Record<AnswerMode, string> = { rag: "RAG", agent: "Agent", deepresearch: "DeepResearch", agent_rag: "Agent RAG" };
const ANSWER_MODE_DESCS: Record<AnswerMode, string> = {
  rag: "检索增强生成",
  agent: "MCP 智能体工具调用",
  deepresearch: "UltraRAG 深度研究",
  agent_rag: "多策略智能 Agent RAG，逐步推理检索与回答",
};

export interface SelectedRef {
  path: string;
  name: string;
  type: "file" | "folder";
}

interface ChatInputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  loading: boolean;
  answerMode: AnswerMode;
  dataSource: DataSource;
  contextTarget: ContextTarget;
  onSetAnswerMode: (mode: AnswerMode) => void;
  onSetDataSource: (source: DataSource) => void;
  selectedRefs: SelectedRef[];
  onSelectedRefsChange: (refs: SelectedRef[]) => void;
  availableAnswerModes: AnswerMode[];
  availableDataSources: DataSource[];
}

export function ChatInputArea({
  value,
  onChange,
  onSend,
  loading,
  answerMode,
  dataSource,
  contextTarget,
  onSetAnswerMode,
  onSetDataSource,
  selectedRefs,
  onSelectedRefsChange,
  availableAnswerModes,
  availableDataSources,
}: ChatInputAreaProps) {
  const settings = useSettingsStore();
  const setActiveLlmModel = useSettingsStore((s) => s.setActiveLlmModel);
  const vaultPath = useAppStore((s) => s.vaultPath);
  const { getDataSourceIcon, getDataSourceLabel, getDataSourceDesc } = useSearchExtensions();

  const availableAnswerModeSet = new Set(availableAnswerModes);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAnswerModeDropdown, setShowAnswerModeDropdown] = useState(false);
  const [showDataSourceDropdown, setShowDataSourceDropdown] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const answerModeDropdownRef = useRef<HTMLDivElement>(null);
  const dataSourceDropdownRef = useRef<HTMLDivElement>(null);

  const activeModelName = settings.llmModels.find((m) => m.id === settings.activeLlmModelId)?.name || "";

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
    }
  }, [value]);

  useClickOutside(modelDropdownRef, () => setShowModelDropdown(false));

  useClickOutside(answerModeDropdownRef, () => setShowAnswerModeDropdown(false));

  useClickOutside(dataSourceDropdownRef, () => setShowDataSourceDropdown(false));

  function removeRef(path: string) {
    onSelectedRefsChange(selectedRefs.filter((r) => r.path !== path));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (loading) return;
      onSend();
    }
  }

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-gradient-to-t from-[var(--color-surface-secondary)] to-[var(--color-surface)]">
      <div className="px-3 pt-3 pb-2">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-sm focus-within:border-[var(--color-accent)]/50 focus-within:shadow-md focus-within:shadow-[var(--color-accent)]/5 transition-all duration-200">
          <textarea
            ref={textareaRef}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/60 outline-none min-h-[48px] max-h-[240px] leading-relaxed"
            placeholder={
              (() => {
                if (answerMode === "agent") return "向 Agent 提问 (MCP 工具调用)...";
                if (answerMode === "deepresearch") return "向 DeepResearch 提问 (UltraRAG)...";

                const scope = contextTarget.type === "folder"
                  ? `【${contextTarget.label}】`
                  : contextTarget.type === "file"
                  ? `【${contextTarget.label}】`
                  : "";

                if (dataSource === "knowledge") {
                  return scope ? `向知识库 ${scope} 提问...` : "向知识库提问...";
                }
                if (dataSource === "online") {
                  return scope ? `联网 RAG 向 ${scope} 提问...` : "联网 RAG 提问...";
                }
                return scope ? `向本地文件 ${scope} 提问...` : "向本地文件提问...";
              })()
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />

          <div className="flex items-center gap-2 px-3 pb-2.5">
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  showDocPicker
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                }`}
                onClick={() => showDocPicker ? setShowDocPicker(false) : setShowDocPicker(true)}
                title="引用文档"
              >
                @
              </button>

              <button
                className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  showFolderPicker
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                }`}
                onClick={() => showFolderPicker ? setShowFolderPicker(false) : setShowFolderPicker(true)}
                title="引用文件夹"
              >
                #
              </button>

              <div className="relative shrink-0" ref={dataSourceDropdownRef}>
                <button
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 border border-[var(--color-border)] hover:border-[var(--color-accent)]/40 cursor-pointer ${
                    dataSource === "local"
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20"
                      : dataSource === "online"
                      ? "bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20"
                      : "bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/20"
                  }`}
                  onClick={() => {
                    setShowDataSourceDropdown(!showDataSourceDropdown);
                    setShowAnswerModeDropdown(false);
                  }}
                  title={
                    contextTarget.type !== "all"
                      ? `${getDataSourceDesc(dataSource)}（聚焦: ${contextTarget.label}）`
                      : getDataSourceDesc(dataSource)
                  }
                >
                  <span className="text-xs">{getDataSourceIcon(dataSource)}</span>
                  <span className="text-[10px]">
                    {getDataSourceLabel(dataSource)}
                    {contextTarget.type !== "all" && ` · ${contextTarget.label}`}
                  </span>
                  <svg
                    className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 ${showDataSourceDropdown ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showDataSourceDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50 min-w-[140px] overflow-hidden animate-in slide-in-from-bottom-2 duration-150">
                    <div className="py-1">
                      {(availableDataSources as DataSource[]).map((source) => (
                        <button
                          key={source}
                          className={`w-full text-left px-3 py-2 text-[11px] transition-colors flex items-center gap-2 ${
                            source === dataSource
                              ? "bg-[var(--color-accent)]/8 text-[var(--color-accent)] font-medium"
                              : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                          }`}
                          onClick={() => {
                            onSetDataSource(source);
                            setShowDataSourceDropdown(false);
                          }}
                        >
                          <span className="text-sm">{getDataSourceIcon(source)}</span>
                          <div className="flex flex-col">
                            <span>{getDataSourceLabel(source)}</span>
                            <span className="text-[9px] text-[var(--color-text-muted)]">
                              {getDataSourceDesc(source)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
              {selectedRefs.map((ref) => (
                <span
                  key={ref.path}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] shrink-0 transition-colors ${
                    ref.type === "file"
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  }`}
                  title={ref.path}
                >
                  {ref.type === "file" ? "📄" : "📁"}
                  <span className="max-w-[120px] truncate">{ref.name}</span>
                  <button
                    className="ml-0.5 hover:opacity-70 transition-opacity"
                    onClick={() => removeRef(ref.path)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative shrink-0" ref={answerModeDropdownRef}>
                <button
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 border border-[var(--color-border)] hover:border-[var(--color-accent)]/40 cursor-pointer ${
                    answerMode === "rag"
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20"
                      : answerMode === "agent"
                      ? "bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/20"
                      : "bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20"
                  }`}
                  onClick={() => {
                    setShowAnswerModeDropdown(!showAnswerModeDropdown);
                    setShowDataSourceDropdown(false);
                  }}
                  title={ANSWER_MODE_DESCS[answerMode]}
                >
                  <span className="text-xs">{ANSWER_MODE_ICONS[answerMode]}</span>
                  <span className="text-[10px]">{ANSWER_MODE_LABELS[answerMode]}</span>
                  <svg
                    className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 ${showAnswerModeDropdown ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showAnswerModeDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden animate-in slide-in-from-bottom-2 duration-150">
                    <div className="py-1">
                      {(Object.keys(ANSWER_MODE_ICONS) as AnswerMode[]).filter((m) => availableAnswerModeSet.has(m)).map((mode) => (
                        <button
                          key={mode}
                          className={`w-full text-left px-3 py-2 text-[11px] transition-colors flex items-center gap-2 ${
                            mode === answerMode
                              ? "bg-[var(--color-accent)]/8 text-[var(--color-accent)] font-medium"
                              : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                          }`}
                          onClick={() => {
                            onSetAnswerMode(mode);
                            setShowAnswerModeDropdown(false);
                          }}
                        >
                          <span className="text-sm">{ANSWER_MODE_ICONS[mode]}</span>
                          <div className="flex flex-col">
                            <span>{ANSWER_MODE_LABELS[mode]}</span>
                            <span className="text-[9px] text-[var(--color-text-muted)]">
                              {ANSWER_MODE_DESCS[mode]}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={modelDropdownRef}>
                <button
                  className="flex items-center gap-1 bg-transparent border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] max-w-[110px] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40 transition-colors cursor-pointer truncate"
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  title={activeModelName}
                >
                  <span className="truncate">{activeModelName || "选择模型"}</span>
                  <svg
                    className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 ${showModelDropdown ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showModelDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl z-50 min-w-[140px] max-h-[240px] overflow-y-auto animate-in slide-in-from-bottom-2 duration-150">
                    <div className="py-1">
                      {settings.llmModels.map((m) => (
                        <button
                          key={m.id}
                          className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors truncate ${
                            m.id === settings.activeLlmModelId
                              ? "text-[var(--color-accent)] bg-[var(--color-accent)]/8 font-medium"
                              : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                          }`}
                          onClick={() => {
                            setActiveLlmModel(m.id);
                            setShowModelDropdown(false);
                          }}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                className={`flex items-center justify-center w-8 h-8 rounded-xl text-sm font-bold transition-all duration-200 ${
                  value.trim() && !loading
                    ? "bg-[var(--color-accent)] text-white shadow-sm shadow-[var(--color-accent)]/30 hover:shadow-md hover:shadow-[var(--color-accent)]/40 hover:scale-105 active:scale-95"
                    : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] cursor-not-allowed"
                }`}
                onClick={onSend}
                disabled={loading || !value.trim()}
                title="发送"
              >
                {loading ? (
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDocPicker && (
        <FilePickerPopover
          mode="file"
          visible={showDocPicker}
          vaultPath={vaultPath}
          selectedRefs={selectedRefs}
          onConfirm={onSelectedRefsChange}
          onClose={() => setShowDocPicker(false)}
        />
      )}

      {showFolderPicker && (
        <FilePickerPopover
          mode="folder"
          visible={showFolderPicker}
          vaultPath={vaultPath}
          selectedRefs={selectedRefs}
          onConfirm={onSelectedRefsChange}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </div>
  );
}