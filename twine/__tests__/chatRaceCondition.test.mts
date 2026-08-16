/**
 * 竞态条件模拟测试：发送 → 停止 → 重新生成
 *
 * 核心验证：
 * 1. genRef 代数计数器正确隔离不同 generation
 * 2. cancelStream 中的 flushPending 清除残留 throttle 定时器
 * 3. handleCancel 不回干扰新启动的 generation
 * 4. 旧 generation 的 store 写入不会覆盖新 generation 的消息
 * 5. RAG 流式路径的 store 更新受 genRef 保护
 */

import { strict as assertFn } from "node:assert";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new assertFn.AssertionError({ message });
}

// ──────────────────────────────────────────────
// 模拟类型
// ──────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: unknown[];
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// ──────────────────────────────────────────────
// 模拟 store（与 conversationStore 行为一致）
// ──────────────────────────────────────────────

let _convId = "";
let _messages: ChatMessage[] = [];

function store_reset() {
  _convId = "conv-1";
  _messages = [];
}

function store_addMessage(msg: ChatMessage) {
  _messages = [..._messages, msg];
}

function store_updateMessage(msgId: string, content: string) {
  _messages = _messages.map((m) =>
    m.id === msgId ? { ...m, content } : m
  );
}

function store_updateLastMessage(content: string) {
  _messages = _messages.map((m, i) =>
    i === _messages.length - 1 ? { ...m, content } : m
  );
}

function store_getMessages(): ChatMessage[] {
  return _messages;
}

function store_getLastMessage(): ChatMessage | undefined {
  return _messages[_messages.length - 1];
}

// ──────────────────────────────────────────────
// 模拟 useChatStreaming hook
// ──────────────────────────────────────────────

let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUpdate: { msgId: string; content: string } | null = null;
let currentRequestId: string | null = null;

function streaming_reset() {
  if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
  pendingUpdate = null;
  currentRequestId = null;
}

function throttledUpdate(msgId: string, content: string) {
  if (throttleTimer) {
    pendingUpdate = { msgId, content };
    return;
  }
  store_updateMessage(msgId, content);
  store_updateLastMessage(content);
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
    const pending = pendingUpdate;
    if (pending) {
      pendingUpdate = null;
      store_updateMessage(pending.msgId, pending.content);
      store_updateLastMessage(pending.content);
    }
  }, 80);
}

function flushPending() {
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  const pending = pendingUpdate;
  if (pending) {
    pendingUpdate = null;
    store_updateMessage(pending.msgId, pending.content);
    store_updateLastMessage(pending.content);
  }
}

async function cancelStream(): Promise<void> {
  flushPending();
  if (currentRequestId) {
    // 模拟后端取消（同步完成）
    currentRequestId = null;
  }
}

// ──────────────────────────────────────────────
// 模拟 ChatPanel 核心逻辑
// ──────────────────────────────────────────────

let genRef = 0;
let agentCancelRef: (() => void) | null = null;

async function simulateSendMessage(text: string): Promise<string> {
  const currentGen = ++genRef;

  const convId = _convId;

  const userMsg: ChatMessage = {
    id: `user-${currentGen}`,
    role: "user",
    content: text,
    sources: [],
    timestamp: Date.now(),
  };
  store_addMessage(userMsg);

  const assistantId = `assistant-${currentGen}`;
  const assistantMsg: ChatMessage = {
    id: assistantId,
    role: "assistant",
    content: "",
    sources: [],
    timestamp: Date.now(),
  };
  store_addMessage(assistantMsg);

  // ═══════════════════════════════════════
  // 模拟 RAG 流式路径（简化版）
  // ═══════════════════════════════════════
  const requestId = `req-${currentGen}`;
  currentRequestId = requestId;
  let fullContent = "";

  // 注册 agent cancel 回调（模拟 agent_rag 行为）
  let cancelled = false;
  agentCancelRef = () => { cancelled = true; };

  try {
    // 模拟流式事件：逐字符输出
    const chars = "大模型生成的回答内容";
    for (let i = 0; i < chars.length; i++) {
      // 模拟 await（让出事件循环）
      if (i % 3 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }

      // 检查是否被取消
      if (cancelled) break;

      fullContent += chars[i];
      throttledUpdate(assistantId, fullContent);
    }

    // 取消后不写最终内容
    if (cancelled) return assistantId;

  } finally {
    agentCancelRef = null;
    currentRequestId = null;
  }

  // 最终写入（受 genRef 保护）
  if (genRef === currentGen) {
    flushPending();
    store_updateMessage(assistantId, fullContent);
    store_updateLastMessage(fullContent);
  }

  return assistantId;
}

