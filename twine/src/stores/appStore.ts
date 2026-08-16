import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getJson, setJson } from "@/services/storageService";
import type { AppState, PanelView, ChatMode, ContextTarget, DataSource, MaximizedPanel } from "@/types";

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 14;

const FONT_SIZE_KEY = "font_size";
const AUTO_SAVE_KEY = "auto_save_enabled";
const SHOW_LINE_NUMBERS_KEY = "show_line_numbers";
const CHAT_VISIBLE_KEY = "chat_visible";

function loadFontSize(): number {
  const stored = getJson<number | null>(FONT_SIZE_KEY, null);
  if (typeof stored === "number" && stored >= MIN_FONT_SIZE && stored <= MAX_FONT_SIZE) {
    return stored;
  }
  return DEFAULT_FONT_SIZE;
}

function loadAutoSaveEnabled(): boolean {
  const stored = getJson<boolean | null>(AUTO_SAVE_KEY, null);
  return stored === null ? true : stored;
}

function loadShowLineNumbers(): boolean {
  const stored = getJson<boolean | null>(SHOW_LINE_NUMBERS_KEY, null);
  return stored === null ? true : stored;
}

function loadChatVisible(): boolean {
  const stored = getJson<boolean | null>(CHAT_VISIBLE_KEY, null);
  return stored === null ? true : stored;
}

function saveFontSize(size: number) {
  setJson(FONT_SIZE_KEY, size);
}

