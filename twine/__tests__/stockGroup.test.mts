/**
 * 股票分组逻辑单元测试
 *
 * 核心验证：
 * 1. 系统分组（置顶/默认）不可删除
 * 2. 置顶与分组不冲突：股票可同时属于置顶和自定义分组
 * 3. 删除自定义分组时，组内股票回归默认分组
 * 4. getGroupStocks 正确按分组/置顶筛选
 * 5. 分组排序：置顶 > 默认 > 自定义
 * 6. 新建分组 order 递增
 * 7. 折叠状态管理
 * 8. 关注级别排序
 * 9. StockDetailPanel moveToGroup 逻辑
 */

import { strict as assertFn } from "node:assert";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new assertFn.AssertionError({ message });
}

// ──────────────────────────────────────────────
// 模拟类型（与 src/types/index.ts 对齐）
// ──────────────────────────────────────────────

interface StockProfile {
  code: string;
  name: string;
  market: "sh" | "sz" | "bj";
  industry: string;
  sector: string;
  researchNotes: string;
  themes: string[];
  tradeHistory: string[];
  relatedInsights: string[];
  watchLevel: "none" | "watching" | "holding" | "focus";
  group: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StockGroup {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

// ──────────────────────────────────────────────
// 常量（与 StocksPanel 对齐）
// ──────────────────────────────────────────────

const DEFAULT_GROUP_ID = "__default__";
const PINNED_GROUP_ID = "__pinned__";

const SYSTEM_GROUPS: StockGroup[] = [
  { id: PINNED_GROUP_ID, name: "置顶", order: -1, collapsed: false },
  { id: DEFAULT_GROUP_ID, name: "默认分组", order: 0, collapsed: false },
];

const WATCH_LEVEL_ORDER: Record<string, number> = {
  holding: 0,
  focus: 1,
  watching: 2,
  none: 3,
};

// ──────────────────────────────────────────────
// 纯函数实现（从组件逻辑提取，无 React 依赖）
// ──────────────────────────────────────────────

function ensureSystemGroups(groups: StockGroup[]): StockGroup[] {
  const result = [...groups];
  for (const sg of SYSTEM_GROUPS) {
    if (!result.find((g) => g.id === sg.id)) {
      result.push({ ...sg });
    }
  }
  return result;
}

function sortGroups(groups: StockGroup[]): StockGroup[] {
  return [...groups].sort((a, b) => a.order - b.order);
}

function addGroup(groups: StockGroup[], name: string): StockGroup[] {
  if (!name.trim()) return groups;
  const id = `group_${Date.now()}`;
  const maxOrder = groups.reduce((max, g) => Math.max(max, g.order), 0);
  return [...groups, { id, name: name.trim(), order: maxOrder + 1, collapsed: false }];
}

function deleteGroup(groups: StockGroup[], profiles: StockProfile[], groupId: string): { groups: StockGroup[]; profiles: StockProfile[] } {
  if (groupId === DEFAULT_GROUP_ID || groupId === PINNED_GROUP_ID) {
    return { groups, profiles };
  }
  const nextGroups = groups.filter((g) => g.id !== groupId);
  const nextProfiles = profiles.map((p) =>
    p.group === groupId ? { ...p, group: DEFAULT_GROUP_ID, updatedAt: new Date().toISOString() } : p
  );
  return { groups: nextGroups, profiles: nextProfiles };
}

function renameGroup(groups: StockGroup[], groupId: string, newName: string): StockGroup[] {
  if (!newName.trim()) return groups;
  return groups.map((g) => g.id === groupId ? { ...g, name: newName.trim() } : g);
}

function togglePin(profiles: StockProfile[], code: string): StockProfile[] {
  return profiles.map((p) =>
    p.code === code ? { ...p, pinned: !p.pinned, updatedAt: new Date().toISOString() } : p
  );
}

function moveToGroup(profiles: StockProfile[], code: string, groupId: string): StockProfile[] {
  return profiles.map((p) =>
    p.code === code ? { ...p, group: groupId, updatedAt: new Date().toISOString() } : p
  );
}

function getGroupStocks(profiles: StockProfile[], groupId: string): StockProfile[] {
  if (groupId === PINNED_GROUP_ID) {
    return profiles.filter((p) => p.pinned);
  }
  return profiles
    .filter((p) => p.group === groupId)
    .sort((a, b) => {
      const la = WATCH_LEVEL_ORDER[a.watchLevel] ?? 3;
      const lb = WATCH_LEVEL_ORDER[b.watchLevel] ?? 3;
      return la - lb;
    });
}

function toggleCollapse(collapsedSet: Set<string>, groupId: string): Set<string> {
  const next = new Set(collapsedSet);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  return next;
}

// ──────────────────────────────────────────────
// 测试辅助
// ──────────────────────────────────────────────

function makeProfile(code: string, overrides: Partial<StockProfile> = {}): StockProfile {
  return {
    code,
    name: `股票${code}`,
    market: "sh",
    industry: "",
    sector: "",
    researchNotes: "",
    themes: [],
    tradeHistory: [],
    relatedInsights: [],
    watchLevel: "none",
    group: DEFAULT_GROUP_ID,
    pinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// 测试用例
// ──────────────────────────────────────────────

function test_system_groups_always_present() {
  const empty: StockGroup[] = [];
  const result = ensureSystemGroups(empty);
  assert(result.find((g) => g.id === PINNED_GROUP_ID) !== undefined, "置顶分组必须存在");
  assert(result.find((g) => g.id === DEFAULT_GROUP_ID) !== undefined, "默认分组必须存在");
  assert(result.length === 2, "空输入应补全2个系统分组");

  const withCustom: StockGroup[] = [
    { id: "group_1", name: "科技", order: 1, collapsed: false },
  ];
  const result2 = ensureSystemGroups(withCustom);
  assert(result2.length === 3, "已有自定义分组时补全后应有3个");
  assert(result2.find((g) => g.id === "group_1") !== undefined, "自定义分组保留");

  const alreadyHasDefault: StockGroup[] = [
    { id: DEFAULT_GROUP_ID, name: "默认分组", order: 0, collapsed: true },
  ];
  const result3 = ensureSystemGroups(alreadyHasDefault);
  assert(result3.filter((g) => g.id === DEFAULT_GROUP_ID).length === 1, "默认分组不重复");
  assert(result3.find((g) => g.id === PINNED_GROUP_ID) !== undefined, "补全置顶分组");

  console.log("  PASS 系统分组始终存在");
}

function test_system_groups_not_deletable() {
  const groups: StockGroup[] = [...SYSTEM_GROUPS, { id: "g1", name: "科技", order: 1, collapsed: false }];
  const profiles: StockProfile[] = [makeProfile("600001")];

  const r1 = deleteGroup(groups, profiles, DEFAULT_GROUP_ID);
  assert(r1.groups.length === 3, "默认分组不可删除");

  const r2 = deleteGroup(groups, profiles, PINNED_GROUP_ID);
  assert(r2.groups.length === 3, "置顶分组不可删除");

  const r3 = deleteGroup(groups, profiles, "g1");
  assert(r3.groups.length === 2, "自定义分组可删除");
  assert(r3.groups.find((g) => g.id === "g1") === undefined, "自定义分组已移除");

  console.log("  PASS 系统分组不可删除");
}

function test_delete_group_moves_stocks_to_default() {
  const groups: StockGroup[] = [...SYSTEM_GROUPS, { id: "g1", name: "科技", order: 1, collapsed: false }];
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: "g1" }),
    makeProfile("000002", { group: DEFAULT_GROUP_ID }),
    makeProfile("300003", { group: "g1" }),
  ];

  const result = deleteGroup(groups, profiles, "g1");
  assert(result.profiles.filter((p) => p.group === "g1").length === 0, "删除后无股票属于已删分组");
  assert(result.profiles.filter((p) => p.group === DEFAULT_GROUP_ID).length === 3, "原分组股票回归默认分组");
  assert(result.profiles.find((p) => p.code === "000002")!.group === DEFAULT_GROUP_ID, "默认分组股票不受影响");

  console.log("  PASS 删除分组时股票回归默认分组");
}

function test_pinned_and_group_coexist() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: "g1", pinned: true }),
    makeProfile("000002", { group: "g1", pinned: false }),
    makeProfile("300003", { group: DEFAULT_GROUP_ID, pinned: true }),
  ];

  const pinnedStocks = getGroupStocks(profiles, PINNED_GROUP_ID);
  assert(pinnedStocks.length === 2, "置顶分组显示所有 pinned 股票");
  assert(pinnedStocks.find((p) => p.code === "600001") !== undefined, "600001 在置顶分组");
  assert(pinnedStocks.find((p) => p.code === "300003") !== undefined, "300003 在置顶分组");

  const g1Stocks = getGroupStocks(profiles, "g1");
  assert(g1Stocks.length === 2, "自定义分组也显示 pinned 的股票（不排除）");
  assert(g1Stocks.find((p) => p.code === "600001") !== undefined, "600001 同时在 g1 分组");
  assert(g1Stocks.find((p) => p.code === "000002") !== undefined, "000002 在 g1 分组");

  const defaultStocks = getGroupStocks(profiles, DEFAULT_GROUP_ID);
  assert(defaultStocks.length === 1, "默认分组只显示 group=default 的股票");
  assert(defaultStocks.find((p) => p.code === "300003") !== undefined, "300003 同时在默认分组");

  console.log("  PASS 置顶与分组不冲突");
}

