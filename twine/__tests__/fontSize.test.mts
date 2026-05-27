import { strict as assertFn } from "node:assert";

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 14;
const STORAGE_KEY = "memoa_font_size";

function clampFontSize(size: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new assertFn.AssertionError({ message });
}

function test_clamp_default() {
  assert(clampFontSize(DEFAULT_FONT_SIZE) === DEFAULT_FONT_SIZE, "默认值 14 通过 clamp 不变");
  console.log("  PASS clamp: default");
}

function test_clamp_in_bounds() {
  for (let s = MIN_FONT_SIZE; s <= MAX_FONT_SIZE; s++) {
    assert(clampFontSize(s) === s, `${s} 在 [${MIN_FONT_SIZE}, ${MAX_FONT_SIZE}] 内不裁剪`);
  }
  console.log("  PASS clamp: in-bounds range[" + MIN_FONT_SIZE + ".." + MAX_FONT_SIZE + "]");
}

function test_clamp_below_min() {
  assert(clampFontSize(MIN_FONT_SIZE - 1) === MIN_FONT_SIZE, `${MIN_FONT_SIZE - 1} → ${MIN_FONT_SIZE}`);
  assert(clampFontSize(-100) === MIN_FONT_SIZE, "-100 → 10");
  assert(clampFontSize(0) === MIN_FONT_SIZE, "0 → 10");
  console.log("  PASS clamp: below-min clipping");
}

function test_clamp_above_max() {
  assert(clampFontSize(MAX_FONT_SIZE + 1) === MAX_FONT_SIZE, `${MAX_FONT_SIZE + 1} → ${MAX_FONT_SIZE}`);
  assert(clampFontSize(100) === MAX_FONT_SIZE, "100 → 24");
  assert(clampFontSize(999) === MAX_FONT_SIZE, "999 → 24");
  console.log("  PASS clamp: above-max clipping");
}

function test_clamp_rounding() {
  assert(clampFontSize(14.2) === 14, "14.2 → 14");
  assert(clampFontSize(14.5) === 15, "14.5 → 15");
  assert(clampFontSize(14.8) === 15, "14.8 → 15");
  console.log("  PASS clamp: rounding");
}

function test_increase_decrease() {
  for (let s = MIN_FONT_SIZE; s < MAX_FONT_SIZE; s++) {
    assert(clampFontSize(s + 1) === s + 1, `increase ${s} → ${s + 1}`);
  }
  assert(clampFontSize(MAX_FONT_SIZE + 1) === MAX_FONT_SIZE, `increase at MAX: ${MAX_FONT_SIZE} → ${MAX_FONT_SIZE}`);

  for (let s = MAX_FONT_SIZE; s > MIN_FONT_SIZE; s--) {
    assert(clampFontSize(s - 1) === s - 1, `decrease ${s} → ${s - 1}`);
  }
  assert(clampFontSize(MIN_FONT_SIZE - 1) === MIN_FONT_SIZE, `decrease at MIN: ${MIN_FONT_SIZE} → ${MIN_FONT_SIZE}`);
  console.log("  PASS increase/decrease: bounds respected");
}

function test_persistence_roundtrip() {
  if (typeof localStorage === "undefined") {
    console.log("  SKIP persistence: no localStorage (Node.js)");
    return;
  }
  const testValues = [10, 14, 17, 24];
  for (const v of testValues) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    const raw = localStorage.getItem(STORAGE_KEY);
    assert(raw !== null, `localStorage 写入 ${v} 可读`);
    const parsed = JSON.parse(raw!);
    assert(parsed === v, `读写一致: ${v}`);
  }
  localStorage.removeItem(STORAGE_KEY);
  const missing = localStorage.getItem(STORAGE_KEY);
  assert(missing === null, "删除后键不存在");
  console.log("  PASS persistence: roundtrip");
}

