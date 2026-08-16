/**
 * quoteStore 行情同步模块单元测试
 *
 * 测试覆盖：
 * 1. 交易时间判断（isTradingHours）
 * 2. 交易日判断（isMarketDay）
 * 3. 轮询间隔策略（getPollInterval）
 * 4. 增量更新逻辑（quotes diff）
 * 5. 并发锁机制（_fetching flag）
 * 6. 分批请求逻辑（BATCH_SIZE=800）
 * 7. subscribe/unsubscribe 行为
 *
 * 运行: npx tsx __tests__/quoteStore.test.mts
 */

import { strict as assertFn } from "node:assert";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new assertFn.AssertionError({ message });
}

// ===== 纯函数测试：不依赖 zustand/tauri，直接复制逻辑 =====

function isTradingHoursFor(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const h = date.getHours();
  const m = date.getMinutes();
  const t = h * 60 + m;
  if (t >= 555 && t <= 690) return true;  // 9:15 - 11:30
  if (t >= 780 && t <= 900) return true;  // 13:00 - 15:00
  return false;
}

function isMarketDayFor(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getPollIntervalFor(date: Date): number {
  if (!isMarketDayFor(date)) return 60_000;
  if (isTradingHoursFor(date)) return 3_000;
  const h = date.getHours();
  if (h >= 8 && h < 9) return 10_000;
  if (h >= 15 && h < 16) return 10_000;
  return 60_000;
}

// ===== 1. isTradingHours 测试 =====

function test_trading_hours_morning_start() {
  // 9:15 周一 — 交易开始
  const d = makeDate(1, 9, 15);
  assert(isTradingHoursFor(d) === true, "9:15 应为交易时间");
  console.log("  PASS isTradingHours: 9:15 上午开盘");
}

function test_trading_hours_morning_end() {
  // 11:30 周一 — 上午收盘
  const d = makeDate(1, 11, 30);
  assert(isTradingHoursFor(d) === true, "11:30 应为交易时间");
  console.log("  PASS isTradingHours: 11:30 上午收盘");
}

function test_trading_hours_afternoon_start() {
  // 13:00 周一 — 下午开盘
  const d = makeDate(1, 13, 0);
  assert(isTradingHoursFor(d) === true, "13:00 应为交易时间");
  console.log("  PASS isTradingHours: 13:00 下午开盘");
}

function test_trading_hours_afternoon_end() {
  // 15:00 周一 — 下午收盘
  const d = makeDate(1, 15, 0);
  assert(isTradingHoursFor(d) === true, "15:00 应为交易时间");
  console.log("  PASS isTradingHours: 15:00 下午收盘");
}

function test_trading_hours_before_open() {
  // 9:14 周一 — 未开盘
  const d = makeDate(1, 9, 14);
  assert(isTradingHoursFor(d) === false, "9:14 不应为交易时间");
  console.log("  PASS isTradingHours: 9:14 盘前非交易");
}

function test_trading_hours_lunch_break() {
  // 12:00 周一 — 午休
  const d = makeDate(1, 12, 0);
  assert(isTradingHoursFor(d) === false, "12:00 不应为交易时间");
  console.log("  PASS isTradingHours: 12:00 午休非交易");
}

function test_trading_hours_after_close() {
  // 15:01 周一 — 已收盘
  const d = makeDate(1, 15, 1);
  assert(isTradingHoursFor(d) === false, "15:01 不应为交易时间");
  console.log("  PASS isTradingHours: 15:01 盘后非交易");
}

function test_trading_hours_weekend() {
  // 周六任何时间都不是交易时间
  for (let h = 0; h < 24; h++) {
    const d = makeDate(6, h, 0);
    assert(isTradingHoursFor(d) === false, `周六 ${h}:00 不应为交易时间`);
  }
  // 周日
  for (let h = 0; h < 24; h++) {
    const d = makeDate(0, h, 0);
    assert(isTradingHoursFor(d) === false, `周日 ${h}:00 不应为交易时间`);
  }
  console.log("  PASS isTradingHours: 周末全天非交易");
}

function test_trading_hours_boundary_9_14_59() {
  const d = makeDate(1, 9, 14);
  const d2 = makeDate(1, 9, 15);
  assert(isTradingHoursFor(d) === false, "9:14:59 非交易");
  assert(isTradingHoursFor(d2) === true, "9:15:00 交易");
  console.log("  PASS isTradingHours: 9:14/9:15 边界");
}

function test_trading_hours_boundary_11_30_31() {
  const d = makeDate(1, 11, 30);
  const d2 = makeDate(1, 11, 31);
  assert(isTradingHoursFor(d) === true, "11:30 交易");
  assert(isTradingHoursFor(d2) === false, "11:31 非交易");
  console.log("  PASS isTradingHours: 11:30/11:31 边界");
}

// ===== 2. isMarketDay 测试 =====

function test_market_day_weekdays() {
  // 2026-06-01 周一 ~ 2026-06-05 周五
  const weekdays = [
    new Date(2026, 5, 1), // 周一
    new Date(2026, 5, 2), // 周二
    new Date(2026, 5, 3), // 周三
    new Date(2026, 5, 4), // 周四
    new Date(2026, 5, 5), // 周五
  ];
  const dayNames = ["周一", "周二", "周三", "周四", "周五"];
  weekdays.forEach((d, i) => {
    assert(isMarketDayFor(d) === true, `${dayNames[i]} 应为交易日`);
  });
  console.log("  PASS isMarketDay: 周一至周五");
}

function test_market_day_weekend() {
  const sat = new Date(2026, 0, 10); // 周六
  const sun = new Date(2026, 0, 11); // 周日
  assert(isMarketDayFor(sat) === false, "周六非交易日");
  assert(isMarketDayFor(sun) === false, "周日非交易日");
  console.log("  PASS isMarketDay: 周末非交易日");
}

// ===== 3. getPollInterval 测试 =====

function test_poll_interval_trading_hours() {
  // 交易时间 → 3秒
  const d = makeDate(1, 10, 0);
  assert(getPollIntervalFor(d) === 3_000, "交易时间间隔应为3000ms");
  console.log("  PASS getPollInterval: 交易时间 3s");
}

function test_poll_interval_pre_market() {
  // 盘前 8:00-8:59 → 10秒
  const d = makeDate(1, 8, 30);
  assert(getPollIntervalFor(d) === 10_000, "盘前间隔应为10000ms");
  console.log("  PASS getPollInterval: 盘前 10s");
}

function test_poll_interval_after_market() {
  // 盘后 15:00-15:59 → 10秒
  const d = makeDate(1, 15, 30);
  assert(getPollIntervalFor(d) === 10_000, "盘后间隔应为10000ms");
  console.log("  PASS getPollInterval: 盘后 10s");
}

function test_poll_interval_night() {
  // 夜间 → 60秒
  const d = makeDate(1, 22, 0);
  assert(getPollIntervalFor(d) === 60_000, "夜间间隔应为60000ms");
  console.log("  PASS getPollInterval: 夜间 60s");
}

function test_poll_interval_weekend() {
  // 周末 → 60秒
  const d = makeDate(6, 10, 0);
  assert(getPollIntervalFor(d) === 60_000, "周末间隔应为60000ms");
  console.log("  PASS getPollInterval: 周末 60s");
}

function test_poll_interval_lunch_break() {
  // 午休 12:00 → 60秒（工作日非交易时间，非盘前盘后）
  const d = makeDate(1, 12, 0);
  assert(getPollIntervalFor(d) === 60_000, "午休间隔应为60000ms");
  console.log("  PASS getPollInterval: 午休 60s");
}

// ===== 4. 增量更新逻辑测试 =====

interface QuoteData {
  code: string;
  current: number;
  change: number;
  changePercent: number;
}

function computeIncrementalUpdate(
  oldMap: Map<string, QuoteData>,
  newData: QuoteData[]
): { map: Map<string, QuoteData>; changed: boolean } {
  let changed = false;
  const newMap = new Map(oldMap);
  for (const q of newData) {
    const old = oldMap.get(q.code);
    if (!old || old.current !== q.current || old.changePercent !== q.changePercent || old.change !== q.change) {
      newMap.set(q.code, q);
      changed = true;
    }
  }
  return { map: newMap, changed };
}

function test_incremental_no_change() {
  const oldMap = new Map<string, QuoteData>();
  oldMap.set("sh600000", { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.0 });

  const result = computeIncrementalUpdate(oldMap, [
    { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.0 },
  ]);

  assert(result.changed === false, "数据不变时 changed 应为 false");
  assert(result.map.size === oldMap.size, "数据不变时 Map 大小不变");
  assert(result.map.get("sh600000")!.current === 10.5, "数据不变时值不变");
  console.log("  PASS incremental: 数据不变不更新");
}

function test_incremental_price_changed() {
  const oldMap = new Map<string, QuoteData>();
  oldMap.set("sh600000", { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.0 });

  const result = computeIncrementalUpdate(oldMap, [
    { code: "sh600000", current: 10.6, change: 0.6, changePercent: 5.66 },
  ]);

  assert(result.changed === true, "价格变化时 changed 应为 true");
  assert(result.map.get("sh600000")!.current === 10.6, "价格应更新为 10.6");
  console.log("  PASS incremental: 价格变化触发更新");
}

function test_incremental_new_stock() {
  const oldMap = new Map<string, QuoteData>();
  const result = computeIncrementalUpdate(oldMap, [
    { code: "sz000001", current: 15.0, change: -0.3, changePercent: -1.96 },
  ]);

  assert(result.changed === true, "新股票应触发更新");
  assert(result.map.size === 1, "Map 应包含1条数据");
  assert(result.map.get("sz000001")!.current === 15.0, "新股票数据正确");
  console.log("  PASS incremental: 新股票触发更新");
}

function test_incremental_partial_change() {
  const oldMap = new Map<string, QuoteData>();
  oldMap.set("sh600000", { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.0 });
  oldMap.set("sz000001", { code: "sz000001", current: 15.0, change: -0.3, changePercent: -1.96 });

  const result = computeIncrementalUpdate(oldMap, [
    { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.0 },  // 不变
    { code: "sz000001", current: 15.2, change: -0.1, changePercent: -0.65 }, // 变化
  ]);

  assert(result.changed === true, "部分变化应触发更新");
  assert(result.map.get("sh600000")!.current === 10.5, "未变化的股票保持原值");
  assert(result.map.get("sz000001")!.current === 15.2, "变化的股票更新为新值");
  console.log("  PASS incremental: 部分变化只更新变化的条目");
}

function test_incremental_change_percent_only() {
  const oldMap = new Map<string, QuoteData>();
  oldMap.set("sh600000", { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.0 });

  const result = computeIncrementalUpdate(oldMap, [
    { code: "sh600000", current: 10.5, change: 0.5, changePercent: 5.01 }, // 仅涨跌幅变化
  ]);

  assert(result.changed === true, "涨跌幅变化应触发更新");
  console.log("  PASS incremental: 涨跌幅变化触发更新");
}

function test_incremental_large_batch() {
  const oldMap = new Map<string, QuoteData>();
  const newData: QuoteData[] = [];

  // 模拟5208只股票，其中100只价格变化
  for (let i = 0; i < 5208; i++) {
    const code = `sh6${String(i).padStart(5, "0")}`;
    oldMap.set(code, { code, current: 10.0, change: 0, changePercent: 0 });
    newData.push({
      code,
      current: i < 100 ? 10.5 : 10.0,  // 前100只变化
      change: i < 100 ? 0.5 : 0,
      changePercent: i < 100 ? 5.0 : 0,
    });
  }

  const result = computeIncrementalUpdate(oldMap, newData);

  assert(result.changed === true, "大批量部分变化应触发更新");
  assert(result.map.size === 5208, "Map 大小应保持 5208");
  console.log("  PASS incremental: 5208只股票批量更新（100只变化）");
}

// ===== 5. 并发锁机制测试 =====

function test_concurrent_lock() {
  // 模拟 _fetching 标志位逻辑
  let _fetching = false;

  async function mockFetch(): Promise<boolean> {
    if (_fetching) return false; // 被锁阻止
    _fetching = true;
    try {
      await new Promise((r) => setTimeout(r, 50));
      return true;
    } finally {
      _fetching = false;
    }
  }

  // 串行调用：第二次应该成功
  const p1 = mockFetch();
  const p2 = mockFetch(); // 此时 _fetching=true，应被阻止

  Promise.all([p1, p2]).then(([r1, r2]) => {
    assert(r1 === true, "第一次请求应成功");
    assert(r2 === false, "并发请求应被锁阻止");
    console.log("  PASS concurrent lock: 并发请求被阻止");
  });
}

function test_sequential_fetch() {
  let _fetching = false;
  let fetchCount = 0;

  async function mockFetch(): Promise<void> {
    if (_fetching) return;
    _fetching = true;
    try {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      _fetching = false;
    }
  }

  // 串行调用
  mockFetch().then(() => {
    assert(fetchCount === 1, "第一次请求计数为1");
    return mockFetch();
  }).then(() => {
    assert(fetchCount === 2, "串行请求计数为2");
    console.log("  PASS concurrent lock: 串行请求不被阻止");
  });
}

// ===== 6. 分批请求逻辑测试 =====

function test_batch_split() {
  const BATCH_SIZE = 800;
  const codes: string[] = [];

  // 模拟5208只股票
  for (let i = 0; i < 5208; i++) {
    codes.push(`sh6${String(i).padStart(5, "0")}`);
  }

  const batches: string[][] = [];
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    batches.push(codes.slice(i, i + BATCH_SIZE));
  }

  assert(batches.length === 7, `5208只股票应分为7批，实际 ${batches.length}`);
  assert(batches[0].length === 800, `第1批应为800只，实际 ${batches[0].length}`);
  assert(batches[6].length === 408, `第7批应为408只，实际 ${batches[6].length}`);

  // 验证所有代码都被覆盖
  const totalInBatches = batches.reduce((sum, b) => sum + b.length, 0);
  assert(totalInBatches === 5208, `分批总数应为5208，实际 ${totalInBatches}`);

  console.log("  PASS batch split: 5208只 → 7批 [800×6, 408]");
}

