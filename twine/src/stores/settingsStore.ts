import { create } from "zustand";
import { getJson, setJson } from "@/services/storageService";

export type ModelProvider = "ollama" | "openai_compatible" | "zhipu";

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  apiUrl: string;
  apiKey: string;
}

export interface LlmModelConfig {
  id: string;
  name: string;
  provider: ModelProvider;
  modelId: string;
  apiUrl: string;
  apiKey: string;
}

export interface AppSettings {
  llmModels: LlmModelConfig[];
  activeLlmModelId: string | null;
  embeddingConfig: ModelConfig;
  ollamaUrl: string;
  llmModel: string;
  embeddingModel: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

function defaultSettings(): AppSettings {
  const id = generateId();
  return {
    llmModels: [
      {
        id,
        name: "Ollama Llama3.2",
        provider: "ollama",
        modelId: "llama3.2:3b",
        apiUrl: "http://127.0.0.1:11434",
        apiKey: "",
      },
    ],
    activeLlmModelId: id,
    embeddingConfig: {
      provider: "ollama",
      modelId: "nomic-embed-text",
      apiUrl: "http://127.0.0.1:11434",
      apiKey: "",
    },
    ollamaUrl: "http://127.0.0.1:11434",
    llmModel: "llama3.2:3b",
    embeddingModel: "nomic-embed-text",
  };
}

function loadSettings(): AppSettings {
  const defaults = defaultSettings();
  const parsed = getJson<Partial<AppSettings>>("settings", {});
  const llmModels = parsed.llmModels?.length
    ? parsed.llmModels
    : defaults.llmModels;
  const activeLlmModelId =
    parsed.activeLlmModelId && llmModels.find((m: LlmModelConfig) => m.id === parsed.activeLlmModelId)
      ? parsed.activeLlmModelId
      : llmModels[0]?.id || null;
  return {
    ...defaults,
    ...parsed,
    llmModels,
    activeLlmModelId,
    embeddingConfig: { ...defaults.embeddingConfig, ...parsed.embeddingConfig },
  };
}

function saveSettings(settings: AppSettings) {
  setJson("settings", settings);
}

export function getActiveLlmConfig(settings: AppSettings): ModelConfig | null {
  if (!settings.activeLlmModelId) return null;
  const model = settings.llmModels.find((m) => m.id === settings.activeLlmModelId);
  if (!model) return null;
  return {
    provider: model.provider,
    modelId: model.modelId,
    apiUrl: model.apiUrl,
    apiKey: model.apiKey,
  };
}

interface SettingsStore extends AppSettings {
  addLlmModel: (model: Omit<LlmModelConfig, "id">) => string;
  updateLlmModel: (id: string, partial: Partial<LlmModelConfig>) => void;
  deleteLlmModel: (id: string) => void;
  setActiveLlmModel: (id: string | null) => void;
  setEmbeddingConfig: (config: Partial<ModelConfig>) => void;
  importLlmModels: (models: Omit<LlmModelConfig, "id">[]) => string[];
  setOllamaUrl: (url: string) => void;
  setLlmModel: (model: string) => void;
  setEmbeddingModel: (model: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const initial = loadSettings();

  function syncLegacy(settings: AppSettings) {
    const active = getActiveLlmConfig(settings);
    if (active) {
      if (active.provider === "ollama") {
        settings.ollamaUrl = active.apiUrl;
      }
      settings.llmModel = active.modelId;
    }
    settings.embeddingModel = settings.embeddingConfig.modelId;
    return settings;
  }

  return {
    ...initial,

    addLlmModel: (model: Omit<LlmModelConfig, "id">) => {
      const id = generateId();
      const newModel: LlmModelConfig = { id, ...model };
      const current = get();
      const llmModels = [...current.llmModels, newModel];
      const updated = {
        ...current,
        llmModels,
        activeLlmModelId: current.activeLlmModelId || id,
      };
      syncLegacy(updated);
      set(updated);
      saveSettings(updated);
      return id;
    },

    updateLlmModel: (id: string, partial: Partial<LlmModelConfig>) => {
      const current = get();
      const llmModels = current.llmModels.map((m) =>
        m.id === id ? { ...m, ...partial } : m,
      );
      const updated = { ...current, llmModels };
      syncLegacy(updated);
      set(updated);
      saveSettings(updated);
    },

    deleteLlmModel: (id: string) => {
      const current = get();
      const llmModels = current.llmModels.filter((m) => m.id !== id);
      const activeLlmModelId =
        current.activeLlmModelId === id
          ? llmModels[0]?.id || null
          : current.activeLlmModelId;
      const updated = { ...current, llmModels, activeLlmModelId };
      syncLegacy(updated);
      set(updated);
      saveSettings(updated);
    },

    setActiveLlmModel: (id: string | null) => {
      const current = get();
      const updated = { ...current, activeLlmModelId: id };
      syncLegacy(updated);
      set(updated);
      saveSettings(updated);
    },

    setEmbeddingConfig: (partial: Partial<ModelConfig>) => {
      const current = get();
      const embeddingConfig = { ...current.embeddingConfig, ...partial };
      const updated = { ...current, embeddingConfig };
      syncLegacy(updated);
      set(updated);
      saveSettings(updated);
    },

    importLlmModels: (models: Omit<LlmModelConfig, "id">[]) => {
      const current = get();
      const newModels = models.map((m) => ({ ...m, id: generateId() }));
      const existingUrls = new Set(current.llmModels.map((m) => m.modelId + m.apiUrl));
      const uniqueModels = newModels.filter(
        (m) => !existingUrls.has(m.modelId + m.apiUrl),
      );
      const llmModels = [...current.llmModels, ...uniqueModels];
      const updated = {
        ...current,
        llmModels,
        activeLlmModelId: current.activeLlmModelId || llmModels[0]?.id || null,
      };
      syncLegacy(updated);
      set(updated);
      saveSettings(updated);
      return uniqueModels.map((m) => m.id);
    },

    setOllamaUrl: (url: string) => {
      const current = get();
      const updated = { ...current, ollamaUrl: url };
      set(updated);
      saveSettings(updated);
    },

    setLlmModel: (model: string) => {
      const current = get();
      const updated = { ...current, llmModel: model };
      set(updated);
      saveSettings(updated);
    },

    setEmbeddingModel: (model: string) => {
      const current = get();
      const updated = { ...current, embeddingModel: model };
      set(updated);
      saveSettings(updated);
    },
  };
});

export function modelConfigToTauriArgs(config: ModelConfig) {
  return {
    provider: config.provider,
    model_id: config.modelId,
    api_url: config.apiUrl,
    api_key: config.apiKey || "",
  };
}