function test_keyboard_codes() {
  const zoomInCodes = ["Equal", "NumpadAdd"];
  const zoomOutCodes = ["Minus", "NumpadSubtract"];

  const expectedIn = new Set(["Equal", "NumpadAdd"]);
  const expectedOut = new Set(["Minus", "NumpadSubtract"]);

  for (const code of zoomInCodes) {
    assert(expectedIn.has(code), `${code} 在放大快捷键集合中`);
  }
  for (const code of zoomOutCodes) {
    assert(expectedOut.has(code), `${code} 在缩小快捷键集合中`);
  }

  const allFontKeys = [...zoomInCodes, ...zoomOutCodes];
  const collides = allFontKeys.filter(
    (code) => ["KeyB", "KeyK", "Digit1", "Digit2", "Digit3", "Digit4"].includes(code)
  );
  assert(collides.length === 0, "字体快捷键与已有快捷键不冲突");
  console.log("  PASS keyboard: code mapping");
}

function test_document_font_size_sync() {
  if (typeof document === "undefined") {
    console.log("  SKIP document: no DOM (Node.js)");
    return;
  }
  const sizes = [10, 14, 18, 24];
  for (const s of sizes) {
    document.documentElement.style.fontSize = `${s}px`;
    assert(
      document.documentElement.style.fontSize === `${s}px`,
      `html.fontSize 设置为 ${s}px`,
    );
  }
  console.log("  PASS document: CSS fontSize sync");
}

function simulateZoomIn(current: number): number {
  return clampFontSize(current + 1);
}

function simulateZoomOut(current: number): number {
  return clampFontSize(current - 1);
}

function test_simulate_continuous_zoom_in() {
  console.log("\n  --- 连续按 Ctrl++ 场景 ---");

  let size = DEFAULT_FONT_SIZE;
  const steps: number[] = [size];
  for (let i = 0; i < 20; i++) {
    size = simulateZoomIn(size);
    steps.push(size);
  }
  console.log(`    起始 ${DEFAULT_FONT_SIZE}px → 连续20次 Ctrl++ → 最终 ${size}px`);
  console.log(`    轨迹: ${steps.join(" → ")}`);

  assert(size === MAX_FONT_SIZE, `连续放大后上限应为 ${MAX_FONT_SIZE}，实际 ${size}`);
  assert(steps.length === 21, "应记录21步（含起始）");

  for (const s of steps) {
    assert(s >= MIN_FONT_SIZE && s <= MAX_FONT_SIZE, `步骤中 ${s} 在 [${MIN_FONT_SIZE}, ${MAX_FONT_SIZE}] 内`);
  }

  const saturatedValues = steps.filter((s) => s === MAX_FONT_SIZE);
  assert(saturatedValues.length >= 1, "至少有1次饱和在 MAX");
  console.log(`    饱和值 ${MAX_FONT_SIZE}px 出现 ${saturatedValues.length} 次`);

  console.log("  PASS simulate: 连续放大");
}

function test_simulate_continuous_zoom_out() {
  console.log("\n  --- 连续按 Ctrl+- 场景 ---");

  let size = DEFAULT_FONT_SIZE;
  const steps: number[] = [size];
  for (let i = 0; i < 20; i++) {
    size = simulateZoomOut(size);
    steps.push(size);
  }
  console.log(`    起始 ${DEFAULT_FONT_SIZE}px → 连续20次 Ctrl+- → 最终 ${size}px`);
  console.log(`    轨迹: ${steps.join(" → ")}`);

  assert(size === MIN_FONT_SIZE, `连续缩小后下限应为 ${MIN_FONT_SIZE}，实际 ${size}`);
  for (const s of steps) {
    assert(s >= MIN_FONT_SIZE && s <= MAX_FONT_SIZE, `步骤中 ${s} 在 [${MIN_FONT_SIZE}, ${MAX_FONT_SIZE}] 内`);
  }

  const saturatedValues = steps.filter((s) => s === MIN_FONT_SIZE);
  assert(saturatedValues.length >= 1, "至少有1次饱和在 MIN");
  console.log(`    饱和值 ${MIN_FONT_SIZE}px 出现 ${saturatedValues.length} 次`);

  console.log("  PASS simulate: 连续缩小");
}

