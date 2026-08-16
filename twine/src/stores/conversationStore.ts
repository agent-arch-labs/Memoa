import { create } from "zustand";
import type { ChatMessage } from "@/types";
import { getJson, setJson } from "@/services/storageService";

const MAX_CONVERSATIONS = 50;
const SAVE_DEBOUNCE_MS = 1000;

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ConversationStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  createConversation: (title: string) => string;
  deleteConversation: (id: string) => void;
  setActiveConversation: (id: string | null) => void;
  addMessageToConversation: (convId: string, message: ChatMessage) => void;
  updateMessageInConversation: (convId: string, msgId: string, content: string) => void;
  updateMessageSourcesInConversation: (convId: string, msgId: string, sources: ChatMessage["sources"]) => void;
  updateMessageFeedbackInConversation: (convId: string, msgId: string, feedback: "like" | "dislike" | null) => void;
  updateLastMessageContent: (convId: string, content: string) => void;
  clearConversations: () => void;
}

let saveTimer: number | null = null;

function flushSave(conversations: Conversation[]) {
  setJson("conversations", conversations);
}

function scheduleSave(conversations: Conversation[]) {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    flushSave(conversations);
  }, SAVE_DEBOUNCE_MS);
}

function isValidConversationArray(data: unknown): data is Conversation[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as Conversation).id === "string" &&
      Array.isArray((item as Conversation).messages)
  );
}

function loadConversations(): Conversation[] {
  try {
    const raw = getJson<unknown>("conversations", null);
    if (raw === null) return [];
    if (isValidConversationArray(raw)) return raw;
    console.warn("[conversationStore] 存储数据格式异常，已重置");
    return [];
  } catch {
    console.warn("[conversationStore] 加载对话数据失败，已重置");
    return [];
  }
}

function trimConversations(conversations: Conversation[]): Conversation[] {
  if (conversations.length <= MAX_CONVERSATIONS) return conversations;
  return conversations
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversations: loadConversations(),
  activeConversationId: null,

  createConversation: (title: string) => {
    const id = crypto.randomUUID();
    const conv: Conversation = {
      id,
      title: title || "新对话",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const conversations = trimConversations([...get().conversations, conv]);
    flushSave(conversations);
    set({ conversations, activeConversationId: id });
    return id;
  },

  deleteConversation: (id: string) => {
    const conversations = get().conversations.filter((c) => c.id !== id);
    flushSave(conversations);
    const activeConversationId =
      get().activeConversationId === id ? null : get().activeConversationId;
    set({ conversations, activeConversationId });
  },

  setActiveConversation: (id: string | null) => {
    set({ activeConversationId: id });
  },

  addMessageToConversation: (convId: string, message: ChatMessage) => {
    const conversations = get().conversations.map((c) => {
      if (c.id === convId) {
        const updated = {
          ...c,
          messages: [...c.messages, message],
          updatedAt: Date.now(),
        };
        if (!c.title || c.title === "新对话") {
          updated.title = message.content.slice(0, 50);
        }
        return updated;
      }
      return c;
    });
    flushSave(conversations);
    set({ conversations });
  },

  updateMessageInConversation: (convId: string, msgId: string, content: string) => {
    const conversations = get().conversations.map((c) => {
      if (c.id !== convId) return c;
      return {
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, content } : m
        ),
        updatedAt: Date.now(),
      };
    });
    scheduleSave(conversations);
    set({ conversations });
  },

  updateMessageSourcesInConversation: (convId: string, msgId: string, sources: ChatMessage["sources"]) => {
    const conversations = get().conversations.map((c) => {
      if (c.id !== convId) return c;
      return {
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, sources } : m
        ),
        updatedAt: Date.now(),
      };
    });
    flushSave(conversations);
    set({ conversations });
  },

  updateMessageFeedbackInConversation: (convId: string, msgId: string, feedback: "like" | "dislike" | null) => {
    const conversations = get().conversations.map((c) => {
      if (c.id !== convId) return c;
      return {
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, feedback } : m
        ),
        updatedAt: Date.now(),
      };
    });
    flushSave(conversations);
    set({ conversations });
  },

  updateLastMessageContent: (convId: string, content: string) => {
    const conversations = get().conversations.map((c) => {
      if (c.id !== convId) return c;
      const messages = [...c.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
        };
      }
      return { ...c, messages, updatedAt: Date.now() };
    });
    scheduleSave(conversations);
    set({ conversations });
  },

  clearConversations: () => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    flushSave([]);
    set({ conversations: [], activeConversationId: null });
  },
}));