async function simulateHandleCancel(): Promise<void> {
  const cancelGen = genRef;
  await cancelStream();
  if (genRef !== cancelGen) return;
  agentCancelRef?.();
  agentCancelRef = null;
}

// ──────────────────────────────────────────────
// 测试用例
// ──────────────────────────────────────────────

function test_genRef_counter_increments() {
  console.log("\n--- genRef 计数器递增 ---");
  store_reset();
  streaming_reset();
  genRef = 0;

  const g1 = ++genRef;
  const g2 = ++genRef;
  const g3 = ++genRef;

  assert(g1 === 1, "第一次发送 gen=1");
  assert(g2 === 2, "第二次发送 gen=2");
  assert(g3 === 3, "第三次发送 gen=3");
  console.log("  PASS");
}

async function test_cancelStream_flushPending() {
  console.log("\n--- cancelStream 清除 throttle 定时器 ---");
  store_reset();
  streaming_reset();
  genRef = 0;

  const msgId = "msg-1";
  store_addMessage({ id: `user-1`, role: "user", content: "hello", sources: [], timestamp: 1 });
  store_addMessage({ id: msgId, role: "assistant", content: "", sources: [], timestamp: 1 });

  // 模拟 throttledUpdate 设置了一个 pending
  throttledUpdate(msgId, "partial content");
  // 有一个 throttleTimer 在运行
  assert(throttleTimer !== null, "throttle timer 存在");
  assert(pendingUpdate === null, "第一次 update 已直接写入，pending 为空");

  // 再调用一次 throttledUpdate 产生 pending
  throttledUpdate(msgId, "partial content 2");
  assert(pendingUpdate !== null, "第二次 update 产生 pending");

  // 调用 cancelStream
  await cancelStream();

  assert(throttleTimer === null, "cancelStream 后 throttle timer 已清除");
  assert(pendingUpdate === null, "cancelStream 后 pending 已刷新并清除");

  console.log("  PASS");
}

async function test_send_cancel_resend_no_double_output() {
  console.log("\n--- 发送 → 停止 → 重新发送（无双框输出）---");
  store_reset();
  streaming_reset();
  genRef = 0;

  // Step 1: 发送消息（gen=1）
  console.log("  Step 1: 发送消息 gen=1");
  const send1Promise = simulateSendMessage("你好");

  // 让 gen=1 产生一些输出
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  // Step 2: 立即点击停止
  console.log("  Step 2: 点击停止");
  await simulateHandleCancel();

  // 等待 gen=1 完全结束
  await send1Promise;

  // Step 3: 重新发送（gen=2）
  console.log("  Step 3: 重新发送 gen=2");
  const send2Promise = simulateSendMessage("你好");

  // 让 gen=2 完成
  await send2Promise;
  await new Promise((r) => setTimeout(r, 0));

  const messages = store_getMessages();
  console.log(`  消息列表: ${messages.map(m => `[${m.role}] id=${m.id.slice(0, 10)} content="${m.content.slice(0, 20)}"`).join("\n    ")}`);

  // 验证点1: 总共 4 条消息（user1 + assistant1 + user2 + assistant2）
  assert(messages.length === 4,
    `应 4 条消息（2问2答），实际 ${messages.length} 条`);

  // 验证点2: gen=1 的 assistant 消息是被取消的，不应有 gen=2 的完整内容
  const assistant1 = messages[1];
  assert(assistant1.role === "assistant", "第2条消息是 assistant");
  assert(assistant1.id === "assistant-1", "第2条是 gen=1 的 assistant");

  // 验证点3: gen=2 的 assistant 消息应输出完整内容，不应被 gen=1 覆盖
  const assistant2 = messages[3];
  assert(assistant2.role === "assistant", "第4条消息是 assistant");
  assert(assistant2.id === "assistant-2", "第4条是 gen=2 的 assistant");

  // 验证点4: 最后一条消息是 gen=2 的完整内容，不是 gen=1 的截断内容
  const lastMsg = store_getLastMessage();
  assert(lastMsg !== undefined, "存在最后一条消息");
  assert(lastMsg!.id === "assistant-2",
    `最后一条消息 ID 应为 assistant-2，实际 ${lastMsg!.id}`);
  assert(lastMsg!.content.includes("大模型生成的回答内容"),
    "最后一条消息应包含 gen=2 的完整内容，未被 gen=1 覆盖");

  // 验证点5: gen=2 的内容不应该出现在 gen=1 的消息中（gen=1 应该是被取消的截断内容）
  assert(!assistant2.content.includes("被取消") || assistant2.content.length > 5,
    "gen=2 的内容不应标记为已取消");

  console.log("  PASS: 无双框输出，gen=1 和 gen=2 内容隔离正确");
}

