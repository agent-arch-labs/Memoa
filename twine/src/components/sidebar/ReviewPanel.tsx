import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { useAppStore } from "@/stores/appStore";
import { useStockProfiles, DEFAULT_GROUP_ID, PINNED_GROUP_ID } from "@/hooks/useStockProfiles";
import { ContextMenu } from "@/components/ui/ContextMenu";
import type { MenuEntry } from "@/components/ui/ContextMenu";
import type { ScreenerResult, ScreenerStock, SyncStatus, DailySyncStatus } from "@/types";

type ScreenerAction =
  | "new_high"
  | "top_gain_5d"
  | "top_gain_10d"
  | "volume_breakout"
  | "limit_up"
  | "consecutive_limit"
  | "broken_limit"
  | "ma_bullish"
  | "ma_cross_up"
  | "macd_cross_up"
  | "kdj_golden"
  | "rsi_oversold"
  | "boll_breakout"
  | "macd_diverge";

const SCREENER_OPTIONS: { key: ScreenerAction; label: string; desc: string; group: string }[] = [
  // 行情异动
  { key: "limit_up", label: "昨日涨停", desc: "昨日涨幅>=9.8%", group: "行情异动" },
  { key: "consecutive_limit", label: "昨日连板", desc: "连续2日以上涨停", group: "行情异动" },
  { key: "broken_limit", label: "昨日炸板", desc: "触及涨停但未封住", group: "行情异动" },
  { key: "volume_breakout", label: "放量突破", desc: "量比>2且涨幅>3%", group: "行情异动" },
  { key: "new_high", label: "历史新高", desc: "收盘价创60日新高", group: "行情异动" },
  // 涨幅排行
  { key: "top_gain_5d", label: "5日涨幅", desc: "最近5日累计涨幅排行", group: "涨幅排行" },
  { key: "top_gain_10d", label: "10日涨幅", desc: "最近10日累计涨幅排行", group: "涨幅排行" },
  // 均线策略
  { key: "ma_bullish", label: "均线多头", desc: "MA5>MA10>MA20>MA60", group: "均线策略" },
  { key: "ma_cross_up", label: "MA金叉", desc: "MA5上穿MA10", group: "均线策略" },
  // 技术指标
  { key: "macd_cross_up", label: "MACD金叉", desc: "DIF上穿DEA", group: "技术指标" },
  { key: "kdj_golden", label: "KDJ金叉", desc: "K线上穿D线", group: "技术指标" },
  { key: "rsi_oversold", label: "RSI超卖", desc: "RSI从30以下回升", group: "技术指标" },
  { key: "boll_breakout", label: "布林突破", desc: "收盘价突破上轨", group: "技术指标" },
  { key: "macd_diverge", label: "MACD底背离", desc: "价格新低但MACD未新低", group: "技术指标" },
];

type SortKey = "name" | "close" | "pctChg" | "limitPrice" | "turn" | "volume"
  | "highDays" | "gainPct" | "volRatio" | "limitUpDays"
  | "ma5" | "ma10" | "ma20" | "ma60"
  | "dif" | "dea" | "macdHist"
  | "k" | "d" | "j"
  | "rsi" | "rsiPrev"
  | "bollUpper" | "bollMid" | "bollLower";

function getSortValue(stock: ScreenerStock, key: SortKey): number {
  switch (key) {
    case "close": return stock.close;
    case "pctChg": return stock.pctChg;
    case "limitPrice": return stock.limitPrice ?? 0;
    case "turn": return stock.turn;
    case "volume": return stock.volume;
    case "highDays": return stock.highDays ?? 0;
    case "gainPct": return stock.gainPct ?? 0;
    case "volRatio": return stock.volRatio ?? 0;
    case "limitUpDays": return stock.limitUpDays ?? 0;
    case "ma5": return stock.ma5 ?? 0;
    case "ma10": return stock.ma10 ?? 0;
    case "ma20": return stock.ma20 ?? 0;
    case "ma60": return stock.ma60 ?? 0;
    case "dif": return stock.dif ?? 0;
    case "dea": return stock.dea ?? 0;
    case "macdHist": return stock.macdHist ?? 0;
    case "k": return stock.k ?? 0;
    case "d": return stock.d ?? 0;
    case "j": return stock.j ?? 0;
    case "rsi": return stock.rsi ?? 0;
    case "rsiPrev": return stock.rsiPrev ?? 0;
    case "bollUpper": return stock.bollUpper ?? 0;
    case "bollMid": return stock.bollMid ?? 0;
    case "bollLower": return stock.bollLower ?? 0;
    default: return 0;
  }
}

