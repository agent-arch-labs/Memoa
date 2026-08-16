import { useState, useRef, useEffect, useCallback } from "react";
import { ActivityBar } from "./ActivityBar";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { EditorPanel } from "@/components/editor/EditorPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { StockDetailPanel } from "@/components/astock/StockDetailPanel";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useAppStore } from "@/stores/appStore";
import { useStockDetailStore } from "@/stores/stockDetailStore";

const SIDEBAR_WIDTH_KEY = "memoa_sidebar_width";
const CHAT_WIDTH_KEY = "memoa_chat_width";
const SIDEBAR_DEFAULT = 260;
const CHAT_DEFAULT = 340;
const SIDEBAR_MIN = 160;
const CHAT_MIN = 200;
const EDITOR_MIN = 200;
// 挤压折叠阈值：面板宽度低于此值时自动折叠
const COLLAPSE_THRESHOLD = 80;
// 展开拖拽的最小距离
const EXPAND_DRAG_MIN = 30;

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

// ─── Resize Handle 组件 ────────────────────────────────────
function ResizeHandle({ type, side, onResize, onReset }: {
  type: "sidebar" | "chat";
  side: "left" | "right";
  onResize: (type: "sidebar" | "chat") => (e: React.MouseEvent) => void;
  onReset: (type: "sidebar" | "chat") => void;
}) {
  return (
    <div
      className="w-px shrink-0 bg-[var(--color-border)] hover:bg-[var(--color-accent)]/60 active:bg-[var(--color-accent)] cursor-col-resize transition-colors relative z-10 group"
      onMouseDown={onResize(type)}
      onDoubleClick={() => onReset(type)}
    >
      <div className={`absolute inset-y-0 ${side === "left" ? "-left-1.5 right-0" : "-right-1.5 left-0"} group-hover:bg-[var(--color-accent)]/15`} />
    </div>
  );
}

// ─── 折叠边缘拖拽区域 ──────────────────────────────────────
function CollapseEdge({ side, onExpand }: {
  side: "left" | "right";
  onExpand: (type: "sidebar-expand" | "chat-expand") => (e: React.MouseEvent) => void;
}) {
  const type = side === "left" ? "sidebar-expand" : "chat-expand";
  return (
    <div
      className={`w-1 shrink-0 cursor-col-resize hover:bg-[var(--color-accent)]/30 transition-colors relative z-10 ${side === "left" ? "border-l border-[var(--color-border)]" : "border-r border-[var(--color-border)]"}`}
      onMouseDown={onExpand(type)}
      title={side === "left" ? "拖拽展开侧边栏" : "拖拽展开对话面板"}
    >
      <div className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-0" : "right-0"} w-1 h-8 rounded-full bg-[var(--color-border)] group-hover:bg-[var(--color-accent)]/50`} />
    </div>
  );
}

/**
 * VSCode 风格的面板布局：
 * - 拖拽 resize handle 可以调整面板宽度
 * - 拖拽挤压时，被挤压面板宽度低于阈值自动折叠
 * - 折叠后的面板边缘有拖拽区域，拖拽可展开
 * - 双击 resize handle 恢复默认宽度
 */
