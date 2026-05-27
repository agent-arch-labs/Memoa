import { create } from "zustand";
import type { ChatMessage } from "@/types";
import { getJson, setJson } from "@/services/storageService";

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
  updateLastMessageContent: (convId: string, content: string) => void;
  clearConversations: () => void;
}

function loadConversations(): Conversation[] {
  return getJson<Conversation[]>("conversations", []);
}

function saveConversations(conversations: Conversation[]) {
  setJson("conversations", conversations);
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
    const conversations = [...get().conversations, conv];
    saveConversations(conversations);
    set({ conversations, activeConversationId: id });
    return id;
  },

  deleteConversation: (id: string) => {
    const conversations = get().conversations.filter((c) => c.id !== id);
    saveConversations(conversations);
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
    saveConversations(conversations);
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
    saveConversations(conversations);
    set({ conversations });
  },

  clearConversations: () => {
    saveConversations([]);
    set({ conversations: [], activeConversationId: null });
  },
}));