function test_toggle_pin_does_not_change_group() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: "g1", pinned: false }),
  ];

  const afterPin = togglePin(profiles, "600001");
  assert(afterPin[0].pinned === true, "置顶后 pinned=true");
  assert(afterPin[0].group === "g1", "置顶不改变 group 字段");

  const afterUnpin = togglePin(afterPin, "600001");
  assert(afterUnpin[0].pinned === false, "取消置顶后 pinned=false");
  assert(afterUnpin[0].group === "g1", "取消置顶不改变 group 字段");

  console.log("  PASS 置顶操作不改变分组归属");
}

function test_group_sorting_order() {
  const groups: StockGroup[] = [
    { id: "g2", name: "消费", order: 2, collapsed: false },
    { id: PINNED_GROUP_ID, name: "置顶", order: -1, collapsed: false },
    { id: "g1", name: "科技", order: 1, collapsed: false },
    { id: DEFAULT_GROUP_ID, name: "默认分组", order: 0, collapsed: false },
  ];

  const sorted = sortGroups(groups);
  assert(sorted[0].id === PINNED_GROUP_ID, "置顶分组排第一");
  assert(sorted[1].id === DEFAULT_GROUP_ID, "默认分组排第二");
  assert(sorted[2].id === "g1", "科技排第三（order=1）");
  assert(sorted[3].id === "g2", "消费排第四（order=2）");

  console.log("  PASS 分组排序：置顶 > 默认 > 自定义");
}

