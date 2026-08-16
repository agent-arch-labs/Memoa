import { useEffect, useRef, useState, useCallback } from "react";
import * as echarts from "echarts";
import { invoke } from "@tauri-apps/api/core";
import { useStockDetailStore } from "@/stores/stockDetailStore";
import type { ConceptTimelineResult, ConceptDayData, ConceptBoardItem, IndustryTimelineResult } from "@/types";

// --- 自定义下拉组件 ---
interface DropdownOption {
  value: number;
  label: string;
  desc: string;
}

const RANGE_OPTIONS: DropdownOption[] = [
  { value: 7, label: "7日", desc: "近7个交易日" },
  { value: 15, label: "15日", desc: "近15个交易日" },
  { value: 30, label: "30日", desc: "近30个交易日" },
];

function Dropdown({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = RANGE_OPTIONS.find((o) => o.value === value) || RANGE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex items-center gap-1.5 text-xs bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-md pl-2.5 pr-2 py-1 text-[var(--color-text-primary)] cursor-pointer hover:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="font-medium">{selected.label}</span>
        <svg className={`text-[var(--color-text-muted)] transition-transform duration-150 ${open ? "rotate-180" : ""}`} width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                opt.value === value
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
              }`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span className="text-xs font-medium w-8">{opt.label}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{opt.desc}</span>
              {opt.value === value && (
                <svg className="ml-auto text-[var(--color-accent)]" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5l3.5 3.5 6.5-7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 概念轮动数据节点
interface ConceptNode {
  name: string;
  rank: number;
  changePercent: number;
  leadingStocks: LeadingStock[];
  totalUpCount: number;
  totalStocks: number;
  turnover: number;
  duration: number;
  isNew: boolean;
}

interface LeadingStock {
  code: string;
  name: string;
  changePercent: number;
  consecutiveLimit: number;
  zdt: boolean;
}

// 单日数据
interface DayConceptData {
  date: string;
  concepts: ConceptNode[];
}

// 将后端 ConceptBoardItem 转为前端 ConceptNode
function boardItemToConceptNode(item: ConceptBoardItem, rank: number, duration: number, isNew: boolean): ConceptNode {
  // 优先使用 topLeadingStocks，回退到旧字段；过滤涨幅 < 4% 的个股
  const leadingStocks: LeadingStock[] = (item.topLeadingStocks && item.topLeadingStocks.length > 0)
    ? item.topLeadingStocks
        .filter((s) => s.changePercent >= 4)
        .map((s) => ({
        code: s.code,
        name: s.name,
        changePercent: s.changePercent,
        consecutiveLimit: 0,
        zdt: s.changePercent >= 9.8,
      }))
    : item.leadingName && item.leadingChange >= 4
      ? [{
          code: item.leadingCode,
          name: item.leadingName,
          changePercent: item.leadingChange,
          consecutiveLimit: 0,
          zdt: item.leadingChange >= 9.8,
        }]
      : [];

  return {
    name: item.name,
    rank,
    changePercent: item.changePercent,
    leadingStocks,
    totalUpCount: item.upCount,
    totalStocks: item.upCount + item.downCount,
    turnover: +item.amount.toFixed(1),
    duration,
    isNew,
  };
}

// 计算概念持续性
function computeDurations(dayDataList: ConceptDayData[]): Map<string, { duration: number; isNew: boolean }> {
  const result = new Map<string, { duration: number; isNew: boolean }>();
  // 从最后一天往前追踪
  const conceptLastSeen = new Map<string, number>(); // concept name -> index of last appearance

  for (let i = 0; i < dayDataList.length; i++) {
    for (const c of dayDataList[i].concepts) {
      if (!conceptLastSeen.has(c.name)) {
        conceptLastSeen.set(c.name, i);
      }
    }
  }

  // 从后往前计算连续出现天数
  for (const [name, _] of conceptLastSeen) {
    let duration = 0;
    for (let i = dayDataList.length - 1; i >= 0; i--) {
      const found = dayDataList[i].concepts.some(c => c.name === name);
      if (found) {
        duration++;
      } else {
        break;
      }
    }
    const firstSeenIdx = dayDataList.findIndex(d => d.concepts.some(c => c.name === name));
    const isNew = firstSeenIdx === dayDataList.length - 1;
    result.set(name, { duration: Math.max(duration, 1), isNew });
  }

  return result;
}

// 涨幅 → 颜色（A股红涨绿跌风格）
function changeToColor(change: number): string {
  if (change >= 5) return "#ff2d2d"; // 涨停红
  if (change >= 3) return "#ff4d4f"; // 深红
  if (change >= 1) return "#ff7875"; // 红
  if (change > 0) return "#ffa940"; // 橙红
  if (change === 0) return "#8c8c8c"; // 灰
  if (change > -3) return "#52c41a"; // 绿
  return "#389e0d"; // 深绿
}

// 涨幅 → 背景色（用于标签、徽章）
function changeToBgColor(change: number): string {
  if (change >= 5) return "rgba(255,45,45,0.15)";
  if (change >= 3) return "rgba(255,77,79,0.12)";
  if (change >= 1) return "rgba(255,120,117,0.10)";
  if (change > 0) return "rgba(255,169,64,0.08)";
  if (change > -3) return "rgba(82,196,26,0.10)";
  return "rgba(56,158,13,0.12)";
}

type TimelineMode = "concept" | "industry";

export function TimelinePanel() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [timelineData, setTimelineData] = useState<DayConceptData[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayRange, setDayRange] = useState(7);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailConcepts, setDetailConcepts] = useState<ConceptNode[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");
const [mode, setMode] = useState<TimelineMode>("concept");
  const [syncing, setSyncing] = useState(false);
  const openStock = useStockDetailStore((s) => s.openStock);

  // 加载数据（从 SQLite 读取，无数据时自动 sync）
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "concept") {
        let result = await invoke<ConceptTimelineResult>("concept_timeline_query", {
          days: dayRange,
        });

        // 数据库无数据时自动同步一次
        if (result.days.length === 0) {
          setSyncing(true);
          try {
            await invoke<string>("concept_timeline_sync", { days: dayRange });
            result = await invoke<ConceptTimelineResult>("concept_timeline_query", {
              days: dayRange,
            });
          } catch (e) {
            console.error("[timeline] auto sync error:", e);
          } finally {
            setSyncing(false);
          }
        }

        setUpdatedAt(result.updatedAt);

        if (result.days.length > 0) {
          const durations = computeDurations(result.days);
          const converted: DayConceptData[] = result.days.map((day) => ({
            date: day.date,
            concepts: day.concepts.map((c, i) => {
              const d = durations.get(c.name) || { duration: 1, isNew: false };
              return boardItemToConceptNode(c, i + 1, d.duration, d.isNew);
            }),
          }));
          setTimelineData(converted);
          setSelectedDate(converted[converted.length - 1].date);
          setDetailConcepts(converted[converted.length - 1].concepts.slice(0, 10));
        }
      } else {
        let result = await invoke<IndustryTimelineResult>("industry_timeline_query", {
          days: dayRange,
        });

        // 数据库无数据时自动同步一次
        if (result.days.length === 0) {
          setSyncing(true);
          try {
            await invoke<string>("industry_timeline_sync", { days: dayRange });
            result = await invoke<IndustryTimelineResult>("industry_timeline_query", {
              days: dayRange,
            });
          } catch (e) {
            console.error("[timeline] auto sync error:", e);
          } finally {
            setSyncing(false);
          }
        }

        setUpdatedAt(result.updatedAt);

        if (result.days.length > 0) {
          // 复用 computeDurations，将 industries 当作 concepts
          const daysAsConcept: ConceptDayData[] = result.days.map((d) => ({
            date: d.date,
            concepts: d.industries,
          }));
          const durations = computeDurations(daysAsConcept);
          const converted: DayConceptData[] = result.days.map((day) => ({
            date: day.date,
            concepts: day.industries.map((c, i) => {
              const d = durations.get(c.name) || { duration: 1, isNew: false };
              return boardItemToConceptNode(c, i + 1, d.duration, d.isNew);
            }),
          }));
          setTimelineData(converted);
          setSelectedDate(converted[converted.length - 1].date);
          setDetailConcepts(converted[converted.length - 1].concepts.slice(0, 10));
        }
      }
    } catch (e) {
      console.error("[timeline] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [dayRange, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 渲染 ECharts
  useEffect(() => {
    if (!chartRef.current || timelineData.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    // 收集所有概念名（去重保序）
    const allConcepts = new Set<string>();
    timelineData.forEach((d) => d.concepts.forEach((c) => allConcepts.add(c.name)));
    const conceptList = Array.from(allConcepts);

    // 构建泳道图数据: [dateIndex, conceptIndex, changePercent]
    const heatData: [number, number, number][] = [];
    const dataMap = new Map<string, ConceptNode>();

    timelineData.forEach((day, di) => {
      day.concepts.forEach((c) => {
        const ci = conceptList.indexOf(c.name);
        heatData.push([di, ci, c.changePercent]);
        dataMap.set(`${di}-${ci}`, c);
      });
    });

    const dates = timelineData.map((d) => d.date.slice(5)); // MM-DD

    const option: echarts.EChartsOption = {
      tooltip: {
        position: (pos: number[]) => {
          return [pos[0] + 10, pos[1] - 10];
        },
        backgroundColor: "rgba(24, 24, 32, 0.97)",
        borderColor: "rgba(255, 255, 255, 0.08)",
        borderWidth: 1,
        padding: [12, 16],
        textStyle: {
          color: "#e5e5e5",
          fontSize: 12,
        },
        extraCssText: "border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);max-width:300px;",
        formatter: (params: unknown) => {
          const p = params as { data: [number, number, number]; value: [number, number, number] };
          const [di, ci] = p.data || p.value;
          const key = `${di}-${ci}`;
          const concept = dataMap.get(key);
          if (!concept) return "";
          const changeColor = changeToColor(concept.changePercent);
          const row = "display:flex;justify-content:space-between;align-items:center;padding:3px 0;line-height:1.5";
          const label = "color:#888;font-size:11px";
          const border = "border-bottom:1px solid rgba(255,255,255,0.05)";
          const stocksHtml = concept.leadingStocks.length > 0
            ? concept.leadingStocks
                .map(
                  (s) => {
                    const sc = s.changePercent >= 0 ? "#ff4d4f" : "#52c41a";
                    const zdtTag = s.zdt ? ' <span style="background:#ff2d2d;color:#fff;padding:0 3px;border-radius:2px;font-size:9px;font-weight:600;line-height:1.4">涨停</span>' : "";
                    const clTag = s.consecutiveLimit > 0 ? ` <span style="background:#cf1322;color:#fff;padding:0 3px;border-radius:2px;font-size:9px;font-weight:600;line-height:1.4">${s.consecutiveLimit}连板</span>` : "";
                    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;line-height:1.4"><span style="color:#ddd;font-size:11px">${s.name}${zdtTag}${clTag}</span><span style="color:${sc};font-weight:700;font-size:11px;font-family:monospace">${s.changePercent > 0 ? "+" : ""}${s.changePercent}%</span></div>`;
                  }
                )
                .join("")
            : '<div style="color:#555;font-size:11px">暂无数据</div>';
          const durationBar = concept.duration > 1
            ? `<span style="display:inline-block;width:${Math.min(concept.duration * 12, 80)}px;height:5px;background:linear-gradient(90deg,#ffa940,#ff4d4f,#ff2d2d);border-radius:3px;margin-left:6px;vertical-align:middle"></span>`
            : "";
          const newTag = concept.isNew ? ' <span style="background:#52c41a;color:#fff;padding:0 4px;border-radius:2px;font-size:9px;font-weight:600;line-height:1.4">NEW</span>' : "";
          return `
            <div style="font-weight:700;font-size:13px;margin-bottom:2px;color:#fff;letter-spacing:0.3px;line-height:1.4">${concept.name}${newTag}</div>
            <div style="color:#666;font-size:10px;margin-bottom:8px;line-height:1.3">${dates[di]} · 排名 #${concept.rank}</div>
            <div style="${row};${border}">
              <span style="${label}">板块涨幅</span>
              <span style="color:${changeColor};font-weight:800;font-size:13px;font-family:monospace">${concept.changePercent > 0 ? "+" : ""}${concept.changePercent}%</span>
            </div>
            <div style="${row};${border}">
              <span style="${label}">涨停/总数</span>
              <span style="color:#eee;font-weight:600;font-size:11px;font-family:monospace">${concept.totalUpCount}<span style="color:#555">/${concept.totalStocks}</span></span>
            </div>
            <div style="${row};${border}">
              <span style="${label}">成交额</span>
              <span style="color:#eee;font-weight:600;font-size:11px;font-family:monospace">${concept.turnover}亿</span>
            </div>
            <div style="${row};${border}">
              <span style="${label}">持续性</span>
              <span style="color:#eee;font-weight:600;font-size:11px">${concept.duration}天${durationBar}</span>
            </div>
            <div style="margin-top:6px;padding-top:4px">
              <div style="color:#888;font-size:10px;margin-bottom:4px;line-height:1.3">领涨个股</div>
              ${stocksHtml}
            </div>
          `;
        },
      },
      grid: {
        top: 10,
        bottom: 60,
        left: 90,
        right: 10,
      },
      xAxis: {
        type: "category",
        data: dates,
        splitArea: { show: false },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        axisTick: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        axisLabel: {
          rotate: 45,
          fontSize: 10,
          color: "#888",
          interval: Math.max(0, Math.floor(dates.length / 15)),
        },
      },
      yAxis: {
        type: "category",
        data: conceptList,
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        axisTick: { show: false },
        axisLabel: { fontSize: 10, width: 80, overflow: "truncate", color: "#aaa" },
        inverse: true,
      },
      visualMap: {
        min: 0,
        max: 8,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: {
          color: ["#1a1a2e", "#4a1942", "#b91c1c", "#ff4d4f", "#ff2d2d"],
        },
        text: ["强", "弱"],
        textStyle: { fontSize: 10, color: "#888" },
        itemWidth: 14,
        itemHeight: 80,
      },
      series: [
        {
          type: "heatmap",
          data: heatData,
          label: {
            show: true,
            fontSize: 9,
            color: "#fff",
            fontWeight: 600,
            fontFamily: "monospace",
            formatter: (params: unknown) => {
              const p = params as { value: [number, number, number] };
              return p.value[2] > 0 ? `${p.value[2]}%` : "";
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(255, 77, 79, 0.4)",
              borderColor: "#ff4d4f",
              borderWidth: 1,
            },
          },
          itemStyle: {
            borderColor: "rgba(20, 20, 28, 0.8)",
            borderWidth: 2,
            borderRadius: 3,
          },
        },
      ],
    };

    chart.setOption(option, true);

    // 点击事件
    chart.on("click", (params: unknown) => {
      const p = params as { data: [number, number, number] };
      if (!p.data) return;
      const [di] = p.data;
      const day = timelineData[di];
      if (day) {
        setSelectedDate(day.date);
        setDetailConcepts(day.concepts.slice(0, 10));
      }
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    // 监听容器尺寸变化（侧边栏拖拽时实时调整，rAF 节流）
    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        chart.resize();
      });
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
    };
  }, [timelineData]);

  // 清理
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // 检测面板宽度，低于阈值时隐藏内容只保留标题栏
  const [compact, setCompact] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const shouldCompact = width < 200;
      if (shouldCompact !== compactRef.current) {
        compactRef.current = shouldCompact;
        setCompact(shouldCompact);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* 工具栏 - 始终显示 */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] shrink-0 bg-[var(--color-surface)] ${compact ? "overflow-hidden" : ""}`}>
        {/* 模式切换 */}
        {!compact && (
        <div className="flex items-center bg-[var(--color-surface-secondary)] rounded-md border border-[var(--color-border)] overflow-hidden">
          <button
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${
              mode === "concept"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
            onClick={() => setMode("concept")}
          >
            概念
          </button>
          <button
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${
              mode === "industry"
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
            onClick={() => setMode("industry")}
          >
            行业
          </button>
        </div>
        )}
        {!compact && <Dropdown value={dayRange} onChange={setDayRange} />}
        {compact ? (
          <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">
            时序图
          </span>
        ) : (
          <>
            {updatedAt && (
              <span className="text-[10px] text-[var(--color-text-muted)]" title={`同步于 ${updatedAt}`}>
                {updatedAt.slice(0, 10) !== new Date().toISOString().slice(0, 10)
                  ? updatedAt.slice(5, 16)
                  : updatedAt.slice(11, 16)}更新
              </span>
            )}
            {timelineData.length > 0 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {timelineData.length}天数据
              </span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            className="icon-btn icon-btn-sm"
            onClick={async () => {
              setSyncing(true);
              try {
                await invoke<string>("timeline_reset", { mode });
                await loadData();
              } catch (e) {
                console.error("[timeline] reset error:", e);
              } finally {
                setSyncing(false);
              }
            }}
            title="重置：删除所有时序数据，从 baostock 重新计算30个交易日"
            disabled={syncing}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="6" strokeDasharray="3 2" />
              <path d="M8 5v3l2 2" />
            </svg>
          </button>
          <button
            className="icon-btn icon-btn-sm"
            onClick={async () => {
              setSyncing(true);
              try {
                const cmd = mode === "concept" ? "concept_timeline_sync" : "industry_timeline_sync";
                await invoke<string>(cmd, { days: dayRange });
                await loadData();
              } catch (e) {
                console.error("[timeline] sync error:", e);
              } finally {
                setSyncing(false);
              }
            }}
            title="从 Redis 重新计算并同步时序数据"
            disabled={syncing}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 8a6 6 0 0 1 10.5-4M14 8a6 6 0 0 1-10.5 4" />
              <path d="M12.5 1v3h-3M3.5 15v-3h3" />
            </svg>
          </button>
        </div>
      </div>

      {/* 图表区域 - compact 时隐藏 */}
      {!compact && (
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/60 z-10">
            <span className="text-xs text-[var(--color-text-muted)]">加载中...</span>
          </div>
        )}
        <div ref={chartRef} className="w-full h-full" />
      </div>
      )}

      {/* 当日概念/行业详情 - compact 时隐藏 */}
      {!compact && selectedDate && detailConcepts.length > 0 && (
        <div className="border-t border-[var(--color-border)] shrink-0 bg-[var(--color-surface)] max-h-[45%] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-surface)] z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--color-text-primary)]">
                {selectedDate} {mode === "concept" ? "概念" : "行业"}热度
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {detailConcepts.length}个活跃
              </span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-[var(--color-text-muted)]">
              <span>涨跌</span>
              <span>成交额</span>
            </div>
          </div>
          <div className="px-1.5 py-1 space-y-0.5">
            {detailConcepts.map((c) => (
              <div
                key={c.name}
                className="rounded hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                {/* 板块标题行 */}
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <span className="text-[10px] w-4 text-center font-bold shrink-0"
                    style={{ color: c.rank <= 3 ? "#ff4d4f" : "var(--color-text-muted)" }}>
                    {c.rank}
                  </span>
                  <span className="text-xs font-medium text-[var(--color-text-primary)] truncate flex-1 min-w-0">
                    {c.name}
                  </span>
                  <span className="text-[11px] font-mono font-bold shrink-0 px-1.5 py-0.5 rounded"
                    style={{ color: changeToColor(c.changePercent), backgroundColor: changeToBgColor(c.changePercent) }}>
                    {c.changePercent > 0 ? "+" : ""}{c.changePercent}%
                  </span>
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)] shrink-0 w-10 text-right">
                    {c.turnover}亿
                  </span>
                  {c.isNew && (
                    <span className="text-[9px] text-emerald-400 font-bold shrink-0 px-1 py-0.5 rounded bg-emerald-500/10">NEW</span>
                  )}
                  {c.duration > 1 && (
                    <span className="text-[9px] text-amber-400 shrink-0 px-1 py-0.5 rounded bg-amber-500/10">{c.duration}连</span>
                  )}
                </div>
                {/* 领涨个股行 */}
                {c.leadingStocks.length > 0 && (
                  <div className="flex items-center gap-1 px-2 pb-1 pl-7">
                    {c.leadingStocks.map((s) => {
                      const isZdt = s.changePercent >= 9.8;
                      const isZt = s.changePercent >= 9.5;
                      return (
                        <button
                          key={s.code}
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                            isZdt
                              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                              : isZt
                                ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                : "bg-[var(--color-surface-secondary)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
                          }`}
                          onClick={() => {
                            const pureCode = s.code.replace(/^(sh|sz|bj)/i, "");
                            const market = pureCode.startsWith("6") ? "sh" : pureCode.startsWith("8") || pureCode.startsWith("4") ? "bj" : "sz";
                            openStock({
                              code: pureCode,
                              name: s.name,
                              market,
                              fullCode: `${market}${pureCode}`,
                              type: "11",
                              hasEsg: false,
                            });
                          }}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className={`font-mono ${isZdt ? "text-red-300" : ""}`}>
                            {s.changePercent > 0 ? "+" : ""}{s.changePercent}%
                          </span>
                          {isZdt && <span className="text-[8px] text-red-300 font-bold">涨停</span>}
                        </button>
                      );
                    })}
                    <span className="text-[9px] text-[var(--color-text-muted)] ml-auto">
                      {c.totalUpCount}/{c.totalStocks}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
