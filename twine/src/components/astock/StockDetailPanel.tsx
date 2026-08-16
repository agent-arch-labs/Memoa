import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import { IconFolderOpen, IconFolder, IconCheck, IconClose } from "@/components/common/Icons";
import { useQuoteStore } from "@/stores/quoteStore";
import { KLinePreview } from "./KLinePreview";
import { OrderBook } from "./OrderBook";
import { QuoteGrid } from "./QuoteGrid";
import { TimeshareChart } from "./TimeshareChart";
import type {
  StockSuggestItem,
  StockProfile,
  StockGroup,
  BaoStockFinancialResult,
  BaoStockKLine,
  EastStockInfo,
  MarketIndex,
  ScreenerResult,
  ScreenerStock,
  SyncStatus,
  DailySyncStatus,
} from "@/types";
import { getJson, setJson } from "@/services/storageService";

const STOCK_PROFILE_KEY = "memoa_stock_profiles";
const STOCK_GROUPS_KEY = "memoa_stock_groups";
const DEFAULT_GROUP_ID = "__default__";
const PINNED_GROUP_ID = "__pinned__";

function loadProfiles(): StockProfile[] {
  const raw = getJson<StockProfile[]>(STOCK_PROFILE_KEY, []);
  return raw.map((p) => ({ ...p, pinned: p.pinned ?? false, group: p.group ?? DEFAULT_GROUP_ID }));
}

function saveProfiles(profiles: StockProfile[]) {
  setJson(STOCK_PROFILE_KEY, profiles);
}