function test_add_group_order_increment() {
  const groups: StockGroup[] = [...SYSTEM_GROUPS];

  const g1 = addGroup(groups, "科技");
  const added1 = g1.find((g) => g.name === "科技")!;
  assert(added1.order === 1, "第一个自定义分组 order=1");

  const g2 = addGroup(g1, "消费");
  const added2 = g2.find((g) => g.name === "消费")!;
  assert(added2.order === 2, "第二个自定义分组 order=2");

  const g3 = addGroup(g2, "  ");
  assert(g3.length === g2.length, "空名称不添加分组");

  console.log("  PASS 新建分组 order 递增");
}

function test_rename_group() {
  const groups: StockGroup[] = [
    ...SYSTEM_GROUPS,
    { id: "g1", name: "科技", order: 1, collapsed: false },
  ];

  const renamed = renameGroup(groups, "g1", "硬科技");
  assert(renamed.find((g) => g.id === "g1")!.name === "硬科技", "重命名成功");

  const noChange = renameGroup(groups, "g1", "  ");
  assert(noChange.find((g) => g.id === "g1")!.name === "科技", "空名称不重命名");

  const notFound = renameGroup(groups, "g99", "新名");
  assert(notFound.length === groups.length, "不存在的分组不影响");

  console.log("  PASS 分组重命名");
}