function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`;
}

interface AppStore extends AppState {
  openTabs: string[];
  setActiveTab: (path: string) => void;
  closeTab: (path: string) => void;
  closeOtherTabs: (path: string) => void;
  closeAllTabs: () => void;
  setVaultPath: (path: string | null) => void;
  setVaultInfo: (info: AppState["vaultInfo"]) => void;
  setCurrentNote: (path: string | null, content: string) => void;
  setCurrentNoteContent: (content: string) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  toggleChat: () => void;
  setChatVisible: (visible: boolean) => void;
  setSidebarView: (view: PanelView) => void;
  toggleTheme: () => void;
  setEditing: (editing: boolean) => void;
  setSearchQuery: (query: string) => void;
  setIndexing: (indexing: boolean) => void;
  setChatMode: (mode: ChatMode) => void;
  setContextTarget: (target: ContextTarget) => void;
  setDataSource: (source: DataSource) => void;
  incrementTagRefresh: () => void;
  incrementGraphRefresh: () => void;
  setSplitNote: (path: string | null, content: string) => void;
  closeSplitNote: () => void;
  setHighlightText: (text: string | null) => void;
  setHighlight: (text: string | null, offset: number, length: number) => void;
  toggleSettings: () => void;
  setSettingsVisible: (visible: boolean) => void;
  setPendingStockPrompt: (prompt: string | null) => void;
  middlePanel: "editor" | "stock";
  setMiddlePanel: (panel: "editor" | "stock") => void;
  showEditor: () => void;
  showStock: () => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (enabled: boolean) => void;
  savedAt: number;
  markSaved: () => void;
  saveCurrentNote: () => Promise<void>;
  showLineNumbers: boolean;
  setShowLineNumbers: (enabled: boolean) => void;
  toggleMaximizePanel: (panel: "sidebar" | "editor" | "chat") => void;
  setMaximizedPanel: (panel: MaximizedPanel) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  vaultPath: null,
  vaultInfo: null,
  currentNotePath: null,
  currentNoteContent: "",
  sidebarVisible: true,
  chatVisible: loadChatVisible(),
  sidebarView: "files",
  isDark: true,
  isEditing: false,
  searchQuery: "",
  isIndexing: false,
  chatMode: "local" as ChatMode,
  contextTarget: { type: "all", label: "全部知识库" } as ContextTarget,
  dataSource: "local" as DataSource,
  tagRefreshKey: 0,
  graphRefreshKey: 0,
  splitNotePath: null,
  splitNoteContent: "",
  highlightText: null,
  highlightOffset: 0,
  highlightLength: 0,
  settingsVisible: false,
  pendingStockPrompt: null,
  middlePanel: "editor" as "editor" | "stock",
  fontSize: loadFontSize(),
  autoSaveEnabled: loadAutoSaveEnabled(),
  savedAt: 0,
  showLineNumbers: loadShowLineNumbers(),
  maximizedPanel: null as MaximizedPanel,
  openTabs: [] as string[],

  setActiveTab: (path: string) => {
    const state = get();
    if (state.currentNotePath === path) return;
    // 先保存当前笔记
    state.saveCurrentNote();
    // 切换到目标标签
    invoke<string>("read_file", { path }).then((content) => {
      set({
        currentNotePath: path,
        currentNoteContent: content,
        isEditing: false,
        maximizedPanel: state.maximizedPanel === "sidebar" ? null : state.maximizedPanel,
      });
    }).catch((e) => console.error("切换标签失败", e));
  },

  closeTab: (path: string) => {
    const state = get();
    const newTabs = state.openTabs.filter((t) => t !== path);
    set({ openTabs: newTabs });
    // 如果关闭的是当前活动标签，切换到相邻标签
    if (state.currentNotePath === path) {
      if (newTabs.length > 0) {
        const closedIndex = state.openTabs.indexOf(path);
        const nextIndex = Math.min(closedIndex, newTabs.length - 1);
        const nextPath = newTabs[nextIndex];
        invoke<string>("read_file", { path: nextPath }).then((content) => {
          set({ currentNotePath: nextPath, currentNoteContent: content, isEditing: false });
        }).catch(() => {
          set({ currentNotePath: null, currentNoteContent: "" });
        });
      } else {
        set({ currentNotePath: null, currentNoteContent: "" });
      }
    }
  },

  closeOtherTabs: (path: string) => {
    set({ openTabs: [path] });
    if (get().currentNotePath !== path) {
      invoke<string>("read_file", { path }).then((content) => {
        set({ currentNotePath: path, currentNoteContent: content, isEditing: false });
      }).catch(() => {});
    }
  },

  closeAllTabs: () => {
    set({ openTabs: [], currentNotePath: null, currentNoteContent: "" });
  },

  setVaultPath: (path) => set({ vaultPath: path }),
  setVaultInfo: (info) => set({ vaultInfo: info }),
  setCurrentNote: (path, content) =>
    set((state) => {
      const openTabs = path && !state.openTabs.includes(path)
        ? [...state.openTabs, path]
        : state.openTabs;
      return {
        currentNotePath: path,
        currentNoteContent: content,
        isEditing: false,
        openTabs,
        maximizedPanel: state.maximizedPanel === "sidebar" ? null : state.maximizedPanel,
      };
    }),
  setCurrentNoteContent: (content) => set({ currentNoteContent: content }),
  toggleSidebar: () =>
    set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible: boolean) =>
    set({ sidebarVisible: visible }),
  toggleChat: () =>
    set((state) => {
      if (state.settingsVisible) {
        setJson(CHAT_VISIBLE_KEY, true);
        return { settingsVisible: false, chatVisible: true, sidebarVisible: true, sidebarView: "files" as PanelView, maximizedPanel: null };
      }
      const next = !state.chatVisible;
      setJson(CHAT_VISIBLE_KEY, next);
      if (next) {
        return { chatVisible: next, sidebarVisible: true, sidebarView: "files" as PanelView, maximizedPanel: state.maximizedPanel === "editor" || state.maximizedPanel === "sidebar" ? null : state.maximizedPanel };
      }
      return { chatVisible: next, maximizedPanel: state.maximizedPanel === "chat" ? null : state.maximizedPanel };
    }),
  setChatVisible: (visible: boolean) => {
    setJson(CHAT_VISIBLE_KEY, visible);
    set((state) => ({
      chatVisible: visible,
      maximizedPanel: visible && state.maximizedPanel !== "chat" ? null : state.maximizedPanel,
    }));
  },
  setSidebarView: (view) => set({ sidebarView: view }),
  toggleTheme: () => {
    const next = !get().isDark;
    document.documentElement.classList.toggle("dark", next);
    set({ isDark: next });
  },
  setEditing: (editing) => set({ isEditing: editing }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIndexing: (indexing) => set({ isIndexing: indexing }),
  setChatMode: (mode) => set({ chatMode: mode }),
  setContextTarget: (target) => set({ contextTarget: target }),
  setDataSource: (source) => set({ dataSource: source }),
  incrementTagRefresh: () => set((s) => ({ tagRefreshKey: s.tagRefreshKey + 1 })),
  incrementGraphRefresh: () => set((s) => ({ graphRefreshKey: s.graphRefreshKey + 1 })),
  setSplitNote: (path, content) =>
    set({ splitNotePath: path, splitNoteContent: content }),
  closeSplitNote: () =>
    set({ splitNotePath: null, splitNoteContent: "" }),
  setHighlightText: (text) => set({ highlightText: text }),
  setHighlight: (text, offset, length) =>
    set({ highlightText: text, highlightOffset: offset, highlightLength: length }),
  toggleSettings: () =>
    set((state) => {
      const next = !state.settingsVisible;
      const nextChatVisible = next ? false : state.chatVisible;
      setJson(CHAT_VISIBLE_KEY, nextChatVisible);
      return { settingsVisible: next, chatVisible: nextChatVisible, sidebarVisible: next ? true : state.sidebarVisible, maximizedPanel: null };
    }),
  setSettingsVisible: (visible) => set({ settingsVisible: visible }),
  setPendingStockPrompt: (prompt) => set({ pendingStockPrompt: prompt }),
  setMiddlePanel: (panel) => set({ middlePanel: panel }),
  showEditor: () => set((state) => ({
    middlePanel: "editor",
    maximizedPanel: state.maximizedPanel === "sidebar" || state.maximizedPanel === "chat" ? null : state.maximizedPanel,
  })),
  showStock: () => set((state) => ({
    middlePanel: "stock",
    maximizedPanel: state.maximizedPanel === "sidebar" || state.maximizedPanel === "chat" ? null : state.maximizedPanel,
  })),

  setFontSize: (size: number) => {
    const clamped = clampFontSize(size);
    applyFontSize(clamped);
    saveFontSize(clamped);
    set({ fontSize: clamped });
  },

  increaseFontSize: () => {
    const next = clampFontSize(get().fontSize + 1);
    applyFontSize(next);
    saveFontSize(next);
    set({ fontSize: next });
  },

  decreaseFontSize: () => {
    const next = clampFontSize(get().fontSize - 1);
    applyFontSize(next);
    saveFontSize(next);
    set({ fontSize: next });
  },

  setAutoSaveEnabled: (enabled: boolean) => {
    setJson(AUTO_SAVE_KEY, enabled);
    set({ autoSaveEnabled: enabled });
  },

  markSaved: () => set({ savedAt: Date.now() }),

  saveCurrentNote: async () => {
    const state = get();
    if (!state.currentNotePath || !state.autoSaveEnabled || !state.isEditing) return;
    try {
      await invoke<void>("write_file", { path: state.currentNotePath, content: state.currentNoteContent });
      get().markSaved();
      get().incrementTagRefresh();
      get().incrementGraphRefresh();
    } catch (e) {
      console.error("切换前自动保存失败", e);
    }
  },

  setShowLineNumbers: (enabled: boolean) => {
    setJson(SHOW_LINE_NUMBERS_KEY, enabled);
    set({ showLineNumbers: enabled });
  },

  setMaximizedPanel: (panel: MaximizedPanel) => set({ maximizedPanel: panel }),

  toggleMaximizePanel: (panel: "sidebar" | "editor" | "chat") => {
    const state = get();
    if (state.maximizedPanel === panel) {
      set({ maximizedPanel: null });
    } else {
      if (panel === "sidebar" && !state.sidebarVisible) {
        set({ sidebarVisible: true });
      }
      if (panel === "chat" && !state.chatVisible) {
        setJson(CHAT_VISIBLE_KEY, true);
        set({ chatVisible: true });
      }
      set({ maximizedPanel: panel });
    }
  },
}));

export { loadFontSize, saveFontSize, clampFontSize, applyFontSize };