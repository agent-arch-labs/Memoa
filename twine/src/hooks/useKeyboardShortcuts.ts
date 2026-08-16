import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { useQuoteStore } from "@/stores/quoteStore";

interface ShortcutMap {
  [key: string]: () => void;
}

export function useKeyboardShortcuts() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible);
  const toggleSettings = useAppStore((s) => s.toggleSettings);
  const increaseFontSize = useAppStore((s) => s.increaseFontSize);
  const decreaseFontSize = useAppStore((s) => s.decreaseFontSize);
  const saveCurrentNote = useAppStore((s) => s.saveCurrentNote);
  const setMaximizedPanel = useAppStore((s) => s.setMaximizedPanel);

  useEffect(() => {
    const shortcuts: ShortcutMap = {
      "KeyB": toggleSidebar,
      "KeyK": toggleChat,
      "KeyS": saveCurrentNote,
      "Digit1": () => {
        if (!useAppStore.getState().sidebarVisible) useAppStore.getState().setSidebarVisible(true);
        setSidebarView("files");
      },
      "Digit2": () => {
        if (!useAppStore.getState().sidebarVisible) useAppStore.getState().setSidebarVisible(true);
        setSidebarView("search");
      },
      "Digit3": () => {
        if (!useAppStore.getState().sidebarVisible) useAppStore.getState().setSidebarVisible(true);
        setSidebarView("tags");
      },
      "Digit4": () => {
        if (!useAppStore.getState().sidebarVisible) useAppStore.getState().setSidebarVisible(true);
        setSidebarView("graph");
      },
      "Equal": increaseFontSize,
      "NumpadAdd": increaseFontSize,
      "Minus": decreaseFontSize,
      "NumpadSubtract": decreaseFontSize,
    };

    // Ctrl+Shift shortcuts (VSCode style)
    const shiftShortcuts: ShortcutMap = {
      "KeyE": () => {
        setMaximizedPanel(null);
        setSidebarVisible(true);
        setSidebarView("files");
      },
      "KeyF": () => {
        setMaximizedPanel(null);
        setSidebarVisible(true);
        setSidebarView("search");
      },
      "KeyK": () => {
        setMaximizedPanel(null);
        setSidebarVisible(true);
        setSidebarView("knowledge");
      },
      "KeyR": () => {
        setMaximizedPanel(null);
        setSidebarVisible(true);
        setSidebarView("review");
      },
      "KeyS": () => {
        setMaximizedPanel(null);
        setSidebarVisible(true);
        setSidebarView("stocks");
      },
      "KeyM": () => {
        setMaximizedPanel(null);
      },
    };

    function handler(e: KeyboardEvent) {
      if (e.isComposing) return;
      const mod = e.metaKey || e.ctrlKey;

      // ─── A股风格功能键 ─────────────────────────────────
      // F5: 刷新行情数据
      if (e.key === "F5") {
        e.preventDefault();
        useQuoteStore.getState().refresh();
        return;
      }

      // F10: 查看股票详情（如果当前有选中的股票）
      if (e.key === "F10") {
        e.preventDefault();
        const stockState = useStockDetailStore.getState();
        if (stockState.visible) {
          // 已打开详情时，F10 刷新详情数据
          stockState.setAutoRefresh(!stockState.autoRefresh);
        }
        return;
      }

      // Escape: 逐层关闭（A股软件习惯：先关详情，再关面板）
      if (e.key === "Escape") {
        const state = useAppStore.getState();
        const stockState = useStockDetailStore.getState();
        // 优先关闭股票详情
        if (stockState.visible) {
          stockState.close();
          return;
        }
        if (state.maximizedPanel) {
          state.setMaximizedPanel(null);
          return;
        }
        if (state.settingsVisible) {
          state.toggleSettings();
          return;
        }
        if (state.chatVisible) {
          state.toggleChat();
          return;
        }
        if (state.sidebarVisible) {
          state.setSidebarVisible(false);
          return;
        }
        return;
      }

      if (!mod) return;

      // Ctrl+Shift shortcuts
      if (e.shiftKey) {
        const action = shiftShortcuts[e.code];
        if (action) {
          e.preventDefault();
          action();
          return;
        }
      }

      // Ctrl+, for settings (no shift needed)
      if (e.code === "Comma") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      const action = shortcuts[e.code];
      if (action) {
        e.preventDefault();
        action();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, toggleChat, setSidebarView, setSidebarVisible, toggleSettings, increaseFontSize, decreaseFontSize, saveCurrentNote, setMaximizedPanel]);
}