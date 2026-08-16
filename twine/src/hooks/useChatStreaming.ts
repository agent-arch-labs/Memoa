import { useRef, useCallback } from "react";
import { useTauriCommands } from "./useTauriCommands";

interface UseChatStreamingReturn {
  currentRequestIdRef: React.MutableRefObject<string | null>;
  throttledUpdate: (msgId: string, content: string, convId: string) => void;
  flushPending: () => void;
  cancelStream: () => Promise<void>;
}

export function useChatStreaming(
  onUpdateMessage: (msgId: string, content: string, convId: string) => void,
): UseChatStreamingReturn {
  const commands = useTauriCommands();
  const currentRequestIdRef = useRef<string | null>(null);
  const throttleTimerRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef<{ msgId: string; content: string; convId: string } | null>(null);

  const throttledUpdate = useCallback(
    (msgId: string, content: string, convId: string) => {
      if (throttleTimerRef.current) {
        pendingUpdateRef.current = { msgId, content, convId };
        return;
      }
      onUpdateMessage(msgId, content, convId);
      throttleTimerRef.current = window.setTimeout(() => {
        throttleTimerRef.current = null;
        const pending = pendingUpdateRef.current;
        if (pending) {
          pendingUpdateRef.current = null;
          onUpdateMessage(pending.msgId, pending.content, pending.convId);
        }
      }, 80);
    },
    [onUpdateMessage],
  );

  const flushPending = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    const pending = pendingUpdateRef.current;
    if (pending) {
      pendingUpdateRef.current = null;
      onUpdateMessage(pending.msgId, pending.content, pending.convId);
    }
  }, [onUpdateMessage]);

  const cancelStream = useCallback(async () => {
    flushPending();
    const reqId = currentRequestIdRef.current;
    if (reqId) {
      try {
        await commands.cancelChatStream(reqId);
      } catch {
        // ignore cancellation errors
      }
    }
  }, [commands, flushPending]);

  return {
    currentRequestIdRef,
    throttledUpdate,
    flushPending,
    cancelStream,
  };
}