import { create } from "zustand";
import type { StockSuggestItem, MarketIndex } from "@/types";
import { useAppStore } from "./appStore";

export type StockDetailTarget =
  | { type: "stock"; item: StockSuggestItem }
  | { type: "index"; item: MarketIndex };

interface StockDetailStore {
  target: StockDetailTarget | null;
  visible: boolean;
  autoRefresh: boolean;
  profileVersion: number;
  setTarget: (target: StockDetailTarget | null) => void;
  setVisible: (visible: boolean) => void;
  setAutoRefresh: (autoRefresh: boolean) => void;
  openStock: (item: StockSuggestItem) => void;
  openIndex: (item: MarketIndex) => void;
  close: () => void;
  bumpProfileVersion: () => void;
}

export const useStockDetailStore = create<StockDetailStore>((set) => ({
  target: null,
  visible: false,
  autoRefresh: false,
  profileVersion: 0,
  setTarget: (target) => set({ target, visible: target !== null }),
  setVisible: (visible) => set({ visible }),
  setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
  openStock: (item) => {
    set({ target: { type: "stock", item }, visible: true });
    useAppStore.getState().showStock();
  },
  openIndex: (item) => {
    set({ target: { type: "index", item }, visible: true });
    useAppStore.getState().showStock();
  },
  close: () => {
    set({ target: null, visible: false });
    useAppStore.getState().showEditor();
  },
  bumpProfileVersion: () => set((s) => ({ profileVersion: s.profileVersion + 1 })),
}));
