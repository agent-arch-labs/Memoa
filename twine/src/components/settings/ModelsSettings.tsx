import { useState, useRef } from "react";
import {
  useSettingsStore,
  getActiveLlmConfig,
  type ModelProvider,
  type LlmModelConfig,
} from "@/stores/settingsStore";
import { useTauriCommands } from "@/hooks/useTauriCommands";
import { t } from "@/i18n/locale";
import { SelectDropdown } from "./SelectDropdown";

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  ollama: "Ollama",
  openai_compatible: "OpenAI Compatible",
  zhipu: "Zhipu AI",
};

const PROVIDER_SHORT: Record<ModelProvider, string> = {
  ollama: "Local",
  openai_compatible: "Cloud",
  zhipu: "Cloud",
};

function LlmModelForm({
  model,
  onSave,
  onCancel,
}: {
  model?: LlmModelConfig;
  onSave: (data: Omit<LlmModelConfig, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(model?.name || "");
  const [provider, setProvider] = useState<ModelProvider>(model?.provider || "openai_compatible");
  const [modelId, setModelId] = useState(model?.modelId || "");
  const [apiUrl, setApiUrl] = useState(model?.apiUrl || "");
  const [apiKey, setApiKey] = useState(model?.apiKey || "");

  function handleProviderChange(p: ModelProvider) {
    setProvider(p);
    if (!apiUrl) {
      const defaults: Record<ModelProvider, string> = {
        ollama: "http://127.0.0.1:11434",
        openai_compatible: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        zhipu: "https://open.bigmodel.cn/api/paas/v4",
      };
      setApiUrl(defaults[p]);
    }
  }

  function handleSubmit() {
    onSave({ name: name.trim() || modelId, provider, modelId: modelId.trim(), apiUrl: apiUrl.trim(), apiKey });
    onCancel();
  }

  return (
    <div className="space-y-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-secondary)]">
      <label className="block text-[11px] text-[var(--color-text-muted)]">Name</label>
      <input
        className="input text-xs w-full"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. GPT-4o"
      />

      <label className="block text-[11px] text-[var(--color-text-muted)]">Provider</label>
      <div className="flex gap-1">
        {(Object.keys(PROVIDER_LABELS) as ModelProvider[]).map((p) => (
          <button
            key={p}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${
              provider === p
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-medium"
                : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]"
            }`}
            onClick={() => handleProviderChange(p)}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>

      <label className="block text-[11px] text-[var(--color-text-muted)]">Model ID</label>
      <input
        className="input text-xs w-full"
        value={modelId}
        onChange={(e) => setModelId(e.target.value)}
        placeholder="e.g. glm-4-flash"
      />

      <label className="block text-[11px] text-[var(--color-text-muted)]">API URL</label>
      <input
        className="input text-xs w-full"
        value={apiUrl}
        onChange={(e) => setApiUrl(e.target.value)}
        placeholder="https://api.openai.com/v1"
      />

      {provider !== "ollama" && (
        <>
          <label className="block text-[11px] text-[var(--color-text-muted)]">API Key</label>
          <input
            className="input text-xs w-full"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-xxxxx"
          />
        </>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary text-xs py-1 px-3" onClick={handleSubmit}>
          {model ? "Save" : "Add"}
        </button>
        <button className="btn btn-ghost text-xs py-1 px-3" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

function LlmModelItem({
  model,
  isActive,
  commands,
  onActivate,
  onEdit,
  onDelete,
}: {
  model: LlmModelConfig;
  isActive: boolean;
  commands: ReturnType<typeof useTauriCommands>;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [testStatus, setTestStatus] = useState<string | null>(null);

  async function handleTest(e: React.MouseEvent) {
    e.stopPropagation();
    setTestStatus("...");
    try {
      const ok = await commands.modelChatCheck({
        provider: model.provider,
        modelId: model.modelId,
        apiUrl: model.apiUrl,
        apiKey: model.apiKey,
      });
      setTestStatus(ok ? "✓" : "✕");
    } catch {
      setTestStatus("✕");
    }
  }

  return (
    <div
      className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[var(--color-surface-hover)] text-xs ${
        isActive
          ? "bg-[var(--color-surface-hover)] border-l-2 border-[var(--color-accent)]"
          : ""
      }`}
      onClick={onActivate}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          model.provider === "ollama" ? "bg-green-400" : "bg-blue-400"
        }`}
      />
      <span className="flex-1 truncate">{model.name}</span>
      <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
        {PROVIDER_SHORT[model.provider]}
      </span>
      <button
        className="btn btn-ghost px-0.5 text-[10px] shrink-0"
        onClick={handleTest}
        title="Test connection"
      >
        {testStatus || "⟳"}
      </button>
      <button
        className="btn btn-ghost px-0.5 text-[10px] shrink-0"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        title="Edit"
      >
        ✎
      </button>
      <button
        className="btn btn-ghost px-0.5 text-[10px] shrink-0"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

export function ModelsSettings() {
  const settings = useSettingsStore();
  const commands = useTauriCommands();
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [embedStatus, setEmbedStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeConfig = getActiveLlmConfig(settings);
  const editingModel = editingModelId
    ? settings.llmModels.find((m) => m.id === editingModelId)
    : null;

  function handleLlmSave(data: Omit<LlmModelConfig, "id">) {
    if (editingModelId) {
      settings.updateLlmModel(editingModelId, data);
      setEditingModelId(null);
    } else {
      settings.addLlmModel(data);
      setShowAddForm(false);
    }
  }

  function handleLlmDelete(id: string) {
    settings.deleteLlmModel(id);
  }

  async function handleEmbedTest() {
    setEmbedStatus("Testing...");
    try {
      const ok = await commands.modelHealthCheck({
        provider: settings.embeddingConfig.provider,
        modelId: settings.embeddingConfig.modelId,
        apiUrl: settings.embeddingConfig.apiUrl,
        apiKey: settings.embeddingConfig.apiKey,
      });
      setEmbedStatus(ok ? "✓ Connected" : "✕ Failed");
    } catch {
      setEmbedStatus("✕ Failed");
    }
  }

  async function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const generations = (json.generations || []) as Array<{
        name?: string;
        uid?: string;
        url: string;
        appkey?: string;
        deploy?: string;
      }>;

      function mapDeploy(d?: string): ModelProvider {
        switch (d?.toLowerCase()) {
          case "ollama": return "ollama";
          case "zhipu": return "zhipu";
          default: return "openai_compatible";
        }
      }

      const models = generations.map((g) => ({
        name: g.name || g.uid || "Imported Model",
        provider: mapDeploy(g.deploy),
        modelId: g.uid || "",
        apiUrl: g.url,
        apiKey: g.appkey || "",
      }));
      settings.importLlmModels(models);
    } catch {}
    e.target.value = "";
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              LLM Models
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              {t("settings.models.desc")}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="btn btn-ghost text-[10px] py-0.5 px-2"
              onClick={handleImportClick}
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              className="btn btn-ghost text-[10px] py-0.5 px-2"
              onClick={() => {
                setShowAddForm(true);
                setEditingModelId(null);
              }}
            >
              + Add
            </button>
          </div>
        </div>

        <div className="border border-[var(--color-border)] rounded overflow-hidden mb-2">
          {settings.llmModels.map((m) => (
            <LlmModelItem
              key={m.id}
              model={m}
              isActive={m.id === settings.activeLlmModelId}
              commands={commands}
              onActivate={() => settings.setActiveLlmModel(m.id)}
              onEdit={() => { setEditingModelId(m.id); setShowAddForm(false); }}
              onDelete={() => handleLlmDelete(m.id)}
            />
          ))}
        </div>

        {activeConfig && (
          <p className="text-[10px] text-[var(--color-text-muted)] truncate">
            Active: {activeConfig.modelId}
            {activeConfig.provider === "ollama" ? "" : ` @ ${activeConfig.apiUrl}`}
          </p>
        )}

        {(showAddForm || editingModel) && (
          <LlmModelForm
            model={editingModel || undefined}
            onSave={handleLlmSave}
            onCancel={() => { setShowAddForm(false); setEditingModelId(null); }}
          />
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] mb-2 uppercase tracking-wider">
          Embedding Model
        </h3>

        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
          Provider
        </label>
        <SelectDropdown
          className="w-full mb-2"
          value={settings.embeddingConfig.provider}
          options={Object.entries(PROVIDER_LABELS).map(([k, v]) => ({ value: k, label: v }))}
          onChange={(val) =>
            settings.setEmbeddingConfig({
              provider: val as ModelProvider,
            })
          }
        />

        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
          API URL
        </label>
        <input
          className="input text-xs mb-2 w-full"
          value={settings.embeddingConfig.apiUrl}
          onChange={(e) =>
            settings.setEmbeddingConfig({ apiUrl: e.target.value })
          }
          placeholder="http://127.0.0.1:11434"
        />

        {settings.embeddingConfig.provider !== "ollama" && (
          <>
            <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
              API Key
            </label>
            <input
              className="input text-xs mb-2 w-full"
              type="password"
              value={settings.embeddingConfig.apiKey}
              onChange={(e) =>
                settings.setEmbeddingConfig({ apiKey: e.target.value })
              }
              placeholder="sk-xxxxx"
            />
          </>
        )}

        <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
          Model Name
        </label>
        <input
          className="input text-xs mb-2 w-full"
          value={settings.embeddingConfig.modelId}
          onChange={(e) =>
            settings.setEmbeddingConfig({ modelId: e.target.value })
          }
          placeholder="nomic-embed-text"
        />

        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost text-xs py-1 px-3"
            onClick={handleEmbedTest}
          >
            Test Connection
          </button>
          {embedStatus && (
            <span
              className={`text-[11px] ${
                embedStatus.startsWith("✓")
                  ? "text-green-400"
                  : embedStatus === "Testing..."
                    ? "text-[var(--color-text-muted)]"
                    : "text-red-400"
              }`}
            >
              {embedStatus}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}