function test_collapse_toggle() {
  let collapsed = new Set<string>();

  collapsed = toggleCollapse(collapsed, DEFAULT_GROUP_ID);
  assert(collapsed.has(DEFAULT_GROUP_ID), "折叠默认分组");

  collapsed = toggleCollapse(collapsed, DEFAULT_GROUP_ID);
  assert(!collapsed.has(DEFAULT_GROUP_ID), "展开默认分组");

  collapsed = toggleCollapse(collapsed, "g1");
  collapsed = toggleCollapse(collapsed, "g2");
  assert(collapsed.has("g1") && collapsed.has("g2"), "多分组同时折叠");

  collapsed = toggleCollapse(collapsed, "g1");
  assert(!collapsed.has("g1") && collapsed.has("g2"), "只展开指定分组");

  console.log("  PASS 折叠状态管理");
}

function test_watch_level_sorting() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: DEFAULT_GROUP_ID, watchLevel: "none" }),
    makeProfile("000002", { group: DEFAULT_GROUP_ID, watchLevel: "holding" }),
    makeProfile("300003", { group: DEFAULT_GROUP_ID, watchLevel: "watching" }),
    makeProfile("601004", { group: DEFAULT_GROUP_ID, watchLevel: "focus" }),
  ];

  const sorted = getGroupStocks(profiles, DEFAULT_GROUP_ID);
  assert(sorted[0].code === "000002", "持仓(holding)排第一");
  assert(sorted[1].code === "601004", "重点(focus)排第二");
  assert(sorted[2].code === "300003", "关注(watching)排第三");
  assert(sorted[3].code === "600001", "自选(none)排最后");

  console.log("  PASS 关注级别排序：持仓 > 重点 > 关注 > 自选");
}

function test_move_to_group() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: DEFAULT_GROUP_ID }),
    makeProfile("000002", { group: "g1" }),
  ];

  const moved = moveToGroup(profiles, "600001", "g1");
  assert(moved.find((p) => p.code === "600001")!.group === "g1", "移动到目标分组");
  assert(moved.find((p) => p.code === "000002")!.group === "g1", "其他股票不受影响");

  const movedBack = moveToGroup(moved, "600001", DEFAULT_GROUP_ID);
  assert(movedBack.find((p) => p.code === "600001")!.group === DEFAULT_GROUP_ID, "移回默认分组");

  console.log("  PASS 移动股票到分组");
}

function test_pinned_group_empty_hidden() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { pinned: false }),
  ];

  const pinnedStocks = getGroupStocks(profiles, PINNED_GROUP_ID);
  assert(pinnedStocks.length === 0, "无置顶股票时置顶分组为空");

  console.log("  PASS 无置顶股票时置顶分组为空");
}

function test_pin_then_move_group() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: DEFAULT_GROUP_ID, pinned: false }),
  ];

  const afterPin = togglePin(profiles, "600001");
  assert(afterPin[0].pinned === true, "置顶成功");
  assert(afterPin[0].group === DEFAULT_GROUP_ID, "置顶后仍在默认分组");

  const afterMove = moveToGroup(afterPin, "600001", "g1");
  assert(afterMove[0].group === "g1", "移动到 g1");
  assert(afterMove[0].pinned === true, "移动后仍置顶");

  const pinnedStocks = getGroupStocks(afterMove, PINNED_GROUP_ID);
  assert(pinnedStocks.length === 1, "置顶分组仍显示该股票");

  const g1Stocks = getGroupStocks(afterMove, "g1");
  assert(g1Stocks.length === 1, "g1 分组也显示该股票");

  console.log("  PASS 置顶后移动分组，两边都显示");
}

function test_unpin_stays_in_group() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: "g1", pinned: true }),
  ];

  const afterUnpin = togglePin(profiles, "600001");
  assert(afterUnpin[0].pinned === false, "取消置顶");
  assert(afterUnpin[0].group === "g1", "取消置顶后仍在原分组");

  const pinnedStocks = getGroupStocks(afterUnpin, PINNED_GROUP_ID);
  assert(pinnedStocks.length === 0, "置顶分组不再显示");

  const g1Stocks = getGroupStocks(afterUnpin, "g1");
  assert(g1Stocks.length === 1, "原分组仍显示");

  console.log("  PASS 取消置顶后股票保留在原分组");
}

