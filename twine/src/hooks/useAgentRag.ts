import { useState, useCallback, useRef } from "react";
import { useTauriCommands } from "./useTauriCommands";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore, getActiveLlmConfig } from "@/stores/settingsStore";
import type { AgentRagStrategy, AgentRagStepEvent, AgentRagSource } from "@/types";
import { listen } from "@tauri-apps/api/event";

interface UseAgentRagReturn {
  strategies: AgentRagStrategy[];
  loadingStrategies: boolean;
  running: boolean;
  steps: AgentRagStepEvent[];
  finalAnswer: string;
  sources: AgentRagSource[];
  error: string;
  loadStrategies: () => Promise<void>;
  runQuery: (query: string, strategyId: string) => Promise<void>;
  clearSteps: () => void;
}

export function useAgentRag(): UseAgentRagReturn {
  const commands = useTauriCommands();
  const vaultPath = useAppStore((s) => s.vaultPath);
  const settings = useSettingsStore();
  const activeLlmConfig = getActiveLlmConfig(settings);

  const [strategies, setStrategies] = useState<AgentRagStrategy[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentRagStepEvent[]>([]);
  const [finalAnswer, setFinalAnswer] = useState("");
  const [sources, setSources] = useState<AgentRagSource[]>([]);
  const [error, setError] = useState("");

  const unlistenRef = useRef<(() => void) | null>(null);

  const loadStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    try {
      const list = await commands.agentRagListStrategies();
      setStrategies(list);
    } catch {
      setStrategies([]);
    } finally {
      setLoadingStrategies(false);
    }
  }, [commands]);

  const runQuery = useCallback(
    async (query: string, strategyId: string) => {
      if (!vaultPath || !activeLlmConfig) {
        setError("请先打开知识库并配置 LLM 模型");
        return;
      }

      setRunning(true);
      setSteps([]);
      setFinalAnswer("");
      setSources([]);
      setError("");

      const requestId = crypto.randomUUID();

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      const eventName = `agent-rag-${requestId}`;

      const unlisten = await listen<AgentRagStepEvent>(eventName, (event) => {
        const evt = event.payload;
        setSteps((prev) => [...prev, evt]);

        if (evt.step_type === "token" && evt.token) {
          setFinalAnswer((prev) => prev + evt.token);
        }
        if (evt.step_type === "done") {
          if (evt.answer) {
            setFinalAnswer(evt.answer);
          }
          if (evt.sources) {
            setSources(evt.sources);
          }
        }
        if (evt.step_type === "error") {
          setError(evt.message || "未知错误");
        }
      });

      unlistenRef.current = unlisten;

      try {
        const { embeddingConfig } = useSettingsStore.getState();
        const activeEmbedConfig = embeddingConfig?.provider
          ? embeddingConfig
          : activeLlmConfig;

        await commands.agentRagRun(
          query,
          strategyId,
          activeLlmConfig,
          activeEmbedConfig,
          requestId,
        );
      } catch (e) {
        setError(String(e));
      } finally {
        setRunning(false);
      }
    },
    [vaultPath, activeLlmConfig, commands],
  );

  const clearSteps = useCallback(() => {
    setSteps([]);
    setFinalAnswer("");
    setSources([]);
    setError("");
  }, []);

  return {
    strategies,
    loadingStrategies,
    running,
    steps,
    finalAnswer,
    sources,
    error,
    loadStrategies,
    runQuery,
    clearSteps,
  };
}