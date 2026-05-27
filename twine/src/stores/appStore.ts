import { create } from "zustand";
import { getJson, setJson } from "@/services/storageService";
import type { AppState, PanelView, ChatMessage, ChatMode, ContextTarget, MessageSource, DataSource } from "@/types";

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 14;

const FONT_SIZE_KEY = "font_size";

function loadFontSize(): number {
  const stored = getJson<number | null>(FONT_SIZE_KEY, null);
  if (typeof stored === "number" && stored >= MIN_FONT_SIZE && stored <= MAX_FONT_SIZE) {
    return stored;
  }
  return DEFAULT_FONT_SIZE;
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
  addChatMessage: (message: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  updateChatMessage: (id: string, content: string) => void;
  updateChatMessageFeedback: (id: string, feedback: "like" | "dislike" | null) => void;
  updateChatMessageSources: (id: string, sources: MessageSource[]) => void;
  clearChat: () => void;
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
  fontSize: number;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  vaultPath: null,
  vaultInfo: null,
  currentNotePath: null,
  currentNoteContent: "",
  sidebarVisible: true,
  chatVisible: false,
  sidebarView: "files",
  isDark: true,
  isEditing: false,
  searchQuery: "",
  chatMessages: [],
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
  fontSize: loadFontSize(),

  setVaultPath: (path) => set({ vaultPath: path }),
  setVaultInfo: (info) => set({ vaultInfo: info }),
  setCurrentNote: (path, content) =>
    set({
      currentNotePath: path,
      currentNoteContent: content,
      isEditing: false,
    }),
  setCurrentNoteContent: (content) => set({ currentNoteContent: content }),
  toggleSidebar: () =>
    set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible: boolean) =>
    set({ sidebarVisible: visible }),
  toggleChat: () =>
    set((state) => {
      if (state.settingsVisible) {
        return { settingsVisible: false, chatVisible: true };
      }
      return { chatVisible: !state.chatVisible };
    }),
  setChatVisible: (visible: boolean) =>
    set({ chatVisible: visible }),
  setSidebarView: (view) => set({ sidebarView: view }),
  toggleTheme: () => {
    const next = !get().isDark;
    document.documentElement.classList.toggle("dark", next);
    set({ isDark: next });
  },
  setEditing: (editing) => set({ isEditing: editing }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, message],
    })),
  updateLastAssistantMessage: (content) =>
    set((state) => {
      const messages = [...state.chatMessages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          messages[i] = { ...messages[i], content };
          break;
        }
      }
      return { chatMessages: messages };
    }),
  updateChatMessage: (id, content) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id === id ? { ...m, content } : m
      ),
    })),
  updateChatMessageFeedback: (id, feedback) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id === id ? { ...m, feedback } : m
      ),
    })),
  updateChatMessageSources: (id, sources) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((m) =>
        m.id === id ? { ...m, sources } : m
      ),
    })),
  clearChat: () => set({ chatMessages: [] }),
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
      return { settingsVisible: next, chatVisible: next ? false : state.chatVisible };
    }),
  setSettingsVisible: (visible) => set({ settingsVisible: visible }),

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
}));

export { loadFontSize, saveFontSize, clampFontSize, applyFontSize };