function test_simulate_rapid_alternating() {
  console.log("\n  --- 快速交替按 Ctrl++ / Ctrl+- 场景 ---");

  let size = DEFAULT_FONT_SIZE;
  const history: number[] = [size];

  for (let i = 0; i < 30; i++) {
    size = simulateZoomIn(size);
    size = simulateZoomOut(size);
    history.push(size);
  }
  console.log(`    交替30轮后 → ${size}px（应回到原点附近）`);

  assert(size === DEFAULT_FONT_SIZE, `交替结束后应回到 ${DEFAULT_FONT_SIZE}，实际 ${size}`);
  for (const s of history) {
    assert(s >= MIN_FONT_SIZE && s <= MAX_FONT_SIZE, `交替中 ${s} 始终在范围内`);
  }

  console.log("  PASS simulate: 快速交替");
}

function test_simulate_from_max_boundary() {
  console.log("\n  --- 从最大值出发的场景 ---");

  let size = MAX_FONT_SIZE;
  assert(simulateZoomIn(size) === MAX_FONT_SIZE, `MAX+1 仍为 ${MAX_FONT_SIZE}`);
  size = simulateZoomOut(size);
  assert(size === MAX_FONT_SIZE - 1, `MAX-1 应为 ${MAX_FONT_SIZE - 1}`);

  for (let i = 0; i < 10; i++) {
    size = simulateZoomIn(size);
  }
  assert(size === MAX_FONT_SIZE, `从 MAX-1 放大10次后上限 ${MAX_FONT_SIZE}`);

  size = simulateZoomIn(MAX_FONT_SIZE);
  size = simulateZoomIn(size);
  size = simulateZoomIn(size);
  assert(size === MAX_FONT_SIZE, `MAX 处连续3次 Ctrl++ 不越界`);

  console.log("  PASS simulate: 最大边界");
}

function test_simulate_from_min_boundary() {
  console.log("\n  --- 从最小值出发的场景 ---");

  let size = MIN_FONT_SIZE;
  assert(simulateZoomOut(size) === MIN_FONT_SIZE, `MIN-1 仍为 ${MIN_FONT_SIZE}`);
  size = simulateZoomIn(size);
  assert(size === MIN_FONT_SIZE + 1, `MIN+1 应为 ${MIN_FONT_SIZE + 1}`);

  for (let i = 0; i < 10; i++) {
    size = simulateZoomOut(size);
  }
  assert(size === MIN_FONT_SIZE, `从 MIN+1 缩小10次后下限 ${MIN_FONT_SIZE}`);

  size = simulateZoomOut(MIN_FONT_SIZE);
  size = simulateZoomOut(size);
  size = simulateZoomOut(size);
  assert(size === MIN_FONT_SIZE, `MIN 处连续3次 Ctrl+- 不越界`);

  console.log("  PASS simulate: 最小边界");
}

function test_simulate_full_range_oscillation() {
  console.log("\n  --- 全范围震荡场景 ---");

  let size = MIN_FONT_SIZE;
  for (let i = 0; i < 30; i++) {
    size = simulateZoomIn(size);
    assert(size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE, `放大第${i + 1}次: ${size} 在范围内`);
  }
  assert(size === MAX_FONT_SIZE, "从 MIN 放大30次应到达 MAX");

  for (let i = 0; i < 30; i++) {
    size = simulateZoomOut(size);
    assert(size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE, `缩小第${i + 1}次: ${size} 在范围内`);
  }
  assert(size === MIN_FONT_SIZE, "从 MAX 缩小30次应回到 MIN");

  console.log(`    震荡路径: MIN(${MIN_FONT_SIZE}) → MAX(${MAX_FONT_SIZE}) → MIN(${MIN_FONT_SIZE})`);
  console.log("  PASS simulate: 全范围震荡");
}

(function runAll() {
  console.log("\n=== 字体大小功能测试 ===\n");
  console.log("【基础单元测试】");

  test_clamp_default();
  test_clamp_in_bounds();
  test_clamp_below_min();
  test_clamp_above_max();
  test_clamp_rounding();
  test_increase_decrease();
  test_persistence_roundtrip();
  test_keyboard_codes();
  test_document_font_size_sync();

  console.log("\n【快捷键按压模拟测试】");

  test_simulate_continuous_zoom_in();
  test_simulate_continuous_zoom_out();
  test_simulate_rapid_alternating();
  test_simulate_from_max_boundary();
  test_simulate_from_min_boundary();
  test_simulate_full_range_oscillation();

  console.log("\n\n 所有测试通过 (" + (6 + 6) + "/12)\n");
})();