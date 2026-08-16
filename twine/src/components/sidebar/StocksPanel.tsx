import { useState, useEffect, useRef, useMemo } from "react";
import { getJson, setJson } from "@/services/storageService";
import { StockSearchInput } from "../astock/StockSearchInput";
import { IconChart, IconEdit, IconClose } from "@/components/common/Icons";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { useQuoteStore } from "@/stores/quoteStore";
import { useAppStore } from "@/stores/appStore";
import { ContextMenu, type MenuEntry } from "../ui/ContextMenu";
import type { StockSuggestItem, StockProfile, StockGroup } from "@/types";

const STOCK_PROFILE_KEY = "memoa_stock_profiles";
const STOCK_GROUPS_KEY = "memoa_stock_groups";
const RECENT_SEARCH_KEY = "memoa_stock_recent_search";
const DEFAULT_GROUP_ID = "__default__";
const PINNED_GROUP_ID = "__pinned__";
const MAX_RECENT = 10;

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

function loadRecentSearch(): StockSuggestItem[] {
  return getJson<StockSuggestItem[]>(RECENT_SEARCH_KEY, []);
}

function saveRecentSearch(items: StockSuggestItem[]) {
  setJson(RECENT_SEARCH_KEY, items.slice(0, MAX_RECENT));
}

const WATCH_LEVEL_ORDER: Record<string, number> = {
  holding: 0,
  focus: 1,
  watching: 2,
  none: 3,
};

const WATCH_LEVEL_CONFIG: Record<string, { label: string; icon: string; color: string; bgColor: string; borderColor: string }> = {
  none: { label: "自选", icon: "☆", color: "text-[var(--color-text-muted)]", bgColor: "", borderColor: "border-transparent" },
  watching: { label: "关注", icon: "○", color: "text-amber-400", bgColor: "bg-amber-400/5", borderColor: "border-amber-400/20" },
  holding: { label: "持仓", icon: "●", color: "text-red-400", bgColor: "bg-red-400/5", borderColor: "border-red-400/20" },
  focus: { label: "重点", icon: "★", color: "text-purple-400", bgColor: "bg-purple-400/5", borderColor: "border-purple-400/20" },
};