export function PanelLayout() {
  const sidebarVisible = useAppStore((s) => s.sidebarVisible);
  const chatVisible = useAppStore((s) => s.chatVisible);
  const settingsVisible = useAppStore((s) => s.settingsVisible);
  const stockDetailVisible = useStockDetailStore((s) => s.visible);
  const middlePanel = useAppStore((s) => s.middlePanel);
  const maximizedPanel = useAppStore((s) => s.maximizedPanel);
  const setSidebarVisible = useAppStore((s) => s.setSidebarVisible);
  const setChatVisible = useAppStore((s) => s.setChatVisible);

  const [sidebarWidth, setSidebarWidth] = useState(() => loadWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT));
  const [chatWidth, setChatWidth] = useState(() => loadWidth(CHAT_WIDTH_KEY, CHAT_DEFAULT));

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"sidebar" | "chat" | "sidebar-expand" | "chat-expand" | null>(null);
  const dragStartX = useRef(0);
  const dragStartSidebar = useRef(0);
  const dragStartChat = useRef(0);

  function containerWidth(): number {
    return containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
  }

  function maximizedWidth(): number {
    return containerWidth() - 48; // subtract ActivityBar width
  }

  const sidebarVisibleRef = useRef(sidebarVisible);
  const chatVisibleRef = useRef(chatVisible);
  sidebarVisibleRef.current = sidebarVisible;
  chatVisibleRef.current = chatVisible;

  const sidebarWidthRef = useRef(sidebarWidth);
  const chatWidthRef = useRef(chatWidth);
  sidebarWidthRef.current = sidebarWidth;
  chatWidthRef.current = chatWidth;

  const showStockDetail = middlePanel === "stock" && stockDetailVisible;

  // 股票详情需要更大的最小宽度，确保不被侧边栏挤压覆盖
  const editorMin = showStockDetail ? 480 : EDITOR_MIN;
  const editorMinRef = useRef(editorMin);
  editorMinRef.current = editorMin;

  // 当股票详情打开时，如果 sidebar 太宽导致中间面板不够最小宽度，自动缩小 sidebar
  useEffect(() => {
    if (!showStockDetail) return;
    const total = containerRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const activityBar = 48;
    const availableForMiddle = total - activityBar - sidebarWidth - (chatVisible ? chatWidth + 1 : 0);
    if (availableForMiddle < editorMin) {
      const newSidebarWidth = Math.max(SIDEBAR_MIN, total - activityBar - editorMin - (chatVisible ? chatWidth + 1 : 0));
      setSidebarWidth(newSidebarWidth);
      sidebarWidthRef.current = newSidebarWidth;
    }
  }, [showStockDetail, editorMin, chatVisible, chatWidth]);

  // ─── 拖拽逻辑（requestAnimationFrame 节流） ─────────────────
  const rafId = useRef(0);
  const lastMouseEvent = useRef<MouseEvent | null>(null);

  const onDragMove = useCallback((e: MouseEvent) => {
    lastMouseEvent.current = e;
    if (rafId.current) return; // 已有待处理帧，跳过
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const ev = lastMouseEvent.current;
      if (!ev || !dragging.current) return;

    const delta = ev.clientX - dragStartX.current;
    const total = containerWidth();
    const activityBar = 48;
    const chatVis = chatVisibleRef.current;
    const sidebarVis = sidebarVisibleRef.current;
    const eMin = editorMinRef.current;

    if (dragging.current === "sidebar") {
      let next = dragStartSidebar.current + delta;
      next = clamp(next, SIDEBAR_MIN, total - activityBar - eMin - (chatVis ? CHAT_MIN + 1 : 0));

      if (chatVis) {
        const remainingForChat = total - activityBar - next - 1 - eMin;
        if (remainingForChat < COLLAPSE_THRESHOLD) {
          setChatVisible(false);
          next = clamp(next, SIDEBAR_MIN, total - activityBar - 1 - eMin);
        }
      }

      sidebarWidthRef.current = next;
      setSidebarWidth(next);
    } else if (dragging.current === "chat") {
      let next = dragStartChat.current - delta;
      next = clamp(next, CHAT_MIN, total - activityBar - eMin - (sidebarVis ? SIDEBAR_MIN + 1 : 0));

      if (sidebarVis) {
        const remainingForSidebar = total - activityBar - next - 1 - eMin;
        if (remainingForSidebar < COLLAPSE_THRESHOLD) {
          setSidebarVisible(false);
          next = clamp(next, CHAT_MIN, total - activityBar - 1 - eMin);
        }
      }

      chatWidthRef.current = next;
      setChatWidth(next);
    } else if (dragging.current === "sidebar-expand") {
      const dragDist = delta;
      if (dragDist > EXPAND_DRAG_MIN) {
        const newWidth = clamp(dragDist, SIDEBAR_MIN, total - activityBar - eMin - (chatVis ? CHAT_MIN + 1 : 0));
        sidebarWidthRef.current = newWidth;
        setSidebarWidth(newWidth);
        setSidebarVisible(true);
        dragging.current = "sidebar";
      }
    } else if (dragging.current === "chat-expand") {
      const dragDist = -delta;
      if (dragDist > EXPAND_DRAG_MIN) {
        const newWidth = clamp(dragDist, CHAT_MIN, total - activityBar - eMin - (sidebarVis ? SIDEBAR_MIN + 1 : 0));
        chatWidthRef.current = newWidth;
        setChatWidth(newWidth);
        setChatVisible(true);
        dragging.current = "chat";
      }
    }
    }); // end rAF
  }, [setChatVisible, setSidebarVisible]);

  const onDragEnd = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
    if (!dragging.current) return;
    saveWidth(SIDEBAR_WIDTH_KEY, sidebarWidthRef.current);
    saveWidth(CHAT_WIDTH_KEY, chatWidthRef.current);
    dragging.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    return () => {
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragEnd);
    };
  }, [onDragMove, onDragEnd]);

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

  function startExpand(type: "sidebar-expand" | "chat-expand") {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = type;
      dragStartX.current = e.clientX;
      dragStartSidebar.current = SIDEBAR_DEFAULT;
      dragStartChat.current = CHAT_DEFAULT;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };
  }

  function resetWidth(type: "sidebar" | "chat") {
    if (type === "sidebar") {
      setSidebarWidth(SIDEBAR_DEFAULT);
      sidebarWidthRef.current = SIDEBAR_DEFAULT;
      saveWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT);
    } else {
      setChatWidth(CHAT_DEFAULT);
      chatWidthRef.current = CHAT_DEFAULT;
      saveWidth(CHAT_WIDTH_KEY, CHAT_DEFAULT);
    }
  }

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
      {/* 第0列：活动栏 - 始终可见 */}
      <ErrorBoundary><ActivityBar /></ErrorBoundary>

      {settingsVisible ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <ErrorBoundary><SettingsLayout /></ErrorBoundary>
        </div>
      ) : maximizedPanel === "sidebar" ? (
        <>
          <ErrorBoundary><Sidebar width={maximizedWidth()} /></ErrorBoundary>
        </>
      ) : maximizedPanel === "editor" ? (
        <>
          {showStockDetail ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <ErrorBoundary><StockDetailPanel /></ErrorBoundary>
            </div>
          ) : (
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <ErrorBoundary><EditorPanel /></ErrorBoundary>
            </main>
          )}
        </>
      ) : maximizedPanel === "chat" ? (
        <>
          <ErrorBoundary><ChatPanel width={maximizedWidth()} /></ErrorBoundary>
        </>
      ) : (
        <>
          {/* 侧边栏折叠时的边缘拖拽区域 */}
          {!sidebarVisible && (
            <CollapseEdge side="left" onExpand={startExpand} />
          )}

          {/* 第1列：侧边栏 - 通过 width 过渡实现折叠/展开动画 */}
          <ErrorBoundary>
            <Sidebar width={sidebarVisible ? sidebarWidth : 0} />
          </ErrorBoundary>

          {/* 侧边栏 resize handle */}
          {sidebarVisible && (
            <ResizeHandle type="sidebar" side="left" onResize={startResize} onReset={resetWidth} />
          )}

          {/* 第2列：中间面板 - flex-1 自适应 */}
          {showStockDetail ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <ErrorBoundary><StockDetailPanel /></ErrorBoundary>
            </div>
          ) : (
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <ErrorBoundary><EditorPanel /></ErrorBoundary>
            </main>
          )}

          {/* Chat resize handle */}
          {chatVisible && (
            <ResizeHandle type="chat" side="right" onResize={startResize} onReset={resetWidth} />
          )}

          {/* 第3列：AI 对话 */}
          {chatVisible && <ErrorBoundary><ChatPanel width={chatWidth} /></ErrorBoundary>}

          {/* Chat 折叠时的边缘拖拽区域 */}
          {!chatVisible && (
            <CollapseEdge side="right" onExpand={startExpand} />
          )}
        </>
      )}
    </div>
  );
}