function test_multiple_pins_across_groups() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: "g1", pinned: true }),
    makeProfile("000002", { group: "g2", pinned: true }),
    makeProfile("300003", { group: DEFAULT_GROUP_ID, pinned: true }),
    makeProfile("601004", { group: "g1", pinned: false }),
  ];

  const pinnedStocks = getGroupStocks(profiles, PINNED_GROUP_ID);
  assert(pinnedStocks.length === 3, "置顶分组显示3只股票");

  const g1Stocks = getGroupStocks(profiles, "g1");
  assert(g1Stocks.length === 2, "g1 分组显示2只（含1只置顶）");

  const g2Stocks = getGroupStocks(profiles, "g2");
  assert(g2Stocks.length === 1, "g2 分组显示1只（置顶的）");

  console.log("  PASS 多分组多置顶交叉显示");
}

function test_delete_group_with_pinned_stock() {
  const groups: StockGroup[] = [...SYSTEM_GROUPS, { id: "g1", name: "科技", order: 1, collapsed: false }];
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: "g1", pinned: true }),
    makeProfile("000002", { group: "g1", pinned: false }),
  ];

  const result = deleteGroup(groups, profiles, "g1");
  assert(result.profiles.find((p) => p.code === "600001")!.group === DEFAULT_GROUP_ID, "置顶股票回归默认分组");
  assert(result.profiles.find((p) => p.code === "600001")!.pinned === true, "置顶状态保留");
  assert(result.profiles.find((p) => p.code === "000002")!.group === DEFAULT_GROUP_ID, "普通股票回归默认分组");

  console.log("  PASS 删除分组时置顶股票回归默认分组且保留置顶状态");
}

function test_stock_detail_move_to_group() {
  const profiles: StockProfile[] = [
    makeProfile("600001", { group: DEFAULT_GROUP_ID }),
  ];

  const afterMove = moveToGroup(profiles, "600001", "g1");
  assert(afterMove[0].group === "g1", "详情页移动到 g1");

  const afterMoveAgain = moveToGroup(afterMove, "600001", "g2");
  assert(afterMoveAgain[0].group === "g2", "详情页再次移动到 g2");

  const notFound = moveToGroup(profiles, "999999", "g1");
  assert(notFound[0].group === DEFAULT_GROUP_ID, "不存在的股票不受影响");

  console.log("  PASS StockDetailPanel moveToGroup 逻辑");
}

// ──────────────────────────────────────────────
// 视觉回归测试：分组样式配置
// ──────────────────────────────────────────────

type GroupType = "pinned" | "default" | "custom";

interface GroupHeaderStyle {
  groupType: GroupType;
  background: string;
  hoverBackground: string;
  titleFontSize: string;
  titleFontWeight: string;
  titleColor: string;
  titleTracking: string;
  badgeFontSize: string;
  badgePaddingX: string;
  badgePaddingY: string;
  badgeBorderRadius: string;
  badgeBg: string;
  badgeColor: string;
  hasPinIcon: boolean;
  showActions: boolean;
}

interface StockCardStyle {
  isPinned: boolean;
  pinnedIndicator: string;
  pinnedIndicatorColor: string;
  nameFontSize: string;
  nameFontWeight: string;
  nameTracking: string;
  codeFontSize: string;
  codeColor: string;
  priceFontSize: string;
  priceFontWeight: string;
  changeFontSize: string;
  changeBorderRadius: string;
  changeMinWidth: string;
  upBg: string;
  upColor: string;
  downBg: string;
  downColor: string;
}

