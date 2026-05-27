import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/appStore";
import { getJson } from "@/services/storageService";
import type { KnowledgeBaseConfig } from "@/components/settings/KnowledgeBaseSettings";

interface TreeItem {
  id: number;
  label: string;
  value: string;
  type: string;
  parent_id: number | null;
  children: TreeItem[];
}

interface BaseItem {
  id: number;
  name: string;
  description: string;
  category: string;
  owner_name: string;
  organization_name: string | null;
  can_view: boolean;
  can_get: boolean;
  folder_count: number;
  document_count: number;
  used_storage_mb: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface BasesResponse {
  code: number;
  msg: string;
  data: BaseItem[];
  page_num: number;
  page_size: number;
  total: number;
  total_page: number;
}

interface FileNodeItem {
  id: number;
  item_type: "folder" | "document";
  name: string;
  type: string;
  size: number;
  created_at: string;
  updated_at: string;
  status: string;
  status_display: string;
  thumbnail: {
    type: string;
    available: boolean;
    supported: boolean;
    placeholder: string;
    has_documents?: boolean;
    has_subfolders?: boolean;
  };
  knowledge_base_id: number;
  doc_id: number | null;
  tags: string[];
  extra_info: Record<string, unknown>;
}

interface FileNodesPagination {
  page_num: number;
  page_size: number;
  total: number;
  total_page: number;
  has_next: boolean;
  has_previous: boolean;
  next_page: number | null;
  previous_page: number | null;
}

interface FileNodesResponse {
  code: number;
  msg: string;
  data: {
    folder: Record<string, unknown> | null;
    items: FileNodeItem[];
    statistics: {
      folders_count: number;
      documents_count: number;
      total_items: number;
    };
    view_config: Record<string, unknown>;
    pagination: FileNodesPagination;
  };
}

type NavLayer =
  | { kind: "tree" }
  | { kind: "bases"; category: string; label: string }
  | { kind: "files"; kbId: number; kbName: string; stack: { name: string; parentId: number | null }[] };

const PAGE_SIZE = 10;

function loadKnowledgeConfig(): KnowledgeBaseConfig {
  return getJson<KnowledgeBaseConfig>("knowledge_base", { endpoint: "", apiKey: "", topK: 10, threshold: 0.5 });
}

function buildApiUrl(endpoint: string): string {
  const raw = endpoint.trim().replace(/\/+$/, "");
  return raw.startsWith("http") ? raw : `http://${raw}`;
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
}

function fileTypeIcon(fileType: string, isFolder: boolean): string {
  if (isFolder) return "📁";
  const docTypes = ["doc", "docx"];
  const sheetTypes = ["xls", "xlsx", "csv"];
  const pdfTypes = ["pdf"];
  const imgTypes = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp"];
  const codeTypes = ["js", "ts", "tsx", "jsx", "py", "java", "go", "rs", "cpp", "c", "h", "json", "xml", "yaml", "yml", "toml"];
  const textTypes = ["txt", "md", "log"];
  const archiveTypes = ["zip", "rar", "7z", "tar", "gz"];

  const t = fileType.toLowerCase();
  if (docTypes.includes(t)) return "📝";
  if (sheetTypes.includes(t)) return "📊";
  if (pdfTypes.includes(t)) return "📕";
  if (imgTypes.includes(t)) return "🖼️";
  if (codeTypes.includes(t)) return "💻";
  if (textTypes.includes(t)) return "📄";
  if (archiveTypes.includes(t)) return "📦";
  return "📎";
}

function statusBadge(status: string, statusDisplay: string): { color: string; label: string } | null {
  if (!status && !statusDisplay) return null;
  const label = statusDisplay || status;
  switch (status) {
    case "completed":
      return { color: "bg-green-500/10 text-green-600", label };
    case "processing":
      return { color: "bg-blue-500/10 text-blue-600", label };
    case "pending":
      return { color: "bg-yellow-500/10 text-yellow-600", label };
    case "failed":
      return { color: "bg-red-500/10 text-red-500", label };
    default:
      return { color: "bg-[var(--color-border)] text-[var(--color-text-muted)]", label };
  }
}

export function KnowledgePanel() {
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setDataSource = useAppStore((s) => s.setDataSource);

  const [nav, setNav] = useState<NavLayer>({ kind: "tree" });

  const [tree, setTree] = useState<TreeItem[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [bases, setBases] = useState<BaseItem[]>([]);
  const [basesPage, setBasesPage] = useState(1);
  const [basesTotal, setBasesTotal] = useState(0);
  const [basesTotalPages, setBasesTotalPages] = useState(0);
  const [basesLoading, setBasesLoading] = useState(false);
  const [basesError, setBasesError] = useState("");
  const [basesContext, setBasesContext] = useState<{ category: string; label: string }>({ category: "", label: "" });

  const [fileItems, setFileItems] = useState<FileNodeItem[]>([]);
  const [fileStats, setFileStats] = useState<{ folders: number; docs: number; total: number }>({ folders: 0, docs: 0, total: 0 });
  const [filePage, setFilePage] = useState(1);
  const [fileTotalPages, setFileTotalPages] = useState(0);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");

  const currentParentId = nav.kind === "files" && nav.stack.length > 0 ? (nav.stack[nav.stack.length - 1].parentId ?? undefined) : undefined;

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBaseName, setNewBaseName] = useState("");
  const [newBaseDesc, setNewBaseDesc] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; base: BaseItem } | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BaseItem | null>(null);
  const [renameBaseName, setRenameBaseName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  const fetchTree = useCallback(async () => {
    const config = loadKnowledgeConfig();
    if (!config.endpoint.trim()) {
      setError("未配置知识库服务地址，请在设置中心「知识库」中配置");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const base = buildApiUrl(config.endpoint);
      const url = `${base}/api/knowledge/basestypes/front_tree/`;
      const headers = buildAuthHeaders(config.apiKey);

      const resp = await fetch(url, { method: "GET", headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (json.code !== 200) throw new Error(json.msg || `code ${json.code}`);

      const rawData: TreeItem[] = json.data || [];

      const flatChildren: TreeItem[] = [];
      for (const root of rawData) {
        if (root.children && root.children.length > 0) {
          flatChildren.push(...root.children);
        }
      }
      setTree(flatChildren);

      const autoExpand = new Set<number>();
      function walk(items: TreeItem[]) {
        for (const item of items) {
          if (item.children && item.children.length > 0) {
            autoExpand.add(item.id);
            walk(item.children);
          }
        }
      }
      walk(flatChildren);
      setExpanded(autoExpand);
    } catch (e) {
      setError(String(e));
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBases = useCallback(async (category: string, page: number) => {
    const config = loadKnowledgeConfig();
    if (!config.endpoint.trim()) return;

    setBasesLoading(true);
    setBasesError("");

    try {
      const base = buildApiUrl(config.endpoint);
      const params = new URLSearchParams({
        category,
        page: String(page),
        page_size: String(PAGE_SIZE),
        search: "",
        ordering: "",
        organization: "",
        isSuperAdmin: "false",
      });
      const url = `${base}/api/knowledge/bases/?${params.toString()}`;
      const headers = buildAuthHeaders(config.apiKey);

      const resp = await fetch(url, { method: "GET", headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json: BasesResponse = await resp.json();
      if (json.code !== 200) throw new Error(json.msg || `code ${json.code}`);

      const visible = (json.data || []).filter((item) => item.can_view);
      setBases(visible);
      setBasesPage(json.page_num);
      setBasesTotal(json.total);
      setBasesTotalPages(json.total_page);
    } catch (e) {
      setBasesError(String(e));
      setBases([]);
    } finally {
      setBasesLoading(false);
    }
  }, []);

  const fetchFileNodes = useCallback(async (kbId: number, parentId: number | undefined, page: number) => {
    const config = loadKnowledgeConfig();
    if (!config.endpoint.trim()) return;

    setFileLoading(true);
    setFileError("");

    try {
      const base = buildApiUrl(config.endpoint);
      const params = new URLSearchParams({
        view: "list",
        ordering: "",
        search: "",
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (parentId !== undefined && parentId !== null) {
        params.set("parent_id", String(parentId));
      }
      const url = `${base}/api/knowledge/bases/${kbId}/file-nodes/items-paginated/?${params.toString()}`;
      const headers = buildAuthHeaders(config.apiKey);

      const resp = await fetch(url, { method: "GET", headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json: FileNodesResponse = await resp.json();
      if (json.code !== 200) throw new Error(json.msg || `code ${json.code}`);

      const data = json.data;
      setFileItems(data.items || []);
      setFileStats({
        folders: data.statistics.folders_count,
        docs: data.statistics.documents_count,
        total: data.statistics.total_items,
      });
      setFilePage(data.pagination.page_num);
      setFileTotalPages(data.pagination.total_page);
    } catch (e) {
      setFileError(String(e));
      setFileItems([]);
    } finally {
      setFileLoading(false);
    }
  }, []);

  async function createBase() {
    if (!newBaseName.trim()) return;
    const config = loadKnowledgeConfig();
    if (!config.endpoint.trim()) return;

    setCreateLoading(true);
    try {
      const base = buildApiUrl(config.endpoint);
      const headers = buildAuthHeaders(config.apiKey);
      const body: Record<string, unknown> = {
        name: newBaseName.trim(),
        category: nav.kind === "bases" ? nav.category : "",
      };
      if (newBaseDesc.trim()) body.description = newBaseDesc.trim();

      const resp = await fetch(`${base}/api/knowledge/bases/`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (json.code !== 200) throw new Error(json.msg || `code ${json.code}`);

      setShowCreateDialog(false);
      setNewBaseName("");
      setNewBaseDesc("");
      fetchBases(nav.kind === "bases" ? nav.category : "", 1);
    } catch (e) {
      console.error("[知识库] 创建失败:", e);
    } finally {
      setCreateLoading(false);
    }
  }

  async function renameBase() {
    if (!renameTarget || !renameBaseName.trim()) return;
    const config = loadKnowledgeConfig();
    if (!config.endpoint.trim()) return;

    setRenameLoading(true);
    try {
      const base = buildApiUrl(config.endpoint);
      const headers = buildAuthHeaders(config.apiKey);

      const resp = await fetch(`${base}/api/knowledge/bases/${renameTarget.id}/`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ name: renameBaseName.trim() }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      if (json.code !== 200) throw new Error(json.msg || `code ${json.code}`);

      setShowRenameDialog(false);
      setRenameTarget(null);
      setRenameBaseName("");
      setContextMenu(null);
      fetchBases(nav.kind === "bases" ? nav.category : "", basesPage);
    } catch (e) {
      console.error("[知识库] 重命名失败:", e);
    } finally {
      setRenameLoading(false);
    }
  }

  async function deleteBase() {
    if (!contextMenu) return;
    const target = contextMenu.base;
    const config = loadKnowledgeConfig();
    if (!config.endpoint.trim()) return;

    try {
      const base = buildApiUrl(config.endpoint);
      const headers = buildAuthHeaders(config.apiKey);

      const resp = await fetch(`${base}/api/knowledge/bases/${target.id}/destroy-with-data/`, {
        method: "DELETE",
        headers,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      setContextMenu(null);
      fetchBases(nav.kind === "bases" ? nav.category : "", basesPage);
    } catch (e) {
      console.error("[知识库] 删除失败:", e);
    }
  }

  function handleBaseContextMenu(e: React.MouseEvent, base: BaseItem) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, base });
  }

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    if (!contextMenu) return;
    function close() {
      setContextMenu(null);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  function gotoBases(category: string, label: string) {
    setNav({ kind: "bases", category, label });
    setBasesContext({ category, label });
    setBasesPage(1);
    fetchBases(category, 1);
    setDataSource("knowledge");
    setContextTarget({ type: "folder", label, category });
  }

  function gotoFiles(kbId: number, kbName: string) {
    setNav({ kind: "files", kbId, kbName, stack: [] });
    setFilePage(1);
    fetchFileNodes(kbId, undefined, 1);
    setDataSource("knowledge");
    setContextTarget({ type: "folder", label: kbName, kbId });
  }

  function goBack() {
    if (nav.kind === "files") {
      if (nav.stack.length > 0) {
        const newStack = nav.stack.slice(0, -1);
        const parent = newStack.length > 0 ? newStack[newStack.length - 1] : null;
        setNav({ kind: "files", kbId: nav.kbId, kbName: nav.kbName, stack: newStack });
        setFilePage(1);
        fetchFileNodes(nav.kbId, parent?.parentId ?? undefined, 1);
        setDataSource("knowledge");
        setContextTarget({ type: "folder", label: parent ? parent.name : nav.kbName, kbId: nav.kbId, parentId: parent?.parentId ?? undefined });
      } else {
        setNav({ kind: "bases", category: basesContext.category, label: basesContext.label });
        setDataSource("knowledge");
        setContextTarget({ type: "folder", label: basesContext.label, category: basesContext.category });
      }
    } else if (nav.kind === "bases") {
      setNav({ kind: "tree" });
      setBases([]);
      setBasesError("");
      setDataSource("knowledge");
      setContextTarget({ type: "all", label: "全部知识库" });
    }
  }

  function goToBasesPage(page: number) {
    if (nav.kind !== "bases") return;
    if (page < 1 || page > basesTotalPages) return;
    fetchBases(nav.category, page);
  }

  function goToFilePage(page: number) {
    if (nav.kind !== "files") return;
    if (page < 1 || page > fileTotalPages) return;
    fetchFileNodes(nav.kbId, currentParentId, page);
  }

  function enterFolder(folderId: number, folderName: string) {
    if (nav.kind !== "files") return;
    const newStack = [...nav.stack, { name: folderName, parentId: folderId }];
    setNav({ kind: "files", kbId: nav.kbId, kbName: nav.kbName, stack: newStack });
    setFilePage(1);
    fetchFileNodes(nav.kbId, folderId, 1);
    setDataSource("knowledge");
    setContextTarget({ type: "folder", label: folderName, kbId: nav.kbId, parentId: folderId });
  }

  function navigateToStackLevel(index: number) {
    if (nav.kind !== "files") return;
    const newStack = nav.stack.slice(0, index);
    const parent = newStack.length > 0 ? newStack[newStack.length - 1] : null;
    setNav({ kind: "files", kbId: nav.kbId, kbName: nav.kbName, stack: newStack });
    setFilePage(1);
    fetchFileNodes(nav.kbId, parent?.parentId ?? undefined, 1);
    setDataSource("knowledge");
    setContextTarget({ type: "folder", label: parent ? parent.name : nav.kbName, kbId: nav.kbId, parentId: parent?.parentId ?? undefined });
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function renderTree(items: TreeItem[], depth: number = 0) {
    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.id}>
          <button
            className="sidebar-item w-full text-left"
            style={{ paddingLeft: `${12 + depth * 12}px` }}
            onClick={() => {
              if (hasChildren) {
                toggleExpand(item.id);
              } else {
                gotoBases(item.value, item.label);
              }
            }}
            title={item.label}
          >
            <span className="shrink-0 text-xs">
              {hasChildren ? (expanded.has(item.id) ? "▾" : "▸") : "📁"}
            </span>
            <span className="truncate text-xs">{item.label}</span>
          </button>
          {hasChildren && expanded.has(item.id) && (
            <div>{renderTree(item.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  }

  function renderBases() {
    if (basesLoading) {
      return (
        <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
          加载中...
        </div>
      );
    }

    if (basesError) {
      return (
        <div className="px-3 py-4 text-xs text-center">
          <p className="text-red-400 mb-2">{basesError}</p>
          <button
            className="btn btn-primary text-xs px-3 py-1"
            onClick={() => fetchBases((nav.kind === "bases" ? nav.category : ""), basesPage)}
          >
            重试
          </button>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 py-1.5 border-b border-[var(--color-border)] shrink-0">
          <button
            className="w-full text-xs px-3 py-1.5 rounded border border-dashed border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 transition-colors"
            onClick={() => {
              if (nav.kind === "bases") {
                setNewBaseName("");
                setNewBaseDesc("");
                setShowCreateDialog(true);
              }
            }}
          >
            + 新建知识库
          </button>
        </div>

        {bases.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
            暂无知识库
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {bases.map((base) => (
              <div
                key={base.id}
                className="px-3 py-2.5 border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]/50 transition-colors cursor-pointer"
                onClick={() => gotoFiles(base.id, base.name)}
                onContextMenu={(e) => handleBaseContextMenu(e, base)}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm shrink-0 mt-0.5">📚</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                        {base.name}
                      </span>
                      {!base.can_get && (
                        <span className="text-[9px] px-1 py-px rounded bg-[var(--color-border)] text-[var(--color-text-muted)] shrink-0">
                          只读
                        </span>
                      )}
                    </div>
                    {base.description && (
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                        {stripHtml(base.description)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {base.folder_count > 0 && (
                        <span className="text-[9px] text-[var(--color-text-muted)]">
                          📂 {base.folder_count}
                        </span>
                      )}
                      {base.document_count > 0 && (
                        <span className="text-[9px] text-[var(--color-text-muted)]">
                          📄 {base.document_count}
                        </span>
                      )}
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        💾 {formatSize(base.used_storage_mb * 1048576)}
                      </span>
                      {base.organization_name && (
                        <span className="text-[9px] text-[var(--color-text-muted)] truncate max-w-[80px]">
                          🏢 {base.organization_name}
                        </span>
                      )}
                    </div>
                    {base.tags.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {base.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[8px] px-1.5 py-px rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        {base.owner_name}
                      </span>
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        {base.updated_at}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {basesTotalPages > 1 && renderPagination(basesPage, basesTotalPages, goToBasesPage)}
          </div>
        )}
      </div>
    );
  }

  function renderFileNodes() {
    if (fileLoading) {
      return (
        <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
          加载中...
        </div>
      );
    }

    if (fileError) {
      return (
        <div className="px-3 py-4 text-xs text-center">
          <p className="text-red-400 mb-2">{fileError}</p>
          <button
            className="btn btn-primary text-xs px-3 py-1"
            onClick={() => fetchFileNodes((nav.kind === "files" ? nav.kbId : 0), currentParentId, filePage)}
          >
            重试
          </button>
        </div>
      );
    }

    if (fileItems.length === 0) {
      return (
        <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
          此目录为空
        </div>
      );
    }

    const folders = fileItems.filter((i) => i.item_type === "folder");
    const documents = fileItems.filter((i) => i.item_type === "document");
    const sorted = [...folders, ...documents];

    return (
      <div className="flex-1 overflow-y-auto">
        {sorted.map((item) => {
          const isFolder = item.item_type === "folder";
          const badge = statusBadge(item.status, item.status_display);

          return (
            <div
              key={item.id}
              className="px-3 py-2 border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]/50 transition-colors cursor-pointer"
              onClick={() => {
                if (isFolder) {
                  enterFolder(item.id, item.name);
                } else {
                  setDataSource("knowledge");
                  setContextTarget({
                    type: "file",
                    label: item.name,
                    kbId: nav.kind === "files" ? nav.kbId : undefined,
                    parentId: currentParentId,
                    docId: item.doc_id ?? undefined,
                  });
                }
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm shrink-0">{fileTypeIcon(item.type, isFolder)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--color-text-primary)] truncate">
                      {item.name}
                    </span>
                    {badge && (
                      <span className={`text-[8px] px-1.5 py-px rounded-full shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {!isFolder && item.size > 0 && (
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        {formatSize(item.size)}
                      </span>
                    )}
                    {isFolder && (
                      <span className="text-[9px] text-[var(--color-text-muted)]">
                        文件夹
                      </span>
                    )}
                    <span className="text-[9px] text-[var(--color-text-muted)]">
                      {item.updated_at.substring(0, 10)}
                    </span>
                  </div>
                  {item.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[8px] px-1.5 py-px rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">›</span>
              </div>
            </div>
          );
        })}

        {fileTotalPages > 1 && renderPagination(filePage, fileTotalPages, goToFilePage)}
      </div>
    );
  }

  function renderPagination(page: number, totalPages: number, onPage: (p: number) => void) {
    return (
      <div className="flex items-center justify-center gap-1 px-3 py-2 border-t border-[var(--color-border)]">
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onPage(1)}
          disabled={page === 1}
        >
          «
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
        >
          ‹
        </button>
        <span className="text-[10px] text-[var(--color-text-muted)] px-1">
          {page} / {totalPages}
        </span>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
        >
          ›
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => onPage(totalPages)}
          disabled={page >= totalPages}
        >
          »
        </button>
      </div>
    );
  }

  function renderHeader() {
    switch (nav.kind) {
      case "tree":
        return (
          <>
            <span className="text-xs font-medium text-[var(--color-text-muted)]">知识库</span>
            <button
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              onClick={fetchTree}
              title="刷新"
              disabled={loading}
            >
              {loading ? "⏳" : "🔄"}
            </button>
          </>
        );

      case "bases":
        return (
          <>
            <button
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1"
              onClick={goBack}
            >
              <span>←</span>
              <span className="font-medium text-[var(--color-text-primary)] truncate">
                {nav.label}
              </span>
            </button>
            <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">
              {basesTotal} 项
            </span>
          </>
        );

      case "files":
        return (
          <>
            <button
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1 min-w-0"
              onClick={goBack}
            >
              <span className="shrink-0">←</span>
              <span className="font-medium text-[var(--color-text-primary)] truncate">
                {nav.stack.length === 0 ? nav.kbName : nav.stack[nav.stack.length - 1].name}
              </span>
            </button>
            <button
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] shrink-0"
              onClick={() => {
                fetchFileNodes(nav.kbId, currentParentId, filePage);
              }}
              title="刷新"
            >
              {fileLoading ? "⏳" : "🔄"}
            </button>
          </>
        );
    }
  }

  function renderBreadcrumb() {
    if (nav.kind !== "files" || nav.stack.length === 0) return null;

    return (
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-[var(--color-border)] overflow-x-auto text-[10px]">
        <button
          className="text-[var(--color-accent)] hover:underline shrink-0"
          onClick={() => navigateToStackLevel(0)}
        >
          {nav.kbName}
        </button>
        {nav.stack.map((s, i) => (
          <span key={i} className="flex items-center gap-0.5 shrink-0">
            <span className="text-[var(--color-text-muted)]">/</span>
            {i === nav.stack.length - 1 ? (
              <span className="text-[var(--color-text-muted)]">{s.name}</span>
            ) : (
              <button
                className="text-[var(--color-accent)] hover:underline"
                onClick={() => navigateToStackLevel(i + 1)}
              >
                {s.name}
              </button>
            )}
          </span>
        ))}
      </div>
    );
  }

  function renderStats() {
    if (nav.kind !== "files" || fileLoading || fileError) return null;

    return (
      <div className="flex items-center gap-3 px-3 py-1 text-[10px] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
        <span>📂 {fileStats.folders} 目录</span>
        <span>📄 {fileStats.docs} 文件</span>
        <span>共 {fileStats.total} 项</span>
      </div>
    );
  }

  function renderContent() {
    switch (nav.kind) {
      case "tree":
        if (error) {
          return (
            <div className="px-3 py-4 text-xs text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <button className="btn btn-primary text-xs px-3 py-1" onClick={fetchTree}>
                重试
              </button>
            </div>
          );
        }
        if (loading) {
          return (
            <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
              加载中...
            </div>
          );
        }
        if (tree.length === 0) {
          return (
            <div className="px-3 py-4 text-xs text-center text-[var(--color-text-muted)]">
              暂无数据
            </div>
          );
        }
        return <div className="flex-1 overflow-y-auto py-1">{renderTree(tree)}</div>;

      case "bases":
        return renderBases();

      case "files":
        return renderFileNodes();
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        {renderHeader()}
      </div>

      {renderBreadcrumb()}
      {renderStats()}

      {renderContent()}

      {contextMenu && (
        <div
          className="fixed z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 160), top: Math.min(contextMenu.y, window.innerHeight - 100) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
            onClick={() => {
              setContextMenu(null);
              setRenameTarget(contextMenu.base);
              setRenameBaseName(contextMenu.base.name);
              setShowRenameDialog(true);
            }}
          >
            <span>✏️</span> 重命名
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
            onClick={() => {
              if (confirm(`确定删除知识库「${contextMenu.base.name}」吗？`)) {
                deleteBase();
              }
            }}
          >
            <span>🗑️</span> 删除
          </button>
        </div>
      )}

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl w-[360px] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">新建知识库</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">名称</label>
                <input
                  autoFocus
                  type="text"
                  className="w-full px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-md bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors"
                  placeholder="输入知识库名称"
                  value={newBaseName}
                  onChange={(e) => setNewBaseName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createBase()}
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">描述（可选）</label>
                <textarea
                  className="w-full px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-md bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors resize-none h-[60px]"
                  placeholder="输入描述"
                  value={newBaseDesc}
                  onChange={(e) => setNewBaseDesc(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                onClick={() => setShowCreateDialog(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                disabled={!newBaseName.trim() || createLoading}
                onClick={createBase}
              >
                {createLoading ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRenameDialog(false)}>
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl w-[320px] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">重命名知识库</h3>
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">新名称</label>
              <input
                autoFocus
                type="text"
                className="w-full px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-md bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] transition-colors"
                value={renameBaseName}
                onChange={(e) => setRenameBaseName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && renameBase()}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                onClick={() => setShowRenameDialog(false)}
              >
                取消
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                disabled={!renameBaseName.trim() || renameLoading}
                onClick={renameBase}
              >
                {renameLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}