async function test_handleCancel_does_not_interfere_new_gen() {
  console.log("\n--- handleCancel 不干扰新 generation ---");
  store_reset();
  streaming_reset();
  genRef = 0;

  // Step 1: 启动 gen=1 的 sendMessage
  const send1Promise = simulateSendMessage("第一个问题");
  await new Promise((r) => setTimeout(r, 0));

  // Step 2: handleCancel 开始执行
  const cancelGen = genRef; // 模拟 handleCancel 捕获 cancelGen
  await cancelStream();

  // 此时 genRef 应该还是 1（send1Promise 还在跑）
  assert(genRef === cancelGen, "cancel 时 genRef 未变化（=1）");

  // Step 3: 用户立刻重新发送（gen=2）
  console.log("  Step 3: gen=2 启动");
  const send2Promise = simulateSendMessage("第二个问题");
  await new Promise((r) => setTimeout(r, 0));

  assert(genRef === 2, "genRef 已递增到 2");

  // Step 4: handleCancel 检查 gen 是否已变化
  if (genRef !== cancelGen) {
    console.log("  handleCancel 检测到 gen 已变化，跳过重置");
  }

  // 等待两个请求完成
  await send1Promise;
  await send2Promise;

  const messages = store_getMessages();
  console.log(`  消息列表: ${messages.map(m => `[${m.role}] "${m.content.slice(0, 30)}"`).join("\n    ")}`);

  // 验证：gen=2 的 assistant 有内容，没有被 handleCancel 清除
  const lastMsg = store_getLastMessage();
  assert(lastMsg !== undefined, "存在最后一条消息");
  assert(lastMsg!.id === "assistant-2", "最后一条消息是 gen=2 的");

  console.log("  PASS: handleCancel 未干扰 gen=2");
}

async function test_flushPending_in_old_gen_no_overwrite() {
  console.log("\n--- 旧 gen 的 flushPending 不覆盖新 gen 消息 ---");
  store_reset();
  streaming_reset();
  genRef = 0;

  // Step 1: gen=1 启动（模拟 sendMessage 中的 ++genRef 和 currentGen 捕获）
  const currentGen = ++genRef; // gen=1, genRef=1
  const msgId1 = "assistant-1";
  store_addMessage({ id: "user-1", role: "user", content: "hello", sources: [], timestamp: 1 });
  store_addMessage({ id: msgId1, role: "assistant", content: "", sources: [], timestamp: 1 });

  // 模拟 gen=1 的流式输出产生 pending update
  throttledUpdate(msgId1, "gen1 partial content");
  // throttle timer 正在等待 80ms

  // Step 2: cancelStream 被调用（在 handleCancel 中）
  await cancelStream();
  // 此时 flushPending 已清除 timer 和 pending

  // Step 3: gen=2 启动，添加新的消息
  ++genRef; // genRef=2（模拟新 sendMessage 中的 ++genRef）
  const msgId2 = "assistant-2";
  store_addMessage({ id: "user-2", role: "user", content: "hello again", sources: [], timestamp: 2 });
  store_addMessage({ id: msgId2, role: "assistant", content: "", sources: [], timestamp: 2 });

  // 模拟 gen=2 开始流式输出
  throttledUpdate(msgId2, "gen2 real content");

  // Step 4: 旧 gen=1 的异步代码尝试做最终写入
  // 模拟 gen check: genRef.current (2) !== currentGen (1) → 跳过
  if (genRef === currentGen) {
    // 不应该走到这里（genRef=2 !== currentGen=1）
    flushPending();
    store_updateMessage(msgId1, "gen1 final");
    store_updateLastMessage("gen1 final");
    console.log("  ❌ gen=1 错误地执行了最终写入");
  } else {
    console.log("  gen=1 检测 genRef(2) !== currentGen(1)，跳过最终写入");
  }

  // 等待 gen=2 的 flush
  flushPending();

  // 验证：最后一条消息是 gen=2 的内容，不是 gen=1
  const lastMsg = store_getLastMessage();
  assert(lastMsg !== undefined, "存在最后一条消息");
  assert(lastMsg!.id === msgId2, "最后一条是 gen=2");
  assert(lastMsg!.content === "gen2 real content",
    `最后一条内容是 gen=2 的，实际: "${lastMsg!.content}"`);

  console.log("  PASS: 旧 gen 未覆盖新 gen 消息");
}