export function ReviewPanel() {
  const [screenerAction, setScreenerAction] = useState<ScreenerAction>("limit_up");
  const [screenerResult, setScreenerResult] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [redisOk, setRedisOk] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [dailyStatus, setDailyStatus] = useState<DailySyncStatus | null>(null);
  const [stockSyncing, setStockSyncing] = useState(false);
  const [klineSyncing, setKlineSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const screenerSeqRef = useRef(0);
  const openStock = useStockDetailStore((s) => s.openStock);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stock: ScreenerStock } | null>(null);
  const { groups, addStock, togglePin, moveStockToGroup, isStockAdded, getProfile, setWatchLevel, removeProfile } = useStockProfiles();
  const setChatVisible = useAppStore((s) => s.setChatVisible);
  const setContextTarget = useAppStore((s) => s.setContextTarget);
  const setPendingStockPrompt = useAppStore((s) => s.setPendingStockPrompt);

  // 检查Redis连接和同步状态
  useEffect(() => {
    invoke<boolean>("redis_health_check")
      .then((ok) => {
        setRedisOk(ok);
        if (ok) {
          invoke<SyncStatus>("baostock_sync_status").then(setSyncStatus).catch(() => {});
          invoke<DailySyncStatus>("daily_sync_status").then(setDailyStatus).catch(() => {});
        }
      })
      .catch(() => setRedisOk(false));
  }, []);

  // 股票同步轮询
  useEffect(() => {
    if (!stockSyncing || !redisOk) return;
    const timer = setInterval(() => {
      invoke<SyncStatus>("baostock_sync_status")
        .then((s) => {
          setSyncStatus(s);
          if (s.status === "done" || s.status === "never" || s.status === "no_redis") {
            setStockSyncing(false);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [stockSyncing, redisOk]);

  // K线同步轮询
  useEffect(() => {
    if (!klineSyncing || !redisOk) return;
    const timer = setInterval(() => {
      invoke<DailySyncStatus>("daily_sync_status")
        .then((s) => {
          setDailyStatus(s);
          if (s.status === "done" || s.status === "never" || s.status === "no_redis" || s.status === "error") {
            setKlineSyncing(false);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [klineSyncing, redisOk]);

  // 监听 daily-sync-finished 事件作为兜底（Python 脚本完成/失败时 Rust 端发出）
  useEffect(() => {
    if (!klineSyncing) return;
    const unlisten = listen<string>("daily-sync-finished", (_event) => {
      // 事件到达时立即查一次最新状态
      invoke<DailySyncStatus>("daily_sync_status")
        .then((s) => {
          setDailyStatus(s);
          setKlineSyncing(false);
        })
        .catch(() => setKlineSyncing(false));
    });
    return () => { unlisten.then(fn => fn()); };
  }, [klineSyncing]);

  async function startStockSync() {
    if (stockSyncing) return;
    setStockSyncing(true);
    setSyncError(null);
    try {
      await invoke<string>("baostock_sync_data");
      const s = await invoke<SyncStatus>("baostock_sync_status");
      setSyncStatus(s);
    } catch (e) {
      console.error("[stock_sync] error:", e);
      setSyncError(String(e));
      setStockSyncing(false);
    }
  }

  async function startKlineSync() {
    if (klineSyncing) return;
    setKlineSyncing(true);
    setSyncError(null);
    try {
      await invoke<string>("sync_daily_kline");
      const s = await invoke<DailySyncStatus>("daily_sync_status");
      setDailyStatus(s);
    } catch (e) {
      console.error("[kline_sync] error:", e);
      setSyncError(String(e));
      setKlineSyncing(false);
    }
  }

  async function runScreener() {
    if (loading) return;
    const seq = ++screenerSeqRef.current;
    setLoading(true);
    try {
      const data = await invoke<ScreenerResult>("baostock_screener", {
        action: screenerAction,
        days: 60,
        limit: 50,
      });
      if (seq !== screenerSeqRef.current) return;
      setScreenerResult(data);
    } catch (e) {
      if (seq !== screenerSeqRef.current) return;
      console.error("[screener] error:", e);
      setScreenerResult(null);
    } finally {
      if (seq === screenerSeqRef.current) {
        setLoading(false);
      }
    }
  }

  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const handleStockClick = useCallback((s: ScreenerStock) => {
    setSelectedCode(s.code);
  }, []);

  const handleStockDoubleClick = useCallback((s: ScreenerStock) => {
    const code = s.code;
    const market = code.startsWith("sh") ? "sh" : code.startsWith("sz") ? "sz" : "bj";
    const pureCode = code.slice(2);

    openStock({
      code: pureCode,
      name: s.name || "",
      market,
      fullCode: `${market}${pureCode}`,
      type: "11",
      hasEsg: false,
    });
  }, [openStock]);

  // 右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent, s: ScreenerStock) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, stock: s });
  }, []);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => {
    if (a.id === DEFAULT_GROUP_ID) return -1;
    if (b.id === DEFAULT_GROUP_ID) return 1;
    return 0;
  }), [groups]);

  const contextMenuItems = useMemo<MenuEntry[]>(() => {
    if (!contextMenu) return [];
    const s = contextMenu.stock;
    const code = s.code;
    const market = code.startsWith("sh") ? "sh" : code.startsWith("sz") ? "sz" : "bj";
    const pureCode = code.slice(2);
    const added = isStockAdded(pureCode);
    const profile = getProfile(pureCode);

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
          const stockLabel = `${s.name || pureCode} (${market.toUpperCase()}${pureCode})`;
          setContextTarget({
            type: "stock",
            label: stockLabel,
            stockCode: pureCode,
            stockName: s.name || "",
            stockMarket: market,
          });
          const prompt = `请对【${s.name || pureCode}】(${market.toUpperCase()}${pureCode})进行全面分析，包括以下内容：

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
      // 置顶/取消置顶 - 仅已添加时显示
      added ? {
        key: "pin",
        label: profile?.pinned ? "取消置顶" : "置顶",
        checked: profile?.pinned,
        onClick: () => { togglePin(pureCode); },
      } : null,
      // 关注级别（二级菜单）- 仅已添加时显示
      added ? {
        key: "watchlevel",
        label: "关注级别",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM8 4v4l2.5 1.5-.75 1.25L6.5 9V4H8z" />
          </svg>
        ),
        submenu: (["holding", "focus", "watching", "none"] as const).map((level) => ({
          key: `wl_${level}`,
          label: level === "none" ? "自选" : level === "watching" ? "关注" : level === "focus" ? "重点" : "持仓",
          checked: profile?.watchLevel === level,
          onClick: () => { setWatchLevel(pureCode, level); },
        })),
      } : null,
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
            checked: added && profile?.group === g.id,
            onClick: () => {
              if (!added) {
                addStock(pureCode, s.name || "", market, g.id);
              } else {
                moveStockToGroup(pureCode, g.id);
              }
            },
          })),
      },
      // 取消自选 - 仅已添加时显示
      added ? {
        key: "remove",
        label: "取消自选",
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ color: "var(--color-error, #ef4444)" }}>
            <path d="M6.5 1h3l1 1H13v1H3V2h2.5l1-1zM4 5h8l-.5 9H4.5L4 5zm1.5 1.5l.3 6h1l-.3-6h-1zm2.5 0v6h1v-6H8zm2.5 0l-.3 6h1l.3-6h-1z" />
          </svg>
        ),
        onClick: () => { removeProfile(pureCode); },
      } : null,
    ].filter(Boolean) as MenuEntry[];
  }, [contextMenu, sortedGroups, isStockAdded, getProfile, addStock, removeProfile, togglePin, moveStockToGroup, setWatchLevel, setContextTarget, setPendingStockPrompt, setChatVisible]);

  const hasStocks = syncStatus && syncStatus.stockCount > 0;
  const hasKline = dailyStatus && dailyStatus.synced > 0;
  const stockProgress = syncStatus && syncStatus.total > 0
    ? Math.min(100, Math.round((syncStatus.synced / syncStatus.total) * 100))
    : 0;
  const klineProgress = dailyStatus && dailyStatus.total > 0
    ? Math.min(100, Math.round((dailyStatus.synced / dailyStatus.total) * 100))
    : 0;

  function getExtraColumns(action: ScreenerAction): { header: string; sortKey: SortKey; render: (s: ScreenerStock) => React.ReactNode }[] {
    switch (action) {
      case "new_high":
        return [{ header: "新高天数", sortKey: "highDays", render: (s) => <span className="text-[var(--color-text-muted)]">{s.highDays ?? "-"}日</span> }];
      case "top_gain_5d":
      case "top_gain_10d":
        return [{ header: "区间涨幅", sortKey: "gainPct", render: (s) => (
          <span className={s.gainPct && s.gainPct >= 0 ? "text-red-400" : "text-green-400"}>
            {s.gainPct != null ? (s.gainPct >= 0 ? "+" : "") + s.gainPct.toFixed(2) + "%" : "-"}
          </span>
        )}];
      case "volume_breakout":
        return [{ header: "量比", sortKey: "volRatio", render: (s) => (
          <span className="text-yellow-400">{s.volRatio != null ? s.volRatio.toFixed(1) + "x" : "-"}</span>
        )}];
      case "limit_up":
      case "consecutive_limit":
        return [{ header: "连板", sortKey: "limitUpDays", render: (s) => (
          <span className="text-red-400 font-medium">{s.limitUpDays ?? 1}板</span>
        )}];
      case "broken_limit":
        return [{ header: "涨停价", sortKey: "limitPrice", render: (s) => (
          <span className="text-yellow-400">{s.limitPrice?.toFixed(2) ?? "-"}</span>
        )}];
      case "ma_bullish":
        return [
          { header: "MA5", sortKey: "ma5", render: (s) => <span className="text-[var(--color-text-muted)]">{s.ma5?.toFixed(2) ?? "-"}</span> },
          { header: "MA10", sortKey: "ma10", render: (s) => <span className="text-[var(--color-text-muted)]">{s.ma10?.toFixed(2) ?? "-"}</span> },
          { header: "MA20", sortKey: "ma20", render: (s) => <span className="text-[var(--color-text-muted)]">{s.ma20?.toFixed(2) ?? "-"}</span> },
          { header: "MA60", sortKey: "ma60", render: (s) => <span className="text-[var(--color-text-muted)]">{s.ma60?.toFixed(2) ?? "-"}</span> },
        ];
      case "ma_cross_up":
        return [
          { header: "MA5", sortKey: "ma5", render: (s) => <span className="text-red-400">{s.ma5?.toFixed(2) ?? "-"}</span> },
          { header: "MA10", sortKey: "ma10", render: (s) => <span className="text-blue-400">{s.ma10?.toFixed(2) ?? "-"}</span> },
        ];
      case "macd_cross_up":
      case "macd_diverge":
        return [
          { header: "DIF", sortKey: "dif", render: (s) => <span className={s.dif && s.dif >= 0 ? "text-red-400" : "text-green-400"}>{s.dif?.toFixed(3) ?? "-"}</span> },
          { header: "DEA", sortKey: "dea", render: (s) => <span className={s.dea && s.dea >= 0 ? "text-red-400" : "text-green-400"}>{s.dea?.toFixed(3) ?? "-"}</span> },
          { header: "MACD", sortKey: "macdHist", render: (s) => <span className={s.macdHist && s.macdHist >= 0 ? "text-red-400" : "text-green-400"}>{s.macdHist?.toFixed(3) ?? "-"}</span> },
        ];
      case "kdj_golden":
        return [
          { header: "K", sortKey: "k", render: (s) => <span className="text-yellow-400">{s.k?.toFixed(1) ?? "-"}</span> },
          { header: "D", sortKey: "d", render: (s) => <span className="text-blue-400">{s.d?.toFixed(1) ?? "-"}</span> },
          { header: "J", sortKey: "j", render: (s) => <span className={s.j && s.j > 100 ? "text-red-400" : s.j && s.j < 0 ? "text-green-400" : "text-[var(--color-text-muted)]"}>{s.j?.toFixed(1) ?? "-"}</span> },
        ];
      case "rsi_oversold":
        return [
          { header: "RSI", sortKey: "rsi", render: (s) => <span className={s.rsi && s.rsi < 30 ? "text-green-400" : "text-yellow-400"}>{s.rsi?.toFixed(1) ?? "-"}</span> },
          { header: "前日RSI", sortKey: "rsiPrev", render: (s) => <span className="text-[var(--color-text-muted)]">{s.rsiPrev?.toFixed(1) ?? "-"}</span> },
        ];
      case "boll_breakout":
        return [
          { header: "上轨", sortKey: "bollUpper", render: (s) => <span className="text-red-400">{s.bollUpper?.toFixed(2) ?? "-"}</span> },
          { header: "中轨", sortKey: "bollMid", render: (s) => <span className="text-[var(--color-text-muted)]">{s.bollMid?.toFixed(2) ?? "-"}</span> },
          { header: "下轨", sortKey: "bollLower", render: (s) => <span className="text-green-400">{s.bollLower?.toFixed(2) ?? "-"}</span> },
        ];
      default:
        return [];
    }
  }

  const extraColumns = useMemo(() => getExtraColumns(screenerAction), [screenerAction]);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function sortStocks(stocks: ScreenerStock[]): ScreenerStock[] {
    if (!sortKey) return stocks;
    return [...stocks].sort((a, b) => {
      if (sortKey === "name") {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      return sortAsc ? va - vb : vb - va;
    });
  }

  const ST_SPLIT_ACTIONS: ScreenerAction[] = ["limit_up", "consecutive_limit", "broken_limit", "volume_breakout"];
  const needStSplit = ST_SPLIT_ACTIONS.includes(screenerAction);

  const normalStocks = useMemo(() => sortStocks(needStSplit && screenerResult
    ? screenerResult.stocks.filter((s) => !s.isST)
    : screenerResult?.stocks ?? []), [sortKey, sortAsc, needStSplit, screenerResult]);
  const stStocks = useMemo(() => sortStocks(needStSplit && screenerResult
    ? screenerResult.stocks.filter((s) => s.isST)
    : []), [sortKey, sortAsc, needStSplit, screenerResult]);

  function SortTh({ label, field, align = "right" }: { label: string; field: SortKey; align?: "left" | "right" }) {
    const active = sortKey === field;
    return (
      <th
        className={`py-1 px-2 cursor-pointer select-none hover:text-[var(--color-text-primary)] font-medium ${align === "left" ? "text-left" : "text-right"}`}
        onClick={() => toggleSort(field)}
      >
        {label}
        {active && <span className="ml-0.5 text-[8px]">{sortAsc ? "▲" : "▼"}</span>}
      </th>
    );
  }

  function renderStockTable(stocks: ScreenerStock[], title?: string) {
    if (stocks.length === 0 && title) return null;
    return (
      <>
        {title && (
          <div className="flex items-center gap-1.5 mb-1 mt-2 first:mt-0">
            <span className="text-[10px] font-medium text-[var(--color-text-primary)]">{title}</span>
            <span className="text-[9px] px-1 py-px rounded bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)]">{stocks.length}只</span>
          </div>
        )}
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)]">
                <th className="text-left py-1 px-2 font-medium">代码</th>
                <SortTh label="名称" field="name" align="left" />
                <SortTh label="收盘" field="close" />
                <SortTh label="涨跌幅" field="pctChg" />
                {extraColumns.map((col, i) => (
                  <SortTh key={i} label={col.header} field={col.sortKey} />
                ))}
                <SortTh label="换手率" field="turn" />
                <SortTh label="成交额" field="volume" />
              </tr>
            </thead>
            <tbody>
              {stocks.map((s, idx) => {
                const isUp = s.pctChg >= 0;
                const rowBg = isUp
                  ? idx % 2 === 0 ? "bg-red-500/[0.03]" : "bg-red-500/[0.06]"
                  : idx % 2 === 0 ? "bg-green-500/[0.03]" : "bg-green-500/[0.06]";
                const color = isUp ? "text-red-500" : "text-green-500";
                const isSelected = selectedCode === s.code;
                return (
                  <tr
                    key={s.code}
                    className={`${rowBg} ${isSelected ? "ring-1 ring-inset ring-[var(--color-accent)]/40" : ""} hover:brightness-110 cursor-pointer transition-colors`}
                    onClick={() => handleStockClick(s)}
                    onDoubleClick={() => handleStockDoubleClick(s)}
                    onContextMenu={(e) => handleContextMenu(e, s)}
                  >
                    <td className="py-1 px-2 text-[var(--color-text-primary)] font-mono">{s.code}</td>
                    <td className="py-1 px-2 text-[var(--color-text-primary)] max-w-[60px] truncate">
                      {s.isST && (
                        <span className="inline-block px-0.5 mr-0.5 text-[10px] leading-tight rounded bg-red-500/20 text-red-400 font-bold">ST</span>
                      )}
                      {s.name || "-"}
                    </td>
                    <td className={`text-right py-1 px-2 font-mono ${color}`}>{s.close.toFixed(2)}</td>
                    <td className={`text-right py-1 px-2 font-mono font-medium ${color}`}>
                      {isUp ? "+" : ""}{s.pctChg.toFixed(2)}%
                    </td>
                    {extraColumns.map((col, i) => (
                      <td key={i} className="text-right py-1 px-2">{col.render(s)}</td>
                    ))}
                    <td className="text-right py-1 px-2 font-mono">{s.turn.toFixed(2)}%</td>
                    <td className="text-right py-1 px-2 font-mono">
                      {s.volume > 1e8 ? (s.volume / 1e8).toFixed(2) + "亿" : (s.volume / 1e4).toFixed(0) + "万"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 数据同步区 - 分离股票同步和K线同步 */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
        {/* Redis 状态 */}
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${redisOk ? "bg-green-400" : redisOk === false ? "bg-red-400" : "bg-yellow-400"}`} />
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {redisOk === null ? "检查Redis..." : redisOk ? "Redis已连接" : "Redis未连接"}
          </span>
        </div>

        {/* 股票列表同步 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-text-primary)]">股票列表</span>
            {hasStocks && (
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {syncStatus!.stockCount}只
              </span>
            )}
            {!stockSyncing && syncStatus?.status === "done" && syncStatus.finishTime && (
              <span className="text-[9px] text-[var(--color-text-muted)]">
                · {syncStatus.finishTime.slice(5, 16)}
              </span>
            )}
          </div>
          <button
            className={`text-[10px] px-2 py-0.5 rounded ${
              stockSyncing
                ? "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] cursor-not-allowed"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
            }`}
            onClick={startStockSync}
            disabled={stockSyncing || !redisOk}
          >
            {stockSyncing ? "同步中..." : hasStocks ? "更新" : "同步"}
          </button>
        </div>

        {/* 股票同步进度 */}
        {stockSyncing && (
          <div className="space-y-0.5">
            {syncStatus && syncStatus.total > 0 ? (
              <>
                <div className="w-full bg-[var(--color-surface-secondary)] rounded-full h-1">
                  <div
                    className="bg-[var(--color-accent)] h-1 rounded-full transition-all duration-500"
                    style={{ width: `${stockProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-[var(--color-text-muted)]">
                  <span>{syncStatus.synced} / {syncStatus.total}</span>
                  <span>{stockProgress}%</span>
                </div>
              </>
            ) : (
              <div className="w-full bg-[var(--color-surface-secondary)] rounded-full h-1 overflow-hidden">
                <div className="bg-[var(--color-accent)] h-1 rounded-full w-1/3 animate-pulse" />
              </div>
            )}
          </div>
        )}

        {/* K线数据同步 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[var(--color-text-primary)]">K线数据</span>
            {hasKline && (
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {dailyStatus!.synced}只
                {dailyStatus!.lastSyncDate && ` · ${dailyStatus!.lastSyncDate}`}
              </span>
            )}
            {!klineSyncing && dailyStatus?.status === "done" && dailyStatus.finishTime && (
              <span className="text-[9px] text-[var(--color-text-muted)]">
                · {dailyStatus.finishTime.slice(5, 16)}
              </span>
            )}
          </div>
          <button
            className={`text-[10px] px-2 py-0.5 rounded ${
              klineSyncing
                ? "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] cursor-not-allowed"
                : "bg-[var(--color-accent)] text-white hover:opacity-90"
            }`}
            onClick={startKlineSync}
            disabled={klineSyncing || !redisOk || !hasStocks}
          >
            {klineSyncing ? "同步中..." : hasKline ? "更新K线" : "同步K线"}
          </button>
        </div>

        {/* K线同步进度 */}
        {klineSyncing && (
          <div className="space-y-0.5">
            {dailyStatus && dailyStatus.total > 0 ? (
              <>
                <div className="w-full bg-[var(--color-surface-secondary)] rounded-full h-1">
                  <div
                    className="bg-[var(--color-accent)] h-1 rounded-full transition-all duration-500"
                    style={{ width: `${klineProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-[var(--color-text-muted)] gap-1">
                  <span>
                    {(dailyStatus.status === "connecting" || dailyStatus.status === "triggered")
                      ? `连接 baostock 中...`
                      : `${dailyStatus.synced} / ${dailyStatus.total}`}
                  </span>
                  {(dailyStatus.status !== "connecting" && dailyStatus.status !== "triggered") && (
                    <span>{klineProgress}%</span>
                  )}
                  {dailyStatus.gaps > 0 && <span>缺失{dailyStatus.gaps}天</span>}
                  {dailyStatus.backfilled > 0 && <span>补齐{dailyStatus.backfilled}天</span>}
                </div>
              </>
            ) : (
              <div className="w-full bg-[var(--color-surface-secondary)] rounded-full h-1 overflow-hidden">
                <div className="bg-[var(--color-accent)] h-1 rounded-full w-1/3 animate-pulse" />
              </div>
            )}
          </div>
        )}

        {/* K线同步完成摘要 */}
        {!klineSyncing && dailyStatus?.status === "done" && dailyStatus.gaps > 0 && (
          <div className="text-[9px] text-[var(--color-text-muted)]">
            缺失{dailyStatus.gaps}天 · 补齐{dailyStatus.backfilled}天
            {dailyStatus.errors > 0 && ` · 失败${dailyStatus.errors}只`}
          </div>
        )}
        {/* K线同步失败提示 */}
        {!klineSyncing && dailyStatus?.status === "error" && (
          <div className="text-[9px] text-red-400">
            K线同步失败，请检查 baostock 连接后重试
            {dailyStatus.finishTime && ` (${dailyStatus.finishTime.slice(5, 16)})`}
          </div>
        )}
        {/* invoke 调用失败提示 */}
        {syncError && (
          <div className="text-[9px] text-red-400 break-all">
            {syncError}
          </div>
        )}
      </div>

      {/* 筛选策略选择 */}
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        {(() => {
          const groups = ["行情异动", "涨幅排行", "均线策略", "技术指标"] as const;
          return groups.map((group) => {
            const opts = SCREENER_OPTIONS.filter(o => o.group === group);
            return (
              <div key={group} className="mb-1.5 last:mb-0">
                <div className="text-[9px] text-[var(--color-text-muted)] mb-1 font-medium">{group}</div>
                <div className="flex flex-wrap gap-1">
                  {opts.map((opt) => (
                    <button
                      key={opt.key}
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-all duration-150 ${
                        screenerAction === opt.key
                          ? "bg-[var(--color-accent)] text-white shadow-sm"
                          : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                      }`}
                      onClick={() => setScreenerAction(opt.key)}
                      title={opt.desc}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          });
        })()}
        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--color-border)]">
          <span className="text-[9px] text-[var(--color-text-muted)]">
            {SCREENER_OPTIONS.find(o => o.key === screenerAction)?.desc}
          </span>
          <button
            className="text-[10px] px-3 py-0.5 bg-[var(--color-accent)] text-white rounded-full disabled:opacity-50 hover:opacity-90 transition-opacity"
            onClick={runScreener}
            disabled={loading || !hasKline}
          >
            {loading ? "筛选中..." : "开始筛选"}
          </button>
        </div>
      </div>

      {/* 结果区 */}
      <div className="flex-1 overflow-y-auto">
        {!hasStocks && !stockSyncing && (
          <div className="px-3 py-6 text-xs text-center text-[var(--color-text-muted)]">
            请先同步股票列表
            <br />
            <span className="text-[11px]">将A股基础数据缓存到Redis</span>
          </div>
        )}

        {hasStocks && !hasKline && !klineSyncing && (
          <div className="px-3 py-6 text-xs text-center text-[var(--color-text-muted)]">
            请同步K线数据
            <br />
            <span className="text-[11px]">选股筛选依赖K线数据</span>
          </div>
        )}

        {hasKline && !screenerResult && !loading && (
          <div className="px-3 py-6 text-xs text-center text-[var(--color-text-muted)]">
            选择筛选策略后点击"开始筛选"
          </div>
        )}

        {screenerResult && (
          <div className="px-3 py-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-[var(--color-text-muted)]">
                {screenerResult.stocks.length}只 · {screenerResult.updatedAt}
                {screenerResult.cached && " (缓存)"}
              </span>
            </div>
            {needStSplit ? (
              <>
                {renderStockTable(normalStocks, "非ST")}
                {renderStockTable(stStocks, "ST")}
              </>
            ) : (
              renderStockTable(normalStocks)
            )}
          </div>
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
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