function loadGroups(): StockGroup[] {
  return getJson<StockGroup[]>(STOCK_GROUPS_KEY, []);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DetailTab = "realtime" | "kline" | "timeshare" | "financial" | "history" | "screener" | "notes";

const FINANCIAL_FIELD_LABELS: Record<string, string> = {
  code: "股票代码",
  pubDate: "发布日期",
  statDate: "报告期",
  roeAvg: "净资产收益率(%)",
  npMargin: "净利润率(%)",
  gpMargin: "毛利率(%)",
  netProfit: "净利润",
  epsTTM: "每股收益TTM",
  MBRevenue: "主营收入",
  totalShare: "总股本",
  liqaShare: "流通股本",
  YOYEquity: "净资产同比增长(%)",
  YOYAsset: "总资产同比增长(%)",
  YOYNI: "净利润同比增长(%)",
  YOYEPSBasic: "基本每股收益同比增长(%)",
  YOYPNI: "归属净利润同比增长(%)",
  YOYLiability: "负债同比增长(%)",
  currentRatio: "流动比率",
  quickRatio: "速动比率",
  cashRatio: "现金比率",
  liabilityToAsset: "资产负债率(%)",
  assetToEquity: "权益乘数",
  debtToAsset: "资产负债率(%)",
  debtToEquity: "产权比率(%)",
  equityToAsset: "权益乘数(%)",
  CAToAsset: "流动资产/总资产(%)",
  NCAToAsset: "非流动资产/总资产(%)",
  tangibleAssetToAsset: "有形资产/总资产(%)",
  intangibleAssetToAsset: "无形资产/总资产(%)",
  NCAToTAsset: "非流动有形资产/总资产(%)",
  ICToTAsset: "无形资产/总资产(%)",
  CAToEquity: "流动资产/权益(%)",
  NCAToEquity: "非流动资产/权益(%)",
  tangibleAssetToEquity: "有形资产/权益(%)",
  ebitToInterest: "EBIT/利息费用",
  CFOToOR: "经营现金流/营业收入(%)",
  CFOToNP: "经营现金流/净利润(%)",
  CFOToGr: "经营现金流/营业利润(%)",
  OCFOperatingRev: "经营现金流/营业收入(%)",
  OCFToDebt: "经营现金流/负债(%)",
  OCFToEquity: "经营现金流/权益(%)",
  OCFToAsset: "经营现金流/总资产(%)",
  OCFToNP: "经营现金流/净利润(%)",
  dupontROE: "净资产收益率(%)",
  dupontAssetStoEquity: "权益乘数",
  dupontAssetTurn: "总资产周转率",
  dupontPnitoni: "归属净利润/净利润(%)",
  dupontNitogr: "净利润/营业利润(%)",
  dupontTaxBurden: "税负比率(%)",
  dupontIntburden: "利息负担比率(%)",
  dupontEbittogr: "EBIT/营业利润(%)",
  duReturnOnEquity: "净资产收益率(%)",
  duProfitMargin: "净利润率(%)",
  duAssetTurnover: "总资产周转率",
  duEquityMultiplier: "权益乘数",
  NRTurnRatio: "应收账款周转率",
  NRTurnDays: "应收账款周转天数",
  INVTurnRatio: "存货周转率",
  INVTurnDays: "存货周转天数",
  CATurnRatio: "流动资产周转率",
  AssetTurnRatio: "总资产周转率",
  ACTurnover: "总资产周转率",
  ACCTurnover: "流动资产周转率",
  ARTurnover: "应收账款周转率",
  INVTurnover: "存货周转率",
  OPOI: "营业利润率(%)",
  OPOIToTP: "营业利润/利润总额(%)",
  ARTurnDays: "应收账款周转天数",
  payableTurnDays: "应付账款周转天数",
  cashCycle: "现金循环天数",
};

function formatFinancialValue(key: string, val: string): string {
  if (!val || val === "" || val === "None") return "-";
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  const labels = FINANCIAL_FIELD_LABELS;
  if (key in labels) {
    const label = labels[key];
    if (label.includes("(%)")) return num.toFixed(2) + "%";
    if (label.includes("比率") || label.includes("乘数") || label.includes("周转率")) return num.toFixed(4);
    if (label.includes("天数")) return num.toFixed(2) + "天";
    if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(2) + "亿";
    if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(2) + "万";
  }
  return num.toFixed(4);
}

interface FinancialSectionProps {
  title: string;
  color: string;
  rows: Record<string, string>[];
}

function FinancialSection({ title, color, rows }: FinancialSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [renderExpanded, setRenderExpanded] = useState(false);
  const toggleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (rows.length === 0) return null;

  const skipKeys = useMemo(() => new Set(["code", "pubDate", "statDate"]), []);

  const allKeys = useMemo(() => {
    const keySet = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (!skipKeys.has(k)) keySet.add(k);
      }
    }
    return Array.from(keySet);
  }, [rows, skipKeys]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const da = a.statDate || "";
        const db = b.statDate || "";
        return db.localeCompare(da);
      }),
    [rows]
  );

  const handleToggle = useCallback(() => {
    if (toggleTimerRef.current) {
      clearTimeout(toggleTimerRef.current);
      toggleTimerRef.current = null;
    }
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) {
      setRenderExpanded(true);
    } else {
      toggleTimerRef.current = setTimeout(() => {
        setRenderExpanded(false);
        toggleTimerRef.current = null;
      }, 150);
    }
  }, [expanded]);

  useEffect(() => {
    return () => {
      if (toggleTimerRef.current) clearTimeout(toggleTimerRef.current);
    };
  }, []);

  const displayRows = renderExpanded ? sorted : sorted.slice(0, 1);

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--color-surface-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-xs font-medium text-[var(--color-text-primary)]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {sorted.length}期
          </span>
          <span className={`text-[10px] text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-0" : "-rotate-90"}`}>
            ▼
          </span>
        </div>
      </button>

      {displayRows.map((row, idx) => (
        <div key={row.statDate || idx} className={idx > 0 ? "border-t border-[var(--color-border)]" : ""}>
          <div className="px-3 py-1 bg-[var(--color-surface-secondary)]/50 flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {row.statDate || ""}
            </span>
            <span className="text-[9px] text-[var(--color-text-muted)]">
              {row.pubDate ? `披露: ${row.pubDate}` : ""}
            </span>
          </div>
          <div className="px-3 py-1.5 space-y-1 text-[11px]">
            {allKeys.map((key) => {
              const val = row[key];
              if (val === undefined) return null;
              return (
                <div key={key} className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">
                    {FINANCIAL_FIELD_LABELS[key] || key}
                  </span>
                  <span className="text-[var(--color-text-primary)] font-mono">
                    {formatFinancialValue(key, val)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface FinancialReportViewProps {
  report: BaoStockFinancialResult;
}

function FinancialReportView({ report }: FinancialReportViewProps) {
  const sections: { key: string; title: string; color: string; data: Record<string, string>[] }[] = [
    { key: "profit", title: "盈利能力", color: "bg-red-400", data: report.profit },
    { key: "growth", title: "成长能力", color: "bg-green-400", data: report.growth },
    { key: "balance", title: "偿债能力", color: "bg-blue-400", data: report.balance },
    { key: "cashFlow", title: "现金流量", color: "bg-yellow-400", data: report.cashFlow },
    { key: "dupont", title: "杜邦指数", color: "bg-purple-400", data: report.dupont },
    { key: "operation", title: "营运能力", color: "bg-cyan-400", data: report.operation },
    { key: "express", title: "业绩快报", color: "bg-orange-400", data: report.express },
    { key: "forecast", title: "业绩预告", color: "bg-pink-400", data: report.forecast },
  ];

  const hasData = sections.some((s) => s.data.length > 0);

  if (!hasData) {
    return (
      <div className="text-xs text-[var(--color-text-muted)] text-center py-6">
        暂无财务数据
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sections.map((s) => (
        <FinancialSection key={s.key} title={s.title} color={s.color} rows={s.data} />
      ))}
    </div>
  );
}

// ========== 选股筛选组件 ==========

type ScreenerAction = "new_high" | "top_gain_5d" | "top_gain_10d" | "volume_breakout";

const SCREENER_OPTIONS: { key: ScreenerAction; label: string; desc: string }[] = [
  { key: "new_high", label: "历史新高", desc: "收盘价创60日新高" },
  { key: "top_gain_5d", label: "5日涨幅", desc: "最近5日累计涨幅排行" },
  { key: "top_gain_10d", label: "10日涨幅", desc: "最近10日累计涨幅排行" },
  { key: "volume_breakout", label: "放量突破", desc: "量比>2且涨幅>3%" },
];

function StockScreenerView() {
  const [screenerAction, setScreenerAction] = useState<ScreenerAction>("new_high");
  const [screenerResult, setScreenerResult] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [redisOk, setRedisOk] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [dailyStatus, setDailyStatus] = useState<DailySyncStatus | null>(null);
  const [stockSyncing, setStockSyncing] = useState(false);
  const [klineSyncing, setKlineSyncing] = useState(false);
  const screenerSeqRef = useRef(0);
  const openStock = useStockDetailStore((s) => s.openStock);

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
          if (s.status === "done" || s.status === "never" || s.status === "no_redis") {
            setKlineSyncing(false);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [klineSyncing, redisOk]);

  async function startStockSync() {
    if (stockSyncing) return;
    setStockSyncing(true);
    try {
      await invoke<string>("baostock_sync_data");
      // 立即触发一次状态查询
      const s = await invoke<SyncStatus>("baostock_sync_status");
      setSyncStatus(s);
    } catch (e) {
      console.error("[stock_sync] error:", e);
      setStockSyncing(false);
    }
  }

  async function startKlineSync() {
    if (klineSyncing) return;
    setKlineSyncing(true);
    try {
      await invoke<string>("sync_daily_kline");
      // 立即触发一次状态查询
      const s = await invoke<DailySyncStatus>("daily_sync_status");
      setDailyStatus(s);
    } catch (e) {
      console.error("[kline_sync] error:", e);
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

  function handleStockClick(s: ScreenerStock) {
    const market = s.code.startsWith("6") ? "sh" : s.code.startsWith("0") || s.code.startsWith("3") ? "sz" : "bj";
    openStock({
      code: s.code,
      name: "",
      market,
      fullCode: `${market}${s.code}`,
      type: "11",
      hasEsg: false,
    });
  }

  const hasStocks = syncStatus && syncStatus.stockCount > 0;
  const hasKline = dailyStatus && dailyStatus.synced > 0;
  const stockProgress = syncStatus && syncStatus.total > 0
    ? Math.min(100, Math.round((syncStatus.synced / syncStatus.total) * 100))
    : 0;
  const klineProgress = dailyStatus && dailyStatus.total > 0
    ? Math.min(100, Math.round((dailyStatus.synced / dailyStatus.total) * 100))
    : 0;

  return (
    <div className="space-y-3">
      {/* 数据同步区 - 分离股票同步和K线同步 */}
      <div className="border border-[var(--color-border)] rounded-lg p-3 space-y-2">
        {/* Redis 状态 */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${redisOk ? "bg-green-400" : redisOk === false ? "bg-red-400" : "bg-yellow-400"}`} />
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {redisOk === null ? "检查Redis..." : redisOk ? "Redis已连接" : "Redis未连接"}
          </span>
        </div>

        {/* 股票列表同步 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--color-text-primary)]">股票列表</span>
            {hasStocks && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
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
            className={`text-[10px] px-2.5 py-0.5 rounded-md ${
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
          <div className="space-y-1">
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
            <span className="text-[11px] text-[var(--color-text-primary)]">K线数据</span>
            {hasKline && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
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
            className={`text-[10px] px-2.5 py-0.5 rounded-md ${
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
          <div className="space-y-1">
            {dailyStatus && dailyStatus.total > 0 ? (
              <>
                <div className="w-full bg-[var(--color-surface-secondary)] rounded-full h-1">
                  <div
                    className="bg-[var(--color-accent)] h-1 rounded-full transition-all duration-500"
                    style={{ width: `${klineProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-[var(--color-text-muted)] gap-1">
                  <span>{dailyStatus.synced} / {dailyStatus.total}</span>
                  <span>{klineProgress}%</span>
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
      </div>

      {/* 筛选策略 */}
      <div className="flex flex-wrap gap-1.5">
        {SCREENER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            className={`px-3 py-1 text-[11px] rounded-md transition-colors ${
              screenerAction === opt.key
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
            onClick={() => setScreenerAction(opt.key)}
            title={opt.desc}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 筛选按钮 */}
      <div className="flex justify-end">
        <button
          className="text-[11px] px-4 py-1 bg-[var(--color-accent)] text-white rounded-md disabled:opacity-50 hover:opacity-90"
          onClick={runScreener}
          disabled={loading || !hasKline}
        >
          {loading ? "筛选中..." : "开始筛选"}
        </button>
      </div>

      {!hasStocks && !stockSyncing && (
        <div className="text-xs text-[var(--color-text-muted)] text-center py-6">
          请先同步股票列表
        </div>
      )}

      {hasStocks && !hasKline && !klineSyncing && (
        <div className="text-xs text-[var(--color-text-muted)] text-center py-6">
          请同步K线数据后再筛选
        </div>
      )}

      {screenerResult && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {screenerResult.stocks.length}只 · {screenerResult.updatedAt}
              {screenerResult.cached && " (缓存)"}
            </span>
          </div>
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[var(--color-text-muted)] bg-[var(--color-surface-secondary)]">
                  <th className="text-left py-1.5 px-2">代码</th>
                  <th className="text-right py-1.5 px-2">收盘</th>
                  <th className="text-right py-1.5 px-2">涨跌幅</th>
                  {screenerAction === "new_high" && <th className="text-right py-1.5 px-2">新高天数</th>}
                  {(screenerAction === "top_gain_5d" || screenerAction === "top_gain_10d") && (
                    <th className="text-right py-1.5 px-2">区间涨幅</th>
                  )}
                  {screenerAction === "volume_breakout" && <th className="text-right py-1.5 px-2">量比</th>}
                  <th className="text-right py-1.5 px-2">换手率</th>
                  <th className="text-right py-1.5 px-2">成交额</th>
                </tr>
              </thead>
              <tbody>
                {screenerResult.stocks.map((s, idx) => {
                  const isUp = s.pctChg >= 0;
                  const color = isUp ? "text-red-500" : "text-green-500";
                  const rowBg = isUp ? "bg-red-500/[0.02]" : "bg-green-500/[0.02]";
                  return (
                    <tr
                      key={s.code}
                      className={`border-t border-[var(--color-border)]/50 hover:bg-[var(--color-surface-hover)] cursor-pointer ${idx % 2 === 0 ? rowBg : ""}`}
                      onClick={() => handleStockClick(s)}
                    >
                      <td className="py-1 px-2 text-[var(--color-text-primary)] font-mono">{s.code}</td>
                      <td className="text-right py-1 px-2">{s.close.toFixed(2)}</td>
                      <td className={`text-right py-1 px-2 font-medium ${color}`}>
                        {isUp ? "+" : ""}{s.pctChg.toFixed(2)}%
                      </td>
                      {screenerAction === "new_high" && (
                        <td className="text-right py-1 px-2 text-[var(--color-text-muted)]">
                          {s.highDays ?? "-"}日
                        </td>
                      )}
                      {(screenerAction === "top_gain_5d" || screenerAction === "top_gain_10d") && (
                        <td className={`text-right py-1 px-2 ${s.gainPct && s.gainPct >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {s.gainPct != null ? (s.gainPct >= 0 ? "+" : "") + s.gainPct.toFixed(2) + "%" : "-"}
                        </td>
                      )}
                      {screenerAction === "volume_breakout" && (
                        <td className="text-right py-1 px-2 text-yellow-500">
                          {s.volRatio != null ? s.volRatio.toFixed(1) + "x" : "-"}
                        </td>
                      )}
                      <td className="text-right py-1 px-2">{s.turn.toFixed(2)}%</td>
                      <td className="text-right py-1 px-2">
                        {s.volume > 1e8 ? (s.volume / 1e8).toFixed(2) + "亿" : (s.volume / 1e4).toFixed(0) + "万"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasKline && !screenerResult && !loading && (
        <div className="text-xs text-[var(--color-text-muted)] text-center py-6">
          选择筛选策略后点击"开始筛选"
        </div>
      )}
    </div>
  );
}

interface StockDetailViewProps {
  stock: StockSuggestItem;
}

function StockDetailView({ stock }: StockDetailViewProps) {
  const [profiles] = useState<StockProfile[]>(() => loadProfiles());
  const [activeProfile, setActiveProfile] = useState<StockProfile | null>(null);
  const [financialReport, setFinancialReport] = useState<BaoStockFinancialResult | null>(null);
  const [klineData, setKlineData] = useState<BaoStockKLine[]>([]);
  const [stockInfo, setStockInfo] = useState<EastStockInfo | null>(null);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [loadingKline, setLoadingKline] = useState(false);
  const [loadingStockInfo, setLoadingStockInfo] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [tab, setTab] = useState<DetailTab>("kline");
  const [klineFreq, setKlineFreq] = useState<"d" | "w" | "m">("d");
  const bumpProfileVersion = useStockDetailStore((s) => s.bumpProfileVersion);
  const fetchFinancialsSeqRef = useRef(0);

  // 使用共享行情 Store - 细粒度选择器
  const fullCode = `${stock.market}${stock.code}`;
  const quote = useQuoteStore((s) => s.quotes.get(fullCode) ?? null);
  const quoteSubscribe = useQuoteStore((s) => s.subscribe);
  const quoteUnsubscribe = useQuoteStore((s) => s.unsubscribe);
  const quoteRefresh = useQuoteStore((s) => s.refresh);

  useEffect(() => {
    const existing = profiles.find((p) => p.code === stock.code);
    if (existing) {
      setActiveProfile(existing);
    } else {
      setActiveProfile({
        code: stock.code,
        name: stock.name,
        market: stock.market as "sh" | "sz" | "bj",
        industry: "",
        sector: "",
        researchNotes: "",
        themes: [],
        tradeHistory: [],
        relatedInsights: [],
        watchLevel: "none",
        group: "__default__",
        pinned: false,
        order: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, [stock, profiles]);

  // 订阅当前股票行情

  async function fetchFinancials(forceRefresh = false) {
    if (loadingFinancial) return;
    const seq = ++fetchFinancialsSeqRef.current;
    setLoadingFinancial(true);
    try {
      const data = await invoke<BaoStockFinancialResult>("baostock_financial_report", {
        code: stock.code,
        forceRefresh,
      });
      if (seq !== fetchFinancialsSeqRef.current) return;
      setFinancialReport(data);
    } catch (e) {
      if (seq !== fetchFinancialsSeqRef.current) return;
      console.error("[fetchFinancials] error:", e);
      setFinancialReport(null);
    } finally {
      if (seq === fetchFinancialsSeqRef.current) {
        setLoadingFinancial(false);
      }
    }
  }

  async function fetchStockInfo() {
    setLoadingStockInfo(true);
    try {
      const data = await invoke<EastStockInfo>("east_stock_info", {
        code: stock.code,
        market: stock.market,
      });
      setStockInfo(data);
    } catch (e) {
      console.error("[fetchStockInfo] failed:", e, "stock:", stock);
      setStockInfo(null);
    } finally {
      setLoadingStockInfo(false);
    }
  }

  async function saveStockToFile(append: boolean) {
    if (!stockInfo) return;
    setSavingFile(true);
    try {
      const lines: string[] = [
        `# ${stockInfo.name} (${stock.code}.${stock.market.toUpperCase()})`,
        ``,
        `- 行业: ${stockInfo.industry}`,
        `- 地区: ${stockInfo.region}`,
        `- 概念: ${stockInfo.concepts.join(", ")}`,
      ];
      if (quote) {
        lines.push(``, `## 实时行情`, ``, `- 当前价: ${quote.current.toFixed(2)}`);
        lines.push(`- 涨跌额: ${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}`);
        lines.push(`- 涨跌幅: ${quote.changePercent >= 0 ? "+" : ""}{quote.changePercent.toFixed(2)}%`);
        lines.push(`- 今开: ${quote.open.toFixed(2)}`, `- 昨收: ${quote.yesterdayClose.toFixed(2)}`);
        lines.push(`- 最高: ${quote.high.toFixed(2)}`, `- 最低: ${quote.low.toFixed(2)}`);
        lines.push(`- 成交量: ${(quote.volume / 10000).toFixed(0)}万手`);
        lines.push(`- 成交额: ${(quote.amount / 100000000).toFixed(2)}亿`);
        lines.push(``, `> 更新时间: ${quote.date} ${quote.time}`);
      }
      if (activeProfile?.researchNotes) {
        lines.push(``, `## 复盘笔记`, ``, activeProfile.researchNotes);
      }
      if (financialReport) {
        lines.push(``, `## 财务数据`);
        const sections: { title: string; data: Record<string, string>[] }[] = [
          { title: "盈利能力", data: financialReport.profit },
          { title: "成长能力", data: financialReport.growth },
          { title: "偿债能力", data: financialReport.balance },
          { title: "现金流量", data: financialReport.cashFlow },
          { title: "杜邦指数", data: financialReport.dupont },
          { title: "营运能力", data: financialReport.operation },
        ];
        for (const sec of sections) {
          if (sec.data.length === 0) continue;
          const first = sec.data[0];
          lines.push(``, `### ${sec.title}`, `> 报告期: ${first.statDate || "-"}`);
          const skipKeys = new Set(["code", "pubDate", "statDate"]);
          for (const [k, v] of Object.entries(first)) {
            if (skipKeys.has(k)) continue;
            const label = FINANCIAL_FIELD_LABELS[k] || k;
            lines.push(`- ${label}: ${formatFinancialValue(k, v)}`);
          }
        }
      }
      lines.push(``, `---`, `> 保存时间: ${new Date().toLocaleString("zh-CN")}`);
      const content = lines.join("\n");
      const homeDir = await invoke<string>("get_home_dir");
      const filePath = `${homeDir}/Memoa/stocks/${stock.market}${stock.code}_${stockInfo.name}.md`;
      await invoke<string>("write_stock_file", { path: filePath, content, append });
    } catch {
    } finally {
      setSavingFile(false);
    }
  }

  async function fetchKlineData() {
    setLoadingKline(true);
    try {
      const end = formatDate(new Date());
      const startDate = new Date();
      if (klineFreq === "d") startDate.setMonth(startDate.getMonth() - 3);
      else if (klineFreq === "w") startDate.setMonth(startDate.getMonth() - 6);
      else startDate.setFullYear(startDate.getFullYear() - 2);
      const start = formatDate(startDate);
      const freqMap = { d: "d", w: "w", m: "m" };
      const data = await invoke<BaoStockKLine[]>("baostock_query_kline", {
        code: stock.code,
        startDate: start,
        endDate: end,
        frequency: freqMap[klineFreq],
        adjustflag: "3",
      });
      setKlineData(data);
    } catch {
      setKlineData([]);
    } finally {
      setLoadingKline(false);
    }
  }

  useEffect(() => {
    // 订阅当前股票行情
    quoteSubscribe([fullCode]);
    fetchStockInfo();
    return () => {
      quoteUnsubscribe([fullCode]);
    };
  }, [fullCode]);

  useEffect(() => {
    if (tab === "history" && klineData.length === 0) fetchKlineData();
  }, [tab]);

  useEffect(() => {
    if (tab === "history") fetchKlineData();
  }, [klineFreq]);

  const watchLabels: Record<string, { label: string; color: string; bgColor: string }> = {
    none: { label: "自选", color: "text-[var(--color-text-muted)]", bgColor: "bg-[var(--color-surface)]" },
    watching: { label: "关注", color: "text-amber-500", bgColor: "bg-amber-500/10" },
    holding: { label: "持仓", color: "text-red-500", bgColor: "bg-red-500/10" },
    focus: { label: "重点", color: "text-purple-500", bgColor: "bg-purple-500/10" },
  };

  function addToWatch(level: StockProfile["watchLevel"]) {
    if (!activeProfile) return;
    const updated = { ...activeProfile, watchLevel: level, updatedAt: new Date().toISOString() };
    setActiveProfile(updated);
    const allProfiles = loadProfiles();
    const existing = allProfiles.findIndex((p) => p.code === updated.code);
    if (existing >= 0) {
      allProfiles[existing] = updated;
    } else {
      allProfiles.unshift(updated);
    }
    saveProfiles(allProfiles);
    bumpProfileVersion();
  }

  function moveToGroup(groupId: string) {
    if (!activeProfile) return;
    const updated = { ...activeProfile, group: groupId, updatedAt: new Date().toISOString() };
    setActiveProfile(updated);
    const allProfiles = loadProfiles();
    const existing = allProfiles.findIndex((p) => p.code === updated.code);
    if (existing >= 0) {
      allProfiles[existing] = updated;
    } else {
      allProfiles.unshift(updated);
    }
    saveProfiles(allProfiles);
    setGroupDropdownOpen(false);
    bumpProfileVersion();
  }

  const allGroups = loadGroups().sort((a, b) => a.order - b.order);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!groupDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [groupDropdownOpen]);

  const isUp = quote && quote.change >= 0;
  const priceColor = quote ? (isUp ? "text-red-500" : "text-green-500") : "text-[var(--color-text-muted)]";
  const priceBg = quote ? (isUp ? "bg-red-500/[0.04]" : "bg-green-500/[0.04]") : "";

  const TAB_ITEMS: { key: DetailTab; label: string }[] = [
    { key: "kline", label: "K线" },
    { key: "timeshare", label: "分时" },
    { key: "realtime", label: "实时" },
    { key: "financial", label: "财务" },
    { key: "history", label: "历史" },
    { key: "screener", label: "选股" },
    { key: "notes", label: "笔记" },
  ];

  const close = useStockDetailStore((s) => s.close);

  return (
    <div className="h-full flex flex-col">
      {/* 股票头部信息 - 东方风格：大字价格 + 涨跌 */}
      <div className={`px-4 py-3 border-b border-[var(--color-border)] ${priceBg} transition-colors`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[var(--color-text-primary)]">
              {stock.name}
            </span>
            <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
              {stock.code}.{stock.market.toUpperCase()}
            </span>
            {stock.hasEsg && (
              <span className="text-[10px] text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-md">ESG</span>
            )}
            {stock.alias && (
              <span className="text-[10px] text-[var(--color-text-muted)]">({stock.alias})</span>
            )}
          </div>
          {activeProfile && (
            <div className="flex gap-1 items-center">
              {(["watching", "holding", "focus"] as const).map((level) => {
                const cfg = watchLabels[level];
                return (
                  <button
                    key={level}
                    className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                      activeProfile.watchLevel === level
                        ? `${cfg.bgColor} ${cfg.color} font-medium`
                        : `bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]`
                    }`}
                    onClick={() => addToWatch(level)}
                  >
                    {cfg.label}
                  </button>
                );
              })}

              <div className="relative" ref={groupDropdownRef}>
                <button
                  className={`text-[10px] px-2 py-0.5 rounded-md transition-colors flex items-center gap-0.5 ${
                    groupDropdownOpen
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  }`}
                  onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
                >
                  <span className="text-[9px]"><IconFolderOpen size={9} /></span>
                  {allGroups.find((g) => g.id === activeProfile.group)?.name ?? "分组"}
                </button>
                {groupDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl py-1 min-w-[120px] overflow-hidden">
                    {allGroups.filter((g) => g.id !== PINNED_GROUP_ID).map((g) => (
                      <button
                        key={g.id}
                        className={`w-full text-left px-3 py-1 text-[11px] hover:bg-[var(--color-surface-hover)] flex items-center gap-1.5 transition-colors ${
                          activeProfile.group === g.id ? "text-[var(--color-accent)]" : "text-[var(--color-text-primary)]"
                        }`}
                        onClick={() => moveToGroup(g.id)}
                      >
                        <span className="text-[10px]">{g.id === DEFAULT_GROUP_ID ? <IconFolder size={10} /> : <IconFolderOpen size={10} />}</span>
                        <span>{g.name}</span>
                        {activeProfile.group === g.id && <span className="ml-auto text-[9px]"><IconCheck size={9} /></span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            className="ml-2 text-[var(--color-text-muted)] hover:text-red-400 text-xs shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/10 transition-all duration-200"
            onClick={close}
            title="关闭详情"
          >
            <IconClose size={10} />
          </button>
        </div>

        {/* 价格区域 - 大字突出 */}
        {quote && (
          <div className="flex items-baseline gap-3">
            <span className={`text-2xl font-bold font-mono ${priceColor}`}>
              {quote.current.toFixed(2)}
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono ${priceColor}`}>
                {isUp ? "+" : ""}{quote.change.toFixed(2)}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-mono font-medium ${
                isUp
                  ? "bg-red-500/10 text-red-500"
                  : "bg-green-500/10 text-green-500"
              }`}>
                {isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%
              </span>
              {/* 涨停/跌停标记 */}
              {quote.yesterdayClose > 0 && Math.abs(quote.changePercent) >= 9.9 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                  isUp
                    ? "bg-red-500/20 text-red-500 border border-red-500/30"
                    : "bg-green-500/20 text-green-500 border border-green-500/30"
                }`}>
                  {isUp ? "涨停" : "跌停"}
                </span>
              )}
              {/* ST涨跌停5%标记 */}
              {quote.yesterdayClose > 0 && Math.abs(quote.changePercent) >= 4.9 && Math.abs(quote.changePercent) < 9.9 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                  isUp
                    ? "bg-red-500/15 text-red-400 border border-red-500/20"
                    : "bg-green-500/15 text-green-400 border border-green-500/20"
                }`}>
                  {isUp ? "涨停" : "跌停"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tab导航 - 下划线风格 */}
      <div className="px-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex gap-0">
          {TAB_ITEMS.map(({ key, label }) => (
            <button
              key={key}
              className={`px-3 py-2 text-xs transition-colors relative ${
                tab === key
                  ? "text-[var(--color-accent)] font-medium"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
              onClick={() => setTab(key)}
            >
              {label}
              {tab === key && (
                <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--color-accent)] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === "realtime" && (
          <div className="space-y-4">
            {/* 行情操作栏 */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {quote ? `更新: ${quote.date} ${quote.time}` : "行情自动更新中..."}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="text-[10px] px-3 py-1 bg-[var(--color-accent)] text-white rounded-md hover:opacity-90"
                  onClick={() => quoteRefresh()}
                >
                  刷新
                </button>
              </div>
            </div>

            {/* 行业/概念标签 */}
            {stockInfo && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {stockInfo.industry && (
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md text-[10px] font-medium">
                      {stockInfo.industry}
                    </span>
                  )}
                  {stockInfo.region && (
                    <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-md text-[10px] font-medium">
                      {stockInfo.region}
                    </span>
                  )}
                  {stockInfo.concepts.slice(0, 8).map((c) => (
                    <span key={c} className="px-2 py-0.5 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded-md text-[10px]">
                      {c}
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    className="text-[10px] px-2 py-1 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded-md hover:text-[var(--color-accent)] transition-colors"
                    onClick={() => saveStockToFile(false)}
                    disabled={savingFile || !stockInfo}
                  >
                    {savingFile ? "保存中..." : "保存到文件"}
                  </button>
                  <button
                    className="text-[10px] px-2 py-1 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded-md hover:text-[var(--color-accent)] transition-colors"
                    onClick={() => saveStockToFile(true)}
                    disabled={savingFile || !stockInfo}
                  >
                    追加写入
                  </button>
                </div>
              </div>
            )}

            {!stockInfo && (
              <button
                className="text-[11px] px-3 py-1.5 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded-md hover:text-[var(--color-text-primary)]"
                onClick={fetchStockInfo}
                disabled={loadingStockInfo}
              >
                {loadingStockInfo ? "获取中..." : "获取行业/概念"}
              </button>
            )}

            {/* 实时行情 - 同花顺风格：五档买卖盘 + 行情网格 */}
            {quote ? (
              <div className="space-y-3">
                <OrderBook quote={quote} isUp={isUp} priceColor={priceColor} />
                <QuoteGrid quote={quote} isUp={isUp} priceColor={priceColor} />
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-8">
                点击"刷新"获取实时行情
              </div>
            )}

            {/* 快捷跳转 */}
            {quote && (
              <button
                className="text-[10px] px-3 py-1.5 bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] rounded-md hover:text-[var(--color-accent)] transition-colors"
                onClick={() => { setTab("financial"); fetchFinancials(); }}
              >
                查看财务数据 →
              </button>
            )}
          </div>
        )}

        {tab === "kline" && (
          <KLinePreview code={fullCode} />
        )}

        {tab === "timeshare" && (
          <TimeshareChart fullCode={fullCode} />
        )}

        {tab === "financial" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {financialReport ? "baostock 财务数据（本地缓存）" : "点击查询获取财务数据"}
              </span>
              <div className="flex items-center gap-2">
                {financialReport && (
                  <button
                    className="text-[10px] px-2 py-1 border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
                    onClick={() => fetchFinancials(true)}
                    disabled={loadingFinancial}
                  >
                    {loadingFinancial ? "刷新中..." : "刷新数据"}
                  </button>
                )}
                <button
                  className="text-[10px] px-3 py-1 bg-[var(--color-accent)] text-white rounded-md hover:opacity-90"
                  onClick={() => fetchFinancials(false)}
                  disabled={loadingFinancial}
                >
                  {loadingFinancial ? "查询中..." : "查询财务数据"}
                </button>
              </div>
            </div>

            {financialReport && (
              <FinancialReportView report={financialReport} />
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {([
                { key: "d" as const, label: "日K" },
                { key: "w" as const, label: "周K" },
                { key: "m" as const, label: "月K" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  className={`px-3 py-1 text-[11px] rounded-md transition-colors ${
                    klineFreq === key
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  }`}
                  onClick={() => setKlineFreq(key)}
                >
                  {label}
                </button>
              ))}
              <button
                className="text-[10px] px-3 py-1 bg-[var(--color-accent)] text-white rounded-md hover:opacity-90"
                onClick={fetchKlineData}
                disabled={loadingKline}
              >
                {loadingKline ? "查询中..." : "刷新"}
              </button>
            </div>

            {klineData.length > 0 ? (
              <div>
                <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
                  共 {klineData.length} 条记录
                </div>
                <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-[var(--color-surface-secondary)]">
                        <tr className="text-[var(--color-text-muted)]">
                          <th className="text-left py-1.5 px-2">日期</th>
                          <th className="text-right py-1.5 px-2">开盘</th>
                          <th className="text-right py-1.5 px-2">最高</th>
                          <th className="text-right py-1.5 px-2">最低</th>
                          <th className="text-right py-1.5 px-2">收盘</th>
                          <th className="text-right py-1.5 px-2">涨跌%</th>
                          <th className="text-right py-1.5 px-2">成交量</th>
                        </tr>
                      </thead>
                      <tbody>
                        {klineData.map((row, idx) => (
                          <tr key={idx} className={`border-t border-[var(--color-border)]/30 hover:bg-[var(--color-surface-hover)] ${idx % 2 === 0 ? "bg-[var(--color-surface-secondary)]/30" : ""}`}>
                            <td className="py-1 px-2 text-[var(--color-text-muted)]">{row.date}</td>
                            <td className="text-right py-1 px-2 font-mono">{row.open.toFixed(2)}</td>
                            <td className="text-right py-1 px-2 font-mono text-red-500">{row.high.toFixed(2)}</td>
                            <td className="text-right py-1 px-2 font-mono text-green-500">{row.low.toFixed(2)}</td>
                            <td className={`text-right py-1 px-2 font-mono ${row.pctChg >= 0 ? "text-red-500" : "text-green-500"}`}>
                              {row.close.toFixed(2)}
                            </td>
                            <td className={`text-right py-1 px-2 font-mono font-medium ${row.pctChg >= 0 ? "text-red-500" : "text-green-500"}`}>
                              {row.pctChg >= 0 ? "+" : ""}{row.pctChg.toFixed(2)}%
                            </td>
                            <td className="text-right py-1 px-2 font-mono">{(row.volume / 10000).toFixed(0)}万</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)] text-center py-8">
                {loadingKline ? "正在查询历史数据..." : "点击刷新获取历史K线数据"}
              </div>
            )}
          </div>
        )}

        {tab === "screener" && (
          <StockScreenerView />
        )}

        {tab === "notes" && activeProfile && (
          <div className="space-y-2">
            <div className="text-xs text-[var(--color-text-muted)]">
              研究笔记 — 自由记录对该股票的分析和心得
            </div>
            <textarea
              className="w-full h-60 px-3 py-2 text-xs bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] resize-none focus:outline-none focus:border-[var(--color-accent)]"
              placeholder="研究笔记 (Markdown)..."
              value={activeProfile.researchNotes}
              onChange={(e) => {
                const updated = { ...activeProfile, researchNotes: e.target.value };
                setActiveProfile(updated);
                const allProfiles = loadProfiles();
                const existing = allProfiles.findIndex((p) => p.code === updated.code);
                if (existing >= 0) {
                  allProfiles[existing] = updated;
                  saveProfiles(allProfiles);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface IndexDetailViewProps {
  index: MarketIndex;
}

function IndexDetailView({ index }: IndexDetailViewProps) {
  const isUp = index.change >= 0;
  const priceColor = isUp ? "text-red-500" : "text-green-500";
  const priceBg = isUp ? "bg-red-500/[0.04]" : "bg-green-500/[0.04]";

  return (
    <div className="h-full flex flex-col">
      <div className={`px-4 py-3 border-b border-[var(--color-border)] ${priceBg} transition-colors`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base font-bold text-[var(--color-text-primary)]">
            {index.name}
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            {index.code}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`text-2xl font-bold font-mono ${priceColor}`}>
            {index.price.toFixed(2)}
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-mono ${priceColor}`}>
              {isUp ? "+" : ""}{index.change.toFixed(2)}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-mono font-medium ${
              isUp ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
            }`}>
              {isUp ? "+" : ""}{index.changePercent.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <KLinePreview code={`${index.market}${index.code}`} />
      </div>
    </div>
  );
}

export function StockDetailPanel() {
  const { target, close } = useStockDetailStore();

  if (!target) return null;

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-[var(--color-surface-secondary)]"
    >
      <div className="flex items-center justify-between px-3 h-10 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)]">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {target.type === "stock" ? "个股详情" : "指数详情"}
        </span>
        <button
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--color-surface-hover)]"
          onClick={close}
        >
          ×
        </button>
      </div>

      {target.type === "stock" ? (
        <StockDetailView stock={target.item} />
      ) : (
        <IndexDetailView index={target.item} />
      )}
    </div>
  );
}