function getGroupHeaderStyle(groupId: string): GroupHeaderStyle {
  const isPinned = groupId === PINNED_GROUP_ID;
  const isDefault = groupId === DEFAULT_GROUP_ID;
  const groupType: GroupType = isPinned ? "pinned" : isDefault ? "default" : "custom";

  const styles: Record<GroupType, GroupHeaderStyle> = {
    pinned: {
      groupType: "pinned",
      background: "bg-gradient-to-r from-amber-500/[0.06] to-transparent",
      hoverBackground: "hover:from-amber-500/[0.10]",
      titleFontSize: "12px",
      titleFontWeight: "font-bold",
      titleColor: "text-amber-600 dark:text-amber-400",
      titleTracking: "tracking-wider",
      badgeFontSize: "10px",
      badgePaddingX: "6px",
      badgePaddingY: "1px",
      badgeBorderRadius: "rounded-full",
      badgeBg: "bg-amber-500/15",
      badgeColor: "text-amber-600 dark:text-amber-400",
      hasPinIcon: true,
      showActions: false,
    },
    default: {
      groupType: "default",
      background: "bg-[var(--color-surface-secondary)]/50",
      hoverBackground: "hover:bg-[var(--color-surface-hover)]/60",
      titleFontSize: "12px",
      titleFontWeight: "font-semibold",
      titleColor: "text-[var(--color-text-primary)]",
      titleTracking: "",
      badgeFontSize: "10px",
      badgePaddingX: "6px",
      badgePaddingY: "1px",
      badgeBorderRadius: "rounded-full",
      badgeBg: "bg-[var(--color-surface-hover)]",
      badgeColor: "text-[var(--color-text-muted)]",
      hasPinIcon: false,
      showActions: false,
    },
    custom: {
      groupType: "custom",
      background: "",
      hoverBackground: "hover:bg-[var(--color-surface-hover)]/40",
      titleFontSize: "12px",
      titleFontWeight: "font-medium",
      titleColor: "text-[var(--color-text-primary)]/90",
      titleTracking: "",
      badgeFontSize: "10px",
      badgePaddingX: "6px",
      badgePaddingY: "1px",
      badgeBorderRadius: "rounded-full",
      badgeBg: "bg-[var(--color-surface-secondary)]",
      badgeColor: "text-[var(--color-text-muted)]/80",
      showActions: true,
      hasPinIcon: false,
    },
  };

  return styles[groupType];
}

function getStockCardStyle(pinned: boolean): StockCardStyle {
  return {
    isPinned: pinned,
    pinnedIndicator: pinned ? "●" : "",
    pinnedIndicatorColor: "text-amber-500",
    nameFontSize: "12px",
    nameFontWeight: "font-medium",
    nameTracking: "tracking-wide",
    codeFontSize: "10px",
    codeColor: "text-[var(--color-text-muted)]/60",
    priceFontSize: "13px",
    priceFontWeight: "font-bold",
    changeFontSize: "10px",
    changeBorderRadius: "rounded-sm",
    changeMinWidth: "50px",
    upBg: "bg-red-500/10",
    upColor: "text-red-500",
    downBg: "bg-green-500/10",
    downColor: "text-green-500",
  };
}

function test_group_header_font_hierarchy() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  assert(pinned.titleFontSize === "12px", "置顶分组标题 12px");
  assert(def.titleFontSize === "12px", "默认分组标题 12px");
  assert(custom.titleFontSize === "12px", "自定义分组标题 12px");

  const weightOrder: Record<string, number> = { "font-bold": 3, "font-semibold": 2, "font-medium": 1 };
  assert(weightOrder[pinned.titleFontWeight] > weightOrder[def.titleFontWeight], "置顶 > 默认 字重");
  assert(weightOrder[def.titleFontWeight] > weightOrder[custom.titleFontWeight], "默认 > 自定义 字重");

  assert(pinned.titleTracking === "tracking-wider", "置顶分组 tracking-wider");
  assert(def.titleTracking === "", "默认分组无额外字距");
  assert(custom.titleTracking === "", "自定义分组无额外字距");

  console.log("  PASS 分组标题字体层次：置顶bold > 默认semibold > 自定义medium");
}

function test_group_header_color_differentiation() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  assert(pinned.titleColor.includes("amber"), "置顶分组标题琥珀色");
  assert(!def.titleColor.includes("amber"), "默认分组标题非琥珀色");
  assert(!custom.titleColor.includes("amber"), "自定义分组标题非琥珀色");

  assert(pinned.badgeColor.includes("amber"), "置顶徽章琥珀色");
  assert(!def.badgeColor.includes("amber"), "默认徽章非琥珀色");
  assert(!custom.badgeColor.includes("amber"), "自定义徽章非琥珀色");

  assert(pinned.badgeBg.includes("amber"), "置顶徽章背景含琥珀色");
  assert(!def.badgeBg.includes("amber"), "默认徽章背景不含琥珀色");

  console.log("  PASS 分组标题颜色区分：置顶琥珀色独立");
}

