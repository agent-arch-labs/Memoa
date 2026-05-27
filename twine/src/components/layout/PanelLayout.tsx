import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { EditorPanel } from "@/components/editor/EditorPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { useAppStore } from "@/stores/appStore";

const SIDEBAR_WIDTH_KEY = "memoa_sidebar_width";
const CHAT_WIDTH_KEY = "memoa_chat_width";
const SIDEBAR_DEFAULT = 260;
const CHAT_DEFAULT = 320;
const SIDEBAR_MIN = 160;
const CHAT_MIN = 160;
const EDITOR_MIN = 160;

function loadWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const w = parseInt(raw, 10);
      if (w > 0) return w;
    }
  } catch {}
  return fallback;
}

function saveWidth(key: string, width: number) {
  try {
    localStorage.setItem(key, String(width));
  } catch {}
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function PanelLayout() {
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const chatVisible = useAppStore((s) => s.chatVisible);
  const settingsVisible = useAppStore((s) => s.settingsVisible);

  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT));
  const [chatWidth, setChatWidth] = useState(() => loadWidth(CHAT_WIDTH_KEY, CHAT_DEFAULT));

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"sidebar" | "chat" | null>(null);
  const dragStartX = useRef(0);
  const dragStartSidebar = useRef(0);
  const dragStartChat = useRef(0);

  function containerWidth(): number {
    return containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  const sidebarWidthRef = useRef(sidebarWidth);
  const chatWidthRef = useRef(chatWidth);
  sidebarWidthRef.current = sidebarWidth;
  chatWidthRef.current = chatWidth;

  function limitSidebar(total: number, rw: number): [number, number] {
    const effMax = total - CHAT_MIN - EDITOR_MIN - rw;
    return [SIDEBAR_MIN, Math.min(Math.floor(total / 3), effMax)];
  }

  function limitChat(total: number, rw: number): [number, number] {
    const effMax = total - SIDEBAR_MIN - EDITOR_MIN - rw;
    return [CHAT_MIN, Math.min(Math.floor(total / 2), effMax)];
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = e.clientX - dragStartX.current;
      const total = containerWidth();
      const rw = (sidebarVisible ? 4 : 0) + (chatVisible ? 4 : 0);

      if (dragging.current === "sidebar") {
        let next = dragStartSidebar.current + delta;
        const [lo] = limitSidebar(total, rw);
        next = clamp(next, lo, total);

        const wantEditor = total - next - chatWidthRef.current - rw;
        if (wantEditor < EDITOR_MIN) {
          const forcedChat = total - next - EDITOR_MIN - rw;
          chatWidthRef.current = clamp(forcedChat, CHAT_MIN, total);
          setChatWidth(chatWidthRef.current);
          const actualEditor = total - next - chatWidthRef.current - rw;
          if (actualEditor < EDITOR_MIN) {
            next = total - chatWidthRef.current - EDITOR_MIN - rw;
          }
        }

        next = clamp(next, ...limitSidebar(total, rw));
        sidebarWidthRef.current = next;
        setSidebarWidth(next);
      } else {
        let next = dragStartChat.current - delta;
        const [, hi] = limitChat(total, rw);
        next = clamp(next, CHAT_MIN, hi);

        const wantEditor = total - sidebarWidthRef.current - next - rw;
        if (wantEditor < EDITOR_MIN) {
          const forcedSidebar = total - next - EDITOR_MIN - rw;
          sidebarWidthRef.current = clamp(forcedSidebar, SIDEBAR_MIN, total);
          setSidebarWidth(sidebarWidthRef.current);
          const actualEditor = total - sidebarWidthRef.current - next - rw;
          if (actualEditor < EDITOR_MIN) {
            next = total - sidebarWidthRef.current - EDITOR_MIN - rw;
          }
        }

        next = clamp(next, ...limitChat(total, rw));
        chatWidthRef.current = next;
        setChatWidth(next);
      }
    }

    function onUp() {
      if (!dragging.current) return;
      saveWidth(SIDEBAR_WIDTH_KEY, sidebarWidthRef.current);
      saveWidth(CHAT_WIDTH_KEY, chatWidthRef.current);
      dragging.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [sidebarVisible, chatVisible]);

  function startResize(type: "sidebar" | "chat") {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = type;
      dragStartX.current = e.clientX;
      dragStartSidebar.current = sidebarWidthRef.current;
      dragStartChat.current = chatWidthRef.current;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };
  }

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
      {settingsVisible ? (
        <>
          <Sidebar width={sidebarWidth} sidebarVisible={false} />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-[var(--color-border)]">
            <SettingsLayout />
          </div>
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden border-x border-[var(--color-border)]">
            <EditorPanel />
          </main>
        </>
      ) : (
        <>
          <Sidebar width={sidebarWidth} sidebarVisible={sidebarVisible} />

          {sidebarVisible && (
            <div
              className="w-1 cursor-col-resize shrink-0 hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60 z-20 transition-colors relative"
              onMouseDown={startResize("sidebar")}
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>
          )}

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden border-x border-[var(--color-border)]">
            <EditorPanel />
          </main>

          {chatVisible && (
            <div
              className="w-1 cursor-col-resize shrink-0 hover:bg-[var(--color-accent)]/40 active:bg-[var(--color-accent)]/60 z-20 transition-colors relative"
              onMouseDown={startResize("chat")}
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>
          )}

          {chatVisible && <ChatPanel width={chatWidth} />}
        </>
      )}
    </div>
  );
}