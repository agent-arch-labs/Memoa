import { useEffect } from "react";
import { useAppStore } from "@/stores/appStore";

interface ShortcutMap {
  [key: string]: () => void;
}

export function useKeyboardShortcuts() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleChat = useAppStore((s) => s.toggleChat);
  const setSidebarView = useAppStore((s) => s.setSidebarView);
  const increaseFontSize = useAppStore((s) => s.increaseFontSize);
  const decreaseFontSize = useAppStore((s) => s.decreaseFontSize);

  useEffect(() => {
    const shortcuts: ShortcutMap = {
      "KeyB": toggleSidebar,
      "KeyK": toggleChat,
      "Digit1": () => setSidebarView("files"),
      "Digit2": () => setSidebarView("search"),
      "Digit3": () => setSidebarView("tags"),
      "Digit4": () => setSidebarView("graph"),
      "Equal": increaseFontSize,
      "NumpadAdd": increaseFontSize,
      "Minus": decreaseFontSize,
      "NumpadSubtract": decreaseFontSize,
    };

    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const action = shortcuts[e.code];
      if (action) {
        e.preventDefault();
        action();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, toggleChat, setSidebarView, increaseFontSize, decreaseFontSize]);
}