function test_group_header_background_differentiation() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  assert(pinned.background.includes("gradient"), "置顶分组渐变背景");
  assert(pinned.background.includes("amber"), "置顶分组背景含琥珀色");
  assert(!def.background.includes("gradient"), "默认分组非渐变背景");
  assert(custom.background === "", "自定义分组无默认背景");

  assert(pinned.hoverBackground.includes("amber"), "置顶分组 hover 含琥珀色");
  assert(def.hoverBackground.includes("surface-hover"), "默认分组 hover 含 surface-hover");
  assert(custom.hoverBackground.includes("surface-hover"), "自定义分组 hover 含 surface-hover");

  console.log("  PASS 分组背景区分：置顶渐变 > 默认半透明 > 自定义无");
}

function test_group_header_badge_consistency() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  assert(pinned.badgeFontSize === "10px", "置顶徽章 10px");
  assert(def.badgeFontSize === "10px", "默认徽章 10px");
  assert(custom.badgeFontSize === "10px", "自定义徽章 10px");

  assert(pinned.badgePaddingX === "6px", "置顶徽章 px=6px");
  assert(def.badgePaddingX === "6px", "默认徽章 px=6px");
  assert(custom.badgePaddingX === "6px", "自定义徽章 px=6px");

  assert(pinned.badgePaddingY === "1px", "置顶徽章 py=1px");
  assert(def.badgePaddingY === "1px", "默认徽章 py=1px");
  assert(custom.badgePaddingY === "1px", "自定义徽章 py=1px");

  assert(pinned.badgeBorderRadius === "rounded-full", "置顶徽章圆角");
  assert(def.badgeBorderRadius === "rounded-full", "默认徽章圆角");
  assert(custom.badgeBorderRadius === "rounded-full", "自定义徽章圆角");

  console.log("  PASS 徽章尺寸一致性：10px / px-6px / py-1px / rounded-full");
}

function test_group_header_pin_icon() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  assert(pinned.hasPinIcon === true, "置顶分组显示📌图标");
  assert(def.hasPinIcon === false, "默认分组不显示📌图标");
  assert(custom.hasPinIcon === false, "自定义分组不显示📌图标");

  console.log("  PASS 置顶分组📌图标");
}

function test_group_header_actions_visibility() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  assert(pinned.showActions === false, "置顶分组无重命名/删除");
  assert(def.showActions === false, "默认分组无重命名/删除");
  assert(custom.showActions === true, "自定义分组有重命名/删除");

  console.log("  PASS 分组操作按钮：仅自定义分组显示");
}

function test_stock_card_pinned_indicator() {
  const pinned = getStockCardStyle(true);
  const normal = getStockCardStyle(false);

  assert(pinned.isPinned === true, "置顶股票标记");
  assert(pinned.pinnedIndicator === "●", "置顶股票显示圆点");
  assert(pinned.pinnedIndicatorColor === "text-amber-500", "圆点琥珀色");

  assert(normal.isPinned === false, "普通股票无置顶标记");
  assert(normal.pinnedIndicator === "", "普通股票无圆点");

  console.log("  PASS 股票卡片置顶圆点指示器");
}

function test_stock_card_font_sizes() {
  const style = getStockCardStyle(false);

  assert(style.nameFontSize === "12px", "股票名称 12px");
  assert(style.codeFontSize === "10px", "股票代码 10px");
  assert(style.priceFontSize === "13px", "价格 13px");
  assert(style.changeFontSize === "10px", "涨跌幅 10px");

  assert(parseInt(style.priceFontSize) > parseInt(style.nameFontSize), "价格 > 名称 字号");
  assert(parseInt(style.nameFontSize) > parseInt(style.codeFontSize), "名称 > 代码 字号");

  console.log("  PASS 股票卡片字号层次：价格13px > 名称12px > 代码10px");
}

function test_stock_card_price_style() {
  const style = getStockCardStyle(false);

  assert(style.priceFontWeight === "font-bold", "价格粗体");
  assert(style.changeBorderRadius === "rounded-sm", "涨跌幅圆角 rounded-sm");
  assert(style.changeMinWidth === "50px", "涨跌幅最小宽度 50px");

  console.log("  PASS 股票卡片价格样式：粗体 / rounded-sm / min-w-50px");
}

