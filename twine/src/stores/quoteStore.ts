import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { SinaQuoteField } from "@/types";

// A股交易时间段判断
function isTradingHours(): boolean {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const h = now.getHours();
  const m = now.getMinutes();
  const t = h * 60 + m;

  // 上午 9:15 - 11:30
  if (t >= 555 && t <= 690) return true;
  // 下午 13:00 - 15:00
  if (t >= 780 && t <= 900) return true;

  return false;
}

function isMarketDay(): boolean {
  const day = new Date().getDay();
  return day !== 0 && day !== 6;
}

// 轮询间隔策略
function getPollInterval(): number {
  if (!isMarketDay()) return 60_000;
  if (isTradingHours()) return 3_000;
  const h = new Date().getHours();
  if (h >= 8 && h < 9) return 10_000;
  if (h >= 15 && h < 16) return 10_000;
  return 60_000;
}

// 防止并发请求的标志位（不放入store，避免触发重渲染）
let _fetching = false;

interface QuoteStore {
  quotes: Map<string, SinaQuoteField>;
  loading: boolean;
  lastFetchAt: number | null;
  error: string | null;
  subscriptions: Set<string>;
  subscribe: (codes: string[]) => void;
  unsubscribe: (codes: string[]) => void;
  refresh: () => Promise<void>;
  _timer: ReturnType<typeof setInterval> | null;
  _startPolling: () => void;
  _stopPolling: () => void;
  _fetchQuotes: () => Promise<void>;
}

export const useQuoteStore = create<QuoteStore>((set, get) => ({
  quotes: new Map(),
  loading: false,
  lastFetchAt: null,
  error: null,
  subscriptions: new Set(),
  _timer: null,

  subscribe: (codes: string[]) => {
    const sub = new Set(get().subscriptions);
    let changed = false;
    for (const c of codes) {
      if (!sub.has(c)) {
        sub.add(c);
        changed = true;
      }
    }
    if (changed) {
      set({ subscriptions: sub });
      get()._fetchQuotes();
      get()._startPolling();
    }
  },

  unsubscribe: (codes: string[]) => {
    const sub = new Set(get().subscriptions);
    for (const c of codes) {
      sub.delete(c);
    }
    set({ subscriptions: sub });
    if (sub.size === 0) {
      get()._stopPolling();
    }
  },

  refresh: async () => {
    await get()._fetchQuotes();
  },

  _startPolling: () => {
    const { _timer, subscriptions } = get();
    if (_timer) clearInterval(_timer);
    if (subscriptions.size === 0) return;

    // 每次轮询时动态获取当前间隔，避免闭包捕获旧值
    const timer = setInterval(() => {
      if (get().subscriptions.size === 0) {
        get()._stopPolling();
        return;
      }
      get()._fetchQuotes();
    }, getPollInterval());

    set({ _timer: timer });
  },

  _stopPolling: () => {
    const { _timer } = get();
    if (_timer) {
      clearInterval(_timer);
      set({ _timer: null });
    }
  },

  _fetchQuotes: async () => {
    const { subscriptions, quotes: oldQuotes } = get();
    if (subscriptions.size === 0) return;
    if (_fetching) return; // 模块级标志位防止并发，不触发重渲染
    _fetching = true;

    const isFirstFetch = oldQuotes.size === 0;
    if (isFirstFetch) set({ loading: true });

    try {
      const codes = Array.from(subscriptions);

      // 新浪行情API单次最多约800只，并行分批请求
      const BATCH_SIZE = 800;
      const batches: string[][] = [];
      for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        batches.push(codes.slice(i, i + BATCH_SIZE));
      }

      const results = await Promise.all(
        batches.map((batch) =>
          invoke<SinaQuoteField[]>("stock_quote", { codes: batch })
        )
      );
      const allData = results.flat();

      // 增量更新：只更新有变化的条目
      let changed = false;
      const newQuotes = new Map(oldQuotes);
      for (const q of allData) {
        const old = oldQuotes.get(q.code);
        if (!old || old.current !== q.current || old.changePercent !== q.changePercent || old.change !== q.change || old.buy1 !== q.buy1 || old.sell1 !== q.sell1) {
          newQuotes.set(q.code, q);
          changed = true;
        }
      }
      if (changed) {
        set({ quotes: newQuotes, lastFetchAt: Date.now(), loading: false });
      } else if (isFirstFetch) {
        set({ lastFetchAt: Date.now(), loading: false });
      }
    } catch (e) {
      if (isFirstFetch) set({ error: String(e), loading: false });
    } finally {
      _fetching = false;
    }
  },
}));