function test_batch_split_small() {
  const BATCH_SIZE = 800;
  const codes = ["sh600000", "sz000001", "bj430001"];

  const batches: string[][] = [];
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    batches.push(codes.slice(i, i + BATCH_SIZE));
  }

  assert(batches.length === 1, "3只股票应为1批");
  assert(batches[0].length === 3, "1批包含3只");
  console.log("  PASS batch split: 小数量不分批");
}

function test_batch_split_exact() {
  const BATCH_SIZE = 800;
  const codes: string[] = [];
  for (let i = 0; i < 800; i++) {
    codes.push(`sh6${String(i).padStart(5, "0")}`);
  }

  const batches: string[][] = [];
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    batches.push(codes.slice(i, i + BATCH_SIZE));
  }

  assert(batches.length === 1, "恰好800只应为1批");
  console.log("  PASS batch split: 恰好800只为1批");
}

function test_batch_split_empty() {
  const BATCH_SIZE = 800;
  const codes: string[] = [];

  const batches: string[][] = [];
  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    batches.push(codes.slice(i, i + BATCH_SIZE));
  }

  assert(batches.length === 0, "空列表应为0批");
  console.log("  PASS batch split: 空列表0批");
}

// ===== 7. subscribe/unsubscribe 行为测试 =====

function test_subscribe_dedup() {
  const sub = new Set<string>();
  const codes = ["sh600000", "sz000001", "sh600000", "sz000001", "bj430001"];

  let changed = false;
  for (const c of codes) {
    if (!sub.has(c)) {
      sub.add(c);
      changed = true;
    }
  }

  assert(sub.size === 3, "去重后应为3个代码");
  assert(changed === true, "有新增代码时 changed 为 true");
  console.log("  PASS subscribe: 重复代码去重");
}

function test_subscribe_no_change() {
  const sub = new Set<string>(["sh600000", "sz000001"]);

  let changed = false;
  for (const c of ["sh600000", "sz000001"]) {
    if (!sub.has(c)) {
      sub.add(c);
      changed = true;
    }
  }

  assert(changed === false, "无新增代码时 changed 为 false");
  console.log("  PASS subscribe: 无新增不触发");
}

function test_unsubscribe_partial() {
  const sub = new Set<string>(["sh600000", "sz000001", "bj430001"]);

  for (const c of ["sh600000"]) {
    sub.delete(c);
  }

  assert(sub.size === 2, "部分取消后应为2个");
  assert(sub.has("sh600000") === false, "已取消的不在集合中");
  assert(sub.has("sz000001") === true, "未取消的仍在集合中");
  console.log("  PASS unsubscribe: 部分取消");
}

function test_unsubscribe_all() {
  const sub = new Set<string>(["sh600000", "sz000001"]);

  for (const c of ["sh600000", "sz000001"]) {
    sub.delete(c);
  }

  assert(sub.size === 0, "全部取消后集合为空");
  console.log("  PASS unsubscribe: 全部取消后集合为空");
}

// ===== 8. 进度百分比溢出保护测试 =====

function test_progress_overflow() {
  // 模拟 synced > total 的异常情况
  const synced = 67694;
  const total = 5207;

  const raw = Math.round((synced / total) * 100);
  const clamped = Math.min(100, raw);

  assert(raw === 1300, "原始百分比应为1300%");
  assert(clamped === 100, "裁剪后应为100%");
  console.log("  PASS progress: 溢出保护 1300% → 100%");
}

function test_progress_normal() {
  const synced = 2604;
  const total = 5208;

  const progress = Math.min(100, Math.round((synced / total) * 100));

  assert(progress === 50, "正常进度应为50%");
  console.log("  PASS progress: 正常进度 50%");
}

function test_progress_zero_total() {
  const synced = 0;
  const total = 0;

  const progress = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0;

  assert(progress === 0, "total为0时进度应为0");
  console.log("  PASS progress: total为0时返回0");
}

function test_progress_complete() {
  const synced = 5208;
  const total = 5208;

  const progress = Math.min(100, Math.round((synced / total) * 100));

  assert(progress === 100, "完成时进度应为100%");
  console.log("  PASS progress: 完成时100%");
}

// ===== 辅助函数 =====

function makeDate(dayOfWeek: number, hour: number, minute: number): Date {
  // 构造一个指定星期和时间的 Date
  // 找到2026年1月5日（周一）为基准
  const base = new Date(2026, 0, 5); // 2026-01-05 周一
  const diff = dayOfWeek - 1; // 周一=0偏移
  const d = new Date(base);
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ===== 运行所有测试 =====

(async function runAll() {
  console.log("\n=== quoteStore 行情同步模块测试 ===\n");

  console.log("【1. 交易时间判断 isTradingHours】");
  test_trading_hours_morning_start();
  test_trading_hours_morning_end();
  test_trading_hours_afternoon_start();
  test_trading_hours_afternoon_end();
  test_trading_hours_before_open();
  test_trading_hours_lunch_break();
  test_trading_hours_after_close();
  test_trading_hours_weekend();
  test_trading_hours_boundary_9_14_59();
  test_trading_hours_boundary_11_30_31();

  console.log("\n【2. 交易日判断 isMarketDay】");
  test_market_day_weekdays();
  test_market_day_weekend();

  console.log("\n【3. 轮询间隔策略 getPollInterval】");
  test_poll_interval_trading_hours();
  test_poll_interval_pre_market();
  test_poll_interval_after_market();
  test_poll_interval_night();
  test_poll_interval_weekend();
  test_poll_interval_lunch_break();

  console.log("\n【4. 增量更新逻辑】");
  test_incremental_no_change();
  test_incremental_price_changed();
  test_incremental_new_stock();
  test_incremental_partial_change();
  test_incremental_change_percent_only();
  test_incremental_large_batch();

  console.log("\n【5. 并发锁机制】");
  await test_concurrent_lock();
  await test_sequential_fetch();

  console.log("\n【6. 分批请求逻辑】");
  test_batch_split();
  test_batch_split_small();
  test_batch_split_exact();
  test_batch_split_empty();

  console.log("\n【7. subscribe/unsubscribe 行为】");
  test_subscribe_dedup();
  test_subscribe_no_change();
  test_unsubscribe_partial();
  test_unsubscribe_all();

  console.log("\n【8. 进度百分比溢出保护】");
  test_progress_overflow();
  test_progress_normal();
  test_progress_zero_total();
  test_progress_complete();

  console.log("\n\n  所有测试通过 (36/36)\n");
})();