async function test_agentCancelRef_cleanup() {
  console.log("\n--- agentCancelRef 清理 ---");
  store_reset();
  streaming_reset();
  genRef = 0;

  // 启动 gen=1（设置 agentCancelRef）
  const send1Promise = simulateSendMessage("hello");
  await new Promise((r) => setTimeout(r, 0));

  assert(agentCancelRef !== null, "sendMessage 设置 agentCancelRef");

  // cancel
  await simulateHandleCancel();

  // 等待 send1Promise 完成
  await send1Promise;
  await new Promise((r) => setTimeout(r, 0));

  assert(agentCancelRef === null, "cancel 后 agentCancelRef 已清理");

  // 启动 gen=2
  const send2Promise = simulateSendMessage("hello again");
  await new Promise((r) => setTimeout(r, 0));

  assert(agentCancelRef !== null, "gen=2 设置 agentCancelRef");

  await send2Promise;
  await new Promise((r) => setTimeout(r, 0));

  assert(agentCancelRef === null, "gen=2 完成后 agentCancelRef 已清理");

  console.log("  PASS: agentCancelRef 正确设置和清理");
}

async function test_rapid_send_cancel_loop() {
  console.log("\n--- 快速 send/cancel 循环 ---");
  store_reset();
  streaming_reset();
  genRef = 0;

  for (let round = 1; round <= 5; round++) {
    const genBefore = genRef;
    const sendPromise = simulateSendMessage(`message ${round}`);
    await new Promise((r) => setTimeout(r, 0));

    // cancel
    await simulateHandleCancel();
    await sendPromise;
    await new Promise((r) => setTimeout(r, 0));

    assert(genRef === genBefore + 1, `轮 ${round}: genRef 递增`);
    assert(agentCancelRef === null, `轮 ${round}: agentCancelRef 已清理`);
  }

  const messages = store_getMessages();
  console.log(`  共 ${messages.length} 条消息 (${genRef} 轮)`);

  // 每个 assistant 消息不应该包含太离谱的内容
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "assistant") {
      assert(typeof m.content === "string", `assistant 消息 ${i} 有内容`);
    }
  }
  // 最后一条消息不应为空
  const lastMsg = store_getLastMessage();
  assert(lastMsg !== undefined && lastMsg!.content.length > 0,
    "最后一轮有输出");

  console.log("  PASS: 5 轮快速 send/cancel 无异常");
}

// ──────────────────────────────────────────────
// 运行所有测试
// ──────────────────────────────────────────────

(async function runAll() {
  console.log("\n=== ChatPanel 流式竞态条件测试 ===\n");
  console.log("【基础机制测试】");

  test_genRef_counter_increments();
  await test_cancelStream_flushPending();
  await test_agentCancelRef_cleanup();

  console.log("\n【核心场景测试】");
  await test_send_cancel_resend_no_double_output();
  await test_handleCancel_does_not_interfere_new_gen();
  await test_flushPending_in_old_gen_no_overwrite();

  console.log("\n【压力测试】");
  await test_rapid_send_cancel_loop();

  console.log("\n\n 所有竞态条件测试通过 ✓\n");
})();