export function StocksPanel() {
  const [profiles, setProfiles] = useState<StockProfile[]>(() => loadProfiles());
  const [groups, setGroups] = useState<StockGroup[]>(() => loadGroups());
  const [recentSearch, setRecentSearch] = useState<StockSuggestItem[]>(() => loadRecentSearch());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; code: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const g = loadGroups();
    return new Set(g.filter((g) => g.collapsed).map((g) => g.id));
  });
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [dragOverCode, setDragOverCode] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "name" | "price" | "change">("default");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const profileVersion = useStockDetailStore((s) => s.profileVersion);
  const openStock = useStockDetailStore((s) => s.openStock);

  // 使用共享行情 Store - 细粒度选择器避免不必要的重渲染
  const watchlistQuotes = useQuoteStore((s) => s.quotes);
  const loadingWatchlist = useQuoteStore((s) => s.loading);
  const quoteSubscribe = useQuoteStore((s) => s.subscribe);
  const quoteUnsubscribe = useQuoteStore((s) => s.unsubscribe);
  const quoteRefresh = useQuoteStore((s) => s.refresh);
  const setChatVisible = useAppStore((s) => s.setChatVisible);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setPendingStockPrompt = useAppStore((s) => s.setPendingStockPrompt);

  useEffect(() => {
    if (profileVersion > 0) {
      setProfiles(loadProfiles());
      setGroups(loadGroups());
    }
  }, [profileVersion]);

  // 订阅自选股行情
  useEffect(() => {
    if (profiles.length > 0) {
      const codes = profiles.map((p) => `${p.market}${p.code}`);
      quoteSubscribe(codes);
    }
    return () => {
      if (profiles.length > 0) {
        const codes = profiles.map((p) => `${p.market}${p.code}`);
        quoteUnsubscribe(codes);
      }
    };
  }, [profiles]);

  useEffect(() => {
    if (addingGroup && newGroupInputRef.current) newGroupInputRef.current.focus();
  }, [addingGroup]);

  useEffect(() => {
    if (renamingGroup && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingGroup]);

  // ===== 分组管理 =====

  function addGroup(name: string) {
    if (!name.trim()) return;
    const id = `group_${Date.now()}`;
    const maxOrder = groups.reduce((max, g) => Math.max(max, g.order), 0);
    const next = [...groups, { id, name: name.trim(), order: maxOrder + 1, collapsed: false }];
    setGroups(next);
    saveGroups(next);
    setAddingGroup(false);
    setNewGroupName("");
  }

  function deleteGroup(groupId: string) {
    if (groupId === DEFAULT_GROUP_ID || groupId === PINNED_GROUP_ID) return;
    const nextGroups = groups.filter((g) => g.id !== groupId);
    setGroups(nextGroups);
    saveGroups(nextGroups);
    const nextProfiles = profiles.map((p) =>
      p.group === groupId ? { ...p, group: DEFAULT_GROUP_ID, updatedAt: new Date().toISOString() } : p
    );
    setProfiles(nextProfiles);
    saveProfiles(nextProfiles);
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  }

  function renameGroup(groupId: string, newName: string) {
    if (!newName.trim()) return;
    const next = groups.map((g) => g.id === groupId ? { ...g, name: newName.trim() } : g);
    setGroups(next);
    saveGroups(next);
    setRenamingGroup(null);
    setRenameValue("");
  }

  function toggleCollapse(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      const updatedGroups = groups.map((g) => ({ ...g, collapsed: next.has(g.id) }));
      saveGroups(updatedGroups);
      return next;
    });
  }

  function moveStockToGroup(code: string, groupId: string) {
    const groupStocks = profiles.filter((p) => p.group === groupId && !p.pinned);
    const maxOrder = groupStocks.reduce((max, p) => Math.max(max, p.order), -1);
    const next = profiles.map((p) =>
      p.code === code ? { ...p, group: groupId, order: maxOrder + 1, updatedAt: new Date().toISOString() } : p
    );
    setProfiles(next);
    saveProfiles(next);
  }

  // ===== 拖拽排序 =====

  function handleDragStart(e: React.DragEvent, code: string) {
    setDragCode(code);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", code);
    // 半透明效果
    const el = e.currentTarget as HTMLElement;
    setTimeout(() => el.style.opacity = "0.4", 0);
  }

  function handleDragEnd(e: React.DragEvent) {
    setDragCode(null);
    setDragOverCode(null);
    setDragOverGroup(null);
    (e.currentTarget as HTMLElement).style.opacity = "1";
  }

  function handleDragOverStock(e: React.DragEvent, targetCode: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragCode && dragCode !== targetCode) {
      setDragOverCode(targetCode);
    }
  }

  function handleDragLeaveStock() {
    setDragOverCode(null);
  }

  function handleDropOnStock(e: React.DragEvent, targetCode: string, targetGroupId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCode(null);
    setDragOverGroup(null);

    if (!dragCode || dragCode === targetCode) return;

    const srcProfile = profiles.find((p) => p.code === dragCode);
    const targetProfile = profiles.find((p) => p.code === targetCode);
    if (!srcProfile || !targetProfile) return;

    // 同组内排序：只能在同一 pinned 层级内排序
    const sameGroup = srcProfile.group === targetGroupId && srcProfile.pinned === targetProfile.pinned;

    if (sameGroup) {
      // 同层级内重新排列
      const groupStocks = getGroupStocks(targetGroupId);
      const sameTierStocks = groupStocks.filter((p) => p.pinned === srcProfile.pinned);
      const srcIdx = sameTierStocks.findIndex((p) => p.code === dragCode);
      const targetIdx = sameTierStocks.findIndex((p) => p.code === targetCode);
      if (srcIdx === -1 || targetIdx === -1) return;

      // 插入排序
      const reordered = [...sameTierStocks];
      const [moved] = reordered.splice(srcIdx, 1);
      reordered.splice(targetIdx, 0, moved);

      // 只更新同层级内的 order
      const orderMap = new Map(reordered.map((p, i) => [p.code, i]));
      const next = profiles.map((p) => {
        const newOrder = orderMap.get(p.code);
        if (newOrder !== undefined) {
          return { ...p, order: newOrder };
        }
        return p;
      });

      setProfiles(next);
      saveProfiles(next);
      return;
    }

    // 跨分组或跨层级移动：插入到目标位置，不改变 pinned 状态
    const targetGroupStocks = getGroupStocks(targetGroupId);
    const sameTierAsTarget = targetGroupStocks.filter((p) => p.pinned === targetProfile.pinned);
    const targetIdx = sameTierAsTarget.findIndex((p) => p.code === targetCode);

    // 插入排序：移除源，在目标位置插入
    const reordered = [...sameTierAsTarget];
    // 如果源也在同层级，先移除
    const srcInList = reordered.findIndex((p) => p.code === dragCode);
    if (srcInList !== -1) reordered.splice(srcInList, 1);
    const insertIdx = srcInList !== -1 && srcInList < targetIdx ? targetIdx - 1 : targetIdx;
    reordered.splice(insertIdx, 0, { ...srcProfile, group: targetGroupId });

    // 更新 order
    const orderMap = new Map(reordered.map((p, i) => [p.code, i]));
    const next = profiles.map((p) => {
      if (p.code === dragCode) {
        return { ...p, group: targetGroupId, order: orderMap.get(p.code) ?? 0 };
      }
      const newOrder = orderMap.get(p.code);
      if (newOrder !== undefined) {
        return { ...p, order: newOrder };
      }
      return p;
    });

    setProfiles(next);
    saveProfiles(next);
  }

  function handleDragOverGroup(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragCode) {
      setDragOverGroup(groupId);
    }
  }

  function handleDragLeaveGroup() {
    setDragOverGroup(null);
  }

  function handleDropOnGroup(e: React.DragEvent, groupId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroup(null);

    if (!dragCode) return;
    const srcProfile = profiles.find((p) => p.code === dragCode);
    if (!srcProfile) return;

    // 置顶分组只能放置顶股票，其他分组放非置顶股票
    const targetIsPinned = groupId === PINNED_GROUP_ID;
    if (srcProfile.pinned === targetIsPinned && srcProfile.group === groupId) return;

    // 如果目标不是置顶分组，直接移动 group
    if (!targetIsPinned) {
      moveStockToGroup(dragCode, groupId);
    }
    // 拖到置顶分组标题 = 置顶操作
    else {
      togglePin(dragCode);
    }
  }

  // ===== 分组拖拽排序 =====

  function isSystemGroup(id: string) {
    return id === PINNED_GROUP_ID || id === DEFAULT_GROUP_ID;
  }

  function handleGroupDragStart(e: React.DragEvent, groupId: string) {
    if (isSystemGroup(groupId)) { e.preventDefault(); return; }
    setDragGroupId(groupId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/group-id", groupId);
    setTimeout(() => (e.currentTarget as HTMLElement).style.opacity = "0.4", 0);
  }

  function handleGroupDragEnd(e: React.DragEvent) {
    setDragGroupId(null);
    setDragOverGroupId(null);
    (e.currentTarget as HTMLElement).style.opacity = "1";
  }

  function handleGroupDragOver(e: React.DragEvent, targetGroupId: string) {
    if (isSystemGroup(targetGroupId)) return;
    e.preventDefault();
    e.stopPropagation();
    if (dragGroupId && dragGroupId !== targetGroupId) {
      setDragOverGroupId(targetGroupId);
    }
  }

  function handleGroupDragLeave() {
    setDragOverGroupId(null);
  }

  function handleGroupDrop(e: React.DragEvent, targetGroupId: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverGroupId(null);

    if (!dragGroupId || dragGroupId === targetGroupId || isSystemGroup(targetGroupId)) return;

    // 插入排序：将拖拽分组插入到目标分组的位置
    const customGroups = groups.filter((g) => !isSystemGroup(g.id)).sort((a, b) => a.order - b.order);
    const srcIdx = customGroups.findIndex((g) => g.id === dragGroupId);
    const targetIdx = customGroups.findIndex((g) => g.id === targetGroupId);
    if (srcIdx === -1 || targetIdx === -1) return;

    const reordered = [...customGroups];
    const [moved] = reordered.splice(srcIdx, 1);
    const insertIdx = srcIdx < targetIdx ? targetIdx - 1 : targetIdx;
    reordered.splice(insertIdx, 0, moved);

    // 更新 order
    const orderMap = new Map(reordered.map((g, i) => [g.id, i]));
    const next = groups.map((g) => {
      const newOrder = orderMap.get(g.id);
      if (newOrder !== undefined) {
        return { ...g, order: newOrder };
      }
      return g;
    });

    setGroups(next);
    saveGroups(next);
  }

  // ===== 自选股管理 =====

  function handleSelectStock(item: StockSuggestItem) {
    const nextRecent = [item, ...recentSearch.filter((r) => r.code !== item.code)].slice(0, MAX_RECENT);
    setRecentSearch(nextRecent);
    saveRecentSearch(nextRecent);

    const existing = profiles.find((p) => p.code === item.code);
    if (!existing) {
      const newProfile: StockProfile = {
        code: item.code,
        name: item.name,
        market: item.market as "sh" | "sz" | "bj",
        industry: "",
        sector: "",
        researchNotes: "",
        themes: [],
        tradeHistory: [],
        relatedInsights: [],
        watchLevel: "none",
        group: DEFAULT_GROUP_ID,
        pinned: false,
        order: profiles.filter((p) => p.group === DEFAULT_GROUP_ID).length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = [newProfile, ...profiles];
      setProfiles(next);
      saveProfiles(next);
    }
    openStock(item);
  }

  function removeProfile(code: string) {
    const next = profiles.filter((p) => p.code !== code);
    setProfiles(next);
    saveProfiles(next);
    useStockDetailStore.getState().bumpProfileVersion();
  }

  function togglePin(code: string) {
    const target = profiles.find((p) => p.code === code);
    if (!target) return;
    const newPinned = !target.pinned;
    const rest = profiles.filter((p) => p.code !== code);
    const updated: StockProfile = { ...target, pinned: newPinned, updatedAt: new Date().toISOString() };
    const next = newPinned ? [updated, ...rest] : [...rest, updated];
    setProfiles(next);
    saveProfiles(next);
  }

  function setWatchLevel(code: string, level: StockProfile["watchLevel"]) {
    const next = profiles.map((p) =>
      p.code === code ? { ...p, watchLevel: level, updatedAt: new Date().toISOString() } : p
    );
    setProfiles(next);
    saveProfiles(next);
  }

  function clearRecentSearch() {
    setRecentSearch([]);
    saveRecentSearch([]);
  }

  function removeRecentSearch(code: string) {
    const next = recentSearch.filter((r) => r.code !== code);
    setRecentSearch(next);
    saveRecentSearch(next);
  }

  // ===== 分组渲染 =====

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.order - b.order), [groups]);

  // 缓存每个分组的股票列表，避免每次渲染重新计算
  const groupStocksMap = useMemo(() => {
    const map = new Map<string, StockProfile[]>();
    for (const g of sortedGroups) {
      let stocks: StockProfile[];
      if (g.id === PINNED_GROUP_ID) {
        stocks = profiles.filter((p) => p.pinned).sort((a, b) => a.order - b.order);
      } else {
        stocks = profiles
          .filter((p) => p.group === g.id)
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            const la = WATCH_LEVEL_ORDER[a.watchLevel] ?? 3;
            const lb = WATCH_LEVEL_ORDER[b.watchLevel] ?? 3;
            if (la !== lb) return la - lb;
            return a.order - b.order;
          });
      }

      // 应用排序
      if (sortBy !== "default") {
        stocks = [...stocks].sort((a, b) => {
          const dir = sortAsc ? 1 : -1;
          switch (sortBy) {
            case "name":
              return dir * a.name.localeCompare(b.name);
            case "price": {
              const pa = watchlistQuotes.get(`${a.market}${a.code}`)?.current ?? 0;
              const pb = watchlistQuotes.get(`${b.market}${b.code}`)?.current ?? 0;
              return dir * (pa - pb);
            }
            case "change": {
              const ca = watchlistQuotes.get(`${a.market}${a.code}`)?.changePercent ?? 0;
              const cb = watchlistQuotes.get(`${b.market}${b.code}`)?.changePercent ?? 0;
              return dir * (ca - cb);
            }
            default:
              return 0;
          }
        });
      }

      map.set(g.id, stocks);
    }
    return map;
  }, [sortedGroups, profiles, sortBy, sortAsc, watchlistQuotes]);

  function getGroupStocks(groupId: string): StockProfile[] {
    return groupStocksMap.get(groupId) ?? [];
  }

  function toggleSortBy(key: "default" | "name" | "price" | "change") {
    if (sortBy === key) {
      if (key === "default") return;
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent, code: string) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, code });
  }

  const contextProfile = contextMenu ? profiles.find((p) => p.code === contextMenu.code) : null;

  const contextMenuItems = useMemo<MenuEntry[]>(() => {
    if (!contextMenu || !contextProfile) return [];
    const p = contextProfile;
    const code = contextMenu.code;
    return [
      // AI 分析
      {
        key: "ai",
        label: "AI 分析",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a4 4 0 014 4v1h1a2 2 0 012 2v5a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h1V5a4 4 0 014-4zm0 1.5A2.5 2.5 0 005.5 5v1h5V5A2.5 2.5 0 008 2.5z" />
          </svg>
        ),
        onClick: () => {
          const stockLabel = `${p.name} (${p.market.toUpperCase()}${p.code})`;
          setContextTarget({
            type: "stock",
            label: stockLabel,
            stockCode: p.code,
            stockName: p.name,
            stockMarket: p.market,
          });
          const prompt = `请对【${p.name}】(${p.market.toUpperCase()}${p.code})进行全面分析，包括以下内容：

1. **近期新闻资讯**：该股票近期是否有重大新闻、公告或政策消息刺激？对股价有何影响？
2. **主营业务**：公司主营业务是什么？行业地位如何？核心竞争力是什么？
3. **概念题材**：该股涉及哪些热门概念和题材？是否为概念龙头？
4. **所属板块**：属于什么行业板块？板块整体走势如何？是否有板块联动效应？
5. **股价走势分析**：近期K线走势如何？关键技术指标（MA/MACD/KDJ/RSI/布林带）给出什么信号？支撑位和压力位在哪里？

请综合以上分析，给出该股票的短期和中期投资建议。`;
          setPendingStockPrompt(prompt);
          setChatVisible(true);
        },
      },
      { key: "sep1", type: "separator" as const },
      // 置顶/取消置顶
      {
        key: "pin",
        label: p.pinned ? "取消置顶" : "置顶",
        checked: p.pinned,
        onClick: () => { togglePin(code); },
      },
      // 关注级别（二级菜单）
      {
        key: "watchlevel",
        label: "关注级别",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM8 4v4l2.5 1.5-.75 1.25L6.5 9V4H8z" />
          </svg>
        ),
        submenu: (["holding", "focus", "watching", "none"] as const).map((level) => ({
          key: `wl_${level}`,
          label: WATCH_LEVEL_CONFIG[level].label,
          checked: p.watchLevel === level,
          onClick: () => { setWatchLevel(code, level); },
        })),
      },
      // 选择分组（二级菜单）
      {
        key: "group",
        label: "选择分组",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 3.5A1.5 1.5 0 012.5 2h3A1.5 1.5 0 017 3.5V5h6.5A1.5 1.5 0 0115 6.5v6a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 12.5V11H1.5A1.5 1.5 0 010 9.5v-6zm4.5 0h-3v6H3V6.5A1.5 1.5 0 014.5 5H5V3.5zM4.5 6a.5.5 0 00-.5.5v6a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-6a.5.5 0 00-.5-.5h-9z" />
          </svg>
        ),
        submenu: sortedGroups
          .filter((g) => g.id !== PINNED_GROUP_ID)
          .map((g) => ({
            key: `grp_${g.id}`,
            label: g.name,
            checked: p.group === g.id,
            onClick: () => { moveStockToGroup(code, g.id); },
          })),
      },
      { key: "sep3", type: "separator" as const },
      // 取消自选
      {
        key: "remove",
        label: "取消自选",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--color-error, #ef4444)" }}>
            <path d="M6.5 1h3l1 1H13v1H3V2h2.5l1-1zM4 5h8l-.5 9H4.5L4 5zm1.5 1.5l.3 6h1l-.3-6h-1zm2.5 0v6h1v-6H8zm2.5 0l-.3 6h1l.3-6h-1z" />
          </svg>
        ),
        onClick: () => { removeProfile(code); },
      },
    ];
  }, [contextMenu, contextProfile, sortedGroups]);

  // ===== 股票卡片 =====

  function renderStockCard(p: StockProfile, groupId: string) {
    const fullCode = `${p.market}${p.code}`;
    const q = watchlistQuotes.get(fullCode);
    const isUp = q && q.change >= 0;
    const isDown = q && q.change < 0;
    const priceColor = q ? (isUp ? "text-red-500" : "text-green-500") : "text-[var(--color-text-muted)]";
    const cardBg = q
      ? isUp ? "bg-red-500/[0.03]" : isDown ? "bg-green-500/[0.03]" : ""
      : "";
    const isDragOver = dragOverCode === p.code;
    const isDragging = dragCode === p.code;
    const isSelected = selectedCode === p.code;

    return (
      <div
        key={p.code}
        draggable
        onDragStart={(e) => handleDragStart(e, p.code)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOverStock(e, p.code)}
        onDragLeave={handleDragLeaveStock}
        onDrop={(e) => handleDropOnStock(e, p.code, groupId)}
        className={`mx-2 mb-px px-3 py-[5px] rounded cursor-pointer transition-all duration-150 ${cardBg} ${
          isSelected ? "ring-1 ring-[var(--color-accent)]/40 bg-[var(--color-accent)]/5" : ""
        } ${
          isDragging ? "opacity-40" : ""
        } ${
          isDragOver ? "border-t-2 border-t-[var(--color-accent)] bg-[var(--color-accent)]/5" : ""
        } hover:bg-[var(--color-surface-hover)] group`}
        onClick={() => setSelectedCode(p.code)}
        onDoubleClick={() => {
          openStock({
            code: p.code,
            name: p.name,
            market: p.market,
            fullCode: `${p.market}${p.code}`,
            type: "11",
            hasEsg: false,
          });
        }}
        onContextMenu={(e) => handleContextMenu(e, p.code)}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {p.pinned && <span className="text-[8px] text-amber-500 shrink-0">●</span>}
              <span className="text-[12px] font-medium text-[var(--color-text-primary)] truncate leading-tight tracking-wide">
                {p.name}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]/60 font-mono shrink-0 leading-tight">
                {p.code}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0 ml-3 flex items-center gap-2">
            {q ? (
              <>
                <span className={`text-[13px] font-bold font-mono leading-tight tabular-nums ${priceColor}`}>
                  {q.current.toFixed(2)}
                </span>
                <div className="flex flex-col items-end">
                  <span className={`text-[10px] px-1.5 py-[1px] rounded-sm font-mono font-medium min-w-[50px] text-center tabular-nums ${
                    isUp ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                  }`}>
                    {isUp ? "+" : ""}{q.changePercent.toFixed(2)}%
                  </span>
                  <span className={`text-[9px] font-mono tabular-nums ${priceColor} leading-tight`}>
                    {isUp ? "+" : ""}{q.change.toFixed(2)}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-[10px] text-[var(--color-text-muted)]">--</span>
            )}
            <button
              className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 shrink-0 text-sm leading-none transition-opacity"
              onClick={(e) => { e.stopPropagation(); removeProfile(p.code); }}
            >
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 分组标题 =====

  function renderGroupHeader(group: StockGroup) {
    const groupStocks = getGroupStocks(group.id);
    const isCollapsed = collapsedGroups.has(group.id);
    const isSystem = isSystemGroup(group.id);
    const isPinned = group.id === PINNED_GROUP_ID;
    const isDefault = group.id === DEFAULT_GROUP_ID;
    const isRenaming = renamingGroup === group.id;
    const isGroupDragging = dragGroupId === group.id;
    const isGroupDragOver = dragOverGroupId === group.id;

    return (
      <div
        draggable={!isSystem}
        onDragStart={(e) => handleGroupDragStart(e, group.id)}
        onDragEnd={handleGroupDragEnd}
        onDragOver={(e) => {
          // 股票拖入分组
          if (dragCode) handleDragOverGroup(e, group.id);
          // 分组拖拽排序
          else handleGroupDragOver(e, group.id);
        }}
        onDragLeave={() => {
          handleDragLeaveGroup();
          handleGroupDragLeave();
        }}
        onDrop={(e) => {
          // 股票拖入分组
          if (dragCode) handleDropOnGroup(e, group.id);
          // 分组拖拽排序
          else handleGroupDrop(e, group.id);
        }}
        className={`flex items-center gap-2 px-3 py-[6px] cursor-pointer select-none transition-colors ${
          isGroupDragging ? "opacity-40" : ""
        } ${
          isGroupDragOver ? "border-t-2 border-t-[var(--color-accent)] bg-[var(--color-accent)]/5" : ""
        } ${
          dragOverGroup === group.id && !isGroupDragOver ? "bg-[var(--color-accent)]/10 ring-1 ring-inset ring-[var(--color-accent)]/30" : ""
        } ${
          isPinned
            ? "bg-gradient-to-r from-amber-500/[0.06] to-transparent hover:from-amber-500/[0.10]"
            : isDefault
              ? "bg-[var(--color-surface-secondary)]/50 hover:bg-[var(--color-surface-hover)]/60"
              : "hover:bg-[var(--color-surface-hover)]/40"
        }`}
        onClick={() => toggleCollapse(group.id)}
      >
        <span className={`text-[8px] transition-transform duration-200 ease-out ${isCollapsed ? "" : "rotate-90"} text-[var(--color-text-muted)]`}>
          ▸
        </span>

        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="flex-1 h-5 px-1.5 text-[11px] bg-[var(--color-surface)] border border-[var(--color-accent)] rounded focus:outline-none text-[var(--color-text-primary)]"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => renameGroup(group.id, renameValue)}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameGroup(group.id, renameValue);
              if (e.key === "Escape") { setRenamingGroup(null); setRenameValue(""); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`text-[12px] truncate leading-tight ${
            isPinned
              ? "font-bold text-amber-600 dark:text-amber-400 tracking-wider"
              : isDefault
                ? "font-semibold text-[var(--color-text-primary)]"
                : "font-medium text-[var(--color-text-primary)]/90"
          }`}>
            {group.name}
          </span>
        )}

        <span className={`text-[10px] px-[6px] py-[1px] rounded-full leading-tight font-medium ${
          isPinned
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : isDefault
              ? "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]"
              : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]/80"
        }`}>
          {groupStocks.length}
        </span>

        {!isSystem && (
          <div className="flex items-center gap-1 opacity-0 group-hover/header:opacity-100 transition-opacity ml-auto" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] px-0.5 leading-none transition-colors"
              onClick={() => { setRenamingGroup(group.id); setRenameValue(group.name); }}
              title="重命名"
            >
              <IconEdit size={10} />
            </button>
            <button
              className="text-[10px] text-[var(--color-text-muted)] hover:text-red-400 px-0.5 leading-none transition-colors"
              onClick={() => deleteGroup(group.id)}
              title="删除分组"
            >
              <IconClose size={10} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 搜索区 */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-primary)] tracking-wide">自选股</span>
          <div className="flex items-center gap-1.5">
            <button
              className={`text-[9px] px-1.5 py-px rounded border transition-colors ${
                sortBy === "change"
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
              }`}
              onClick={() => toggleSortBy("change")}
              title="按涨跌幅排序"
            >
              涨跌{sortBy === "change" ? (sortAsc ? "↑" : "↓") : ""}
            </button>
            <button
              className={`text-[9px] px-1.5 py-px rounded border transition-colors ${
                sortBy === "price"
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
              }`}
              onClick={() => toggleSortBy("price")}
              title="按价格排序"
            >
              价格{sortBy === "price" ? (sortAsc ? "↑" : "↓") : ""}
            </button>
            {sortBy !== "default" && (
              <button
                className="text-[9px] px-1 py-px text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                onClick={() => setSortBy("default")}
                title="恢复默认排序"
              >
                <IconClose size={10} />
              </button>
            )}
            <button
              className="text-[9px] px-1.5 py-px text-[var(--color-text-muted)] rounded hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)] transition-colors"
              onClick={() => quoteRefresh()}
              disabled={loadingWatchlist}
            >
              {loadingWatchlist ? "..." : "刷新"}
            </button>
          </div>
        </div>
        <StockSearchInput
          onSelect={handleSelectStock}
          placeholder="输入代码或名称搜索..."
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 最近搜索 */}
        {recentSearch.length > 0 && (
          <div className="px-3 py-1.5 border-b border-[var(--color-border)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-[var(--color-text-muted)]">最近搜索</span>
              <button
                className="text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                onClick={clearRecentSearch}
              >
                清空
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {recentSearch.map((item) => (
                <div
                  key={item.code}
                  className="group flex items-center gap-0.5 px-1.5 py-px rounded bg-[var(--color-surface-secondary)] hover:bg-[var(--color-surface-hover)] cursor-pointer text-[9px] transition-colors"
                  onClick={() => openStock(item)}
                >
                  <span className="text-[var(--color-text-primary)]">{item.name}</span>
                  <span className="text-[var(--color-text-muted)] font-mono">{item.code}</span>
                  <button
                    className="text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 ml-0.5 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); removeRecentSearch(item.code); }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 分组列表 */}
        {profiles.length > 0 && (
          <div className="py-0.5">
            {/* 新建分组 */}
            {addingGroup ? (
              <div className="px-3 py-1 flex items-center gap-1.5">
                <input
                  ref={newGroupInputRef}
                  className="flex-1 h-5 px-2 text-[11px] bg-[var(--color-surface)] border border-[var(--color-accent)] rounded focus:outline-none text-[var(--color-text-primary)]"
                  placeholder="分组名称"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onBlur={() => {
                    if (newGroupName.trim()) addGroup(newGroupName);
                    else { setAddingGroup(false); setNewGroupName(""); }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newGroupName.trim()) addGroup(newGroupName);
                    if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); }
                  }}
                />
              </div>
            ) : (
              <div className="px-3 py-0.5">
                <button
                  className="text-[9px] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors flex items-center gap-0.5"
                  onClick={() => setAddingGroup(true)}
                >
                  <span className="text-[11px] leading-none">+</span> 新建分组
                </button>
              </div>
            )}

            {/* 各分组 */}
            {sortedGroups.map((group, idx) => {
              const groupStocks = getGroupStocks(group.id);
              if (groupStocks.length === 0 && group.id === PINNED_GROUP_ID) return null;
              const isCollapsed = collapsedGroups.has(group.id);

              return (
                <div key={group.id} className="group/header">
                  {idx > 0 && <div className="mx-3 my-1 border-t border-[var(--color-border)]/40" />}
                  {renderGroupHeader(group)}
                  {!isCollapsed && groupStocks.map((p) => renderStockCard(p, group.id))}
                </div>
              );
            })}
          </div>
        )}

        {profiles.length === 0 && (
          <div className="px-3 py-8 text-center space-y-1.5">
            <div className="text-xl"><IconChart size={20} /></div>
            <div className="text-[11px] text-[var(--color-text-muted)]">搜索股票添加到自选</div>
            <div className="text-[9px] text-[var(--color-text-muted)]/60">点击股票在右侧查看详情</div>
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && contextProfile && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />
      )}
    </div>
  );
}