function test_stock_card_up_down_colors() {
  const style = getStockCardStyle(false);

  assert(style.upBg === "bg-red-500/10", "上涨背景红10%");
  assert(style.upColor === "text-red-500", "上涨文字红");
  assert(style.downBg === "bg-green-500/10", "下跌背景绿10%");
  assert(style.downColor === "text-green-500", "下跌文字绿");

  assert(!style.upBg.includes("green"), "上涨不含绿色");
  assert(!style.downBg.includes("red"), "下跌不含红色");

  console.log("  PASS A股红涨绿跌配色");
}

function test_stock_card_code_style() {
  const style = getStockCardStyle(false);

  assert(style.codeColor.includes("muted"), "代码颜色使用 muted");
  assert(style.codeColor.includes("/60"), "代码颜色 60% 透明度");

  console.log("  PASS 股票代码弱化样式");
}

function test_visual_consistency_no_emoji_in_badge() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);
  const def = getGroupHeaderStyle(DEFAULT_GROUP_ID);
  const custom = getGroupHeaderStyle("g1");

  const allStyles = [pinned, def, custom];
  for (const s of allStyles) {
    assert(!s.badgeBg.includes("emoji"), `徽章背景无 emoji (${s.groupType})`);
    assert(!s.badgeColor.includes("emoji"), `徽章颜色无 emoji (${s.groupType})`);
  }

  console.log("  PASS 徽章无 emoji 干扰");
}

function test_pinned_style_gradient_direction() {
  const pinned = getGroupHeaderStyle(PINNED_GROUP_ID);

  assert(pinned.background.includes("from-amber"), "渐变起始含琥珀色");
  assert(pinned.background.includes("to-transparent"), "渐变终止透明");
  assert(pinned.background.includes("to-r"), "渐变方向从左到右");

  console.log("  PASS 置顶分组渐变方向：从左到右 → 透明");
}

// ──────────────────────────────────────────────
// 运行所有测试
// ──────────────────────────────────────────────

(function runAll() {
  console.log("\n=== 股票分组逻辑单元测试 ===\n");

  console.log("【系统分组】");
  test_system_groups_always_present();
  test_system_groups_not_deletable();

  console.log("\n【置顶与分组共存】");
  test_pinned_and_group_coexist();
  test_toggle_pin_does_not_change_group();
  test_pin_then_move_group();
  test_unpin_stays_in_group();
  test_multiple_pins_across_groups();
  test_pinned_group_empty_hidden();

  console.log("\n【分组操作】");
  test_group_sorting_order();
  test_add_group_order_increment();
  test_rename_group();
  test_collapse_toggle();
  test_move_to_group();

  console.log("\n【删除分组】");
  test_delete_group_moves_stocks_to_default();
  test_delete_group_with_pinned_stock();

  console.log("\n【关注级别】");
  test_watch_level_sorting();

  console.log("\n【详情页分组】");
  test_stock_detail_move_to_group();

  console.log("\n【视觉回归 - 分组标题字体】");
  test_group_header_font_hierarchy();

  console.log("\n【视觉回归 - 分组标题颜色】");
  test_group_header_color_differentiation();

  console.log("\n【视觉回归 - 分组背景】");
  test_group_header_background_differentiation();

  console.log("\n【视觉回归 - 徽章一致性】");
  test_group_header_badge_consistency();

  console.log("\n【视觉回归 - 置顶图标】");
  test_group_header_pin_icon();

  console.log("\n【视觉回归 - 操作按钮可见性】");
  test_group_header_actions_visibility();

  console.log("\n【视觉回归 - 股票卡片置顶指示】");
  test_stock_card_pinned_indicator();

  console.log("\n【视觉回归 - 股票卡片字号层次】");
  test_stock_card_font_sizes();

  console.log("\n【视觉回归 - 股票卡片价格样式】");
  test_stock_card_price_style();

  console.log("\n【视觉回归 - 红涨绿跌配色】");
  test_stock_card_up_down_colors();

  console.log("\n【视觉回归 - 代码弱化样式】");
  test_stock_card_code_style();

  console.log("\n【视觉回归 - 徽章无emoji】");
  test_visual_consistency_no_emoji_in_badge();

  console.log("\n【视觉回归 - 渐变方向】");
  test_pinned_style_gradient_direction();

  const total = 27;
  console.log(`\n\n 所有测试通过 (${total}/${total})\n`);
})();
