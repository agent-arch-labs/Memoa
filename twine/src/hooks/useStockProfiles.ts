import { useState, useCallback } from "react";
import { getJson, setJson } from "@/services/storageService";
import type { StockProfile, StockGroup } from "@/types";

const STOCK_PROFILE_KEY = "memoa_stock_profiles";
const STOCK_GROUPS_KEY = "memoa_stock_groups";
export const DEFAULT_GROUP_ID = "__default__";
export const PINNED_GROUP_ID = "__pinned__";

const SYSTEM_GROUPS: StockGroup[] = [
  { id: PINNED_GROUP_ID, name: "置顶", order: -1, collapsed: false },
  { id: DEFAULT_GROUP_ID, name: "默认分组", order: 0, collapsed: false },
];

function loadProfiles(): StockProfile[] {
  const raw = getJson<StockProfile[]>(STOCK_PROFILE_KEY, []);
  return raw.map((p, i) => ({
    ...p,
    pinned: p.pinned ?? false,
    group: p.group ?? DEFAULT_GROUP_ID,
    order: p.order ?? i,
  }));
}

function saveProfiles(profiles: StockProfile[]) {
  setJson(STOCK_PROFILE_KEY, profiles);
}

function loadGroups(): StockGroup[] {
  const raw = getJson<StockGroup[]>(STOCK_GROUPS_KEY, []);
  for (const sg of SYSTEM_GROUPS) {
    if (!raw.find((g) => g.id === sg.id)) {
      raw.push(sg);
    }
  }
  return raw;
}

function saveGroups(groups: StockGroup[]) {
  setJson(STOCK_GROUPS_KEY, groups);
}

export function useStockProfiles() {
  const [profiles, setProfiles] = useState<StockProfile[]>(() => loadProfiles());
  const [groups, setGroups] = useState<StockGroup[]>(() => loadGroups());

  const addStock = useCallback((code: string, name: string, market: "sh" | "sz" | "bj", groupId?: string) => {
    setProfiles((prev) => {
      if (prev.find((p) => p.code === code)) return prev; // 已存在
      const newProfile: StockProfile = {
        code,
        name,
        market,
        industry: "",
        sector: "",
        researchNotes: "",
        themes: [],
        tradeHistory: [],
        relatedInsights: [],
        watchLevel: "none",
        group: groupId ?? DEFAULT_GROUP_ID,
        pinned: false,
        order: prev.filter((p) => p.group === (groupId ?? DEFAULT_GROUP_ID)).length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [newProfile, ...prev];
      saveProfiles(next);
      return next;
    });
  }, []);

  const removeProfile = useCallback((code: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.code !== code);
      saveProfiles(next);
      return next;
    });
  }, []);

  const togglePin = useCallback((code: string) => {
    setProfiles((prev) => {
      const target = prev.find((p) => p.code === code);
      if (!target) return prev;
      const newPinned = !target.pinned;
      const rest = prev.filter((p) => p.code !== code);
      const updated: StockProfile = { ...target, pinned: newPinned, updatedAt: new Date().toISOString() };
      const next = newPinned ? [updated, ...rest] : [...rest, updated];
      saveProfiles(next);
      return next;
    });
  }, []);

  const moveStockToGroup = useCallback((code: string, groupId: string) => {
    setProfiles((prev) => {
      const groupStocks = prev.filter((p) => p.group === groupId && !p.pinned);
      const maxOrder = groupStocks.reduce((max, p) => Math.max(max, p.order), -1);
      const next = prev.map((p) =>
        p.code === code ? { ...p, group: groupId, order: maxOrder + 1, updatedAt: new Date().toISOString() } : p
      );
      saveProfiles(next);
      return next;
    });
  }, []);

  const setWatchLevel = useCallback((code: string, level: StockProfile["watchLevel"]) => {
    setProfiles((prev) => {
      const next = prev.map((p) =>
        p.code === code ? { ...p, watchLevel: level, updatedAt: new Date().toISOString() } : p
      );
      saveProfiles(next);
      return next;
    });
  }, []);

  const addGroup = useCallback((name: string) => {
    setGroups((prev) => {
      const maxOrder = prev.reduce((max, g) => Math.max(max, g.order), 0);
      const newGroup: StockGroup = { id: `group_${Date.now()}`, name, order: maxOrder + 1, collapsed: false };
      const next = [...prev, newGroup];
      saveGroups(next);
      return next;
    });
  }, []);

  const getProfile = useCallback((code: string) => {
    return profiles.find((p) => p.code === code) ?? null;
  }, [profiles]);

  const isStockAdded = useCallback((code: string) => {
    return profiles.some((p) => p.code === code);
  }, [profiles]);

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  return {
    profiles,
    groups: sortedGroups,
    addStock,
    removeProfile,
    togglePin,
    moveStockToGroup,
    setWatchLevel,
    addGroup,
    getProfile,
    isStockAdded,
  };
}
