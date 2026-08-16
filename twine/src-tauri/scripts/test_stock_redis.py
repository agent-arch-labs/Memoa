"""
验证股票详情和K线数据的 Redis 读写

测试内容:
  1. 模拟 Rust 后端写入 stock_info / kline 数据到 Redis
  2. 验证数据格式与 Rust 解析逻辑一致
  3. 读取已有数据并校验完整性

用法:
  python3 scripts/test_stock_redis.py
  python3 scripts/test_stock_redis.py '{"redis_url":"redis://:pass@host:port"}'
"""
import sys
import json
import redis

DEFAULT_REDIS_URL = "redis://:DVADMIN3@127.0.0.1:26379"

# 使用测试专用前缀，避免污染真实数据
TEST_PREFIX = "memoa:test:"

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
WARN = "\033[93mWARN\033[0m"


def test_redis_connection(r):
    """测试 Redis 连接"""
    try:
        pong = r.ping()
        assert pong is True, "PING 未返回 True"
        print(f"  [{PASS}] Redis PONG")
        return True
    except Exception as e:
        print(f"  [{FAIL}] Redis 连接失败: {e}")
        return False


def test_stock_info_write_read(r):
    """测试 stock_info 写入和读取（模拟 Rust east_stock_info 的行为）"""
    key = f"{TEST_PREFIX}stock_info:sh.600519"

    # 模拟 Rust 写入的 EastStockInfo JSON
    stock_info = {
        "code": "600519",
        "name": "贵州茅台",
        "industry": "食品饮料-白酒Ⅱ-白酒Ⅲ",
        "region": "贵州板块",
        "concepts": ["白酒", "超级品牌", "央国企改革", "电商概念", "西部大开发"],
    }
    json_str = json.dumps(stock_info, ensure_ascii=False)

    # 写入（TTL 60s）
    r.setex(key, 60, json_str)
    print(f"  [{PASS}] 写入 stock_info: {key}")

    # 读取
    cached = r.get(key)
    assert cached is not None, f"读取 {key} 返回 None"
    parsed = json.loads(cached)

    # 校验字段
    assert parsed["code"] == "600519", f"code 不匹配: {parsed['code']}"
    assert parsed["name"] == "贵州茅台", f"name 不匹配: {parsed['name']}"
    assert parsed["industry"] == "食品饮料-白酒Ⅱ-白酒Ⅲ", f"industry 不匹配: {parsed['industry']}"
    assert parsed["region"] == "贵州板块", f"region 不匹配: {parsed['region']}"
    assert len(parsed["concepts"]) == 5, f"concepts 长度不匹配: {len(parsed['concepts'])}"
    assert "白酒" in parsed["concepts"], "concepts 缺少 '白酒'"
    print(f"  [{PASS}] 读取 stock_info: code={parsed['code']}, name={parsed['name']}")
    print(f"         industry={parsed['industry']}")
    print(f"         region={parsed['region']}")
    print(f"         concepts={parsed['concepts']}")

    # 清理
    r.delete(key)
    print(f"  [{PASS}] 清理测试数据: {key}")
    return True


def test_kline_write_read(r):
    """测试 kline 写入和读取（模拟 Rust baostock_query_kline 的行为）"""
    key = f"{TEST_PREFIX}kline:sh.600519"

    # 模拟 Rust 写入的紧凑格式: [[date, open, high, low, close, preclose, volume, amount, turn, pctChg, isST], ...]
    kline_data = [
        ["2026-05-28", 1800.5, 1820.0, 1790.0, 1812.5, 1795.0, 32567.0, 5890123456.0, 2.59, 0.975, "0"],
        ["2026-05-29", 1812.0, 1830.0, 1805.0, 1825.0, 1812.5, 28900.0, 5234567890.0, 2.30, 0.689, "0"],
        ["2026-05-30", 1825.0, 1840.0, 1818.0, 1835.0, 1825.0, 31000.0, 5678901234.0, 2.48, 0.548, "0"],
        ["2026-06-02", 1835.0, 1850.0, 1820.0, 1842.0, 1835.0, 27500.0, 5012345678.0, 2.20, 0.381, "0"],
    ]
    json_str = json.dumps(kline_data, ensure_ascii=False)

    # 写入
    r.set(key, json_str)
    print(f"  [{PASS}] 写入 kline: {key} ({len(kline_data)} 条)")

    # 读取
    cached = r.get(key)
    assert cached is not None, f"读取 {key} 返回 None"
    parsed = json.loads(cached)

    # 校验格式: Vec<Vec<serde_json::Value>>
    assert isinstance(parsed, list), "kline 数据不是数组"
    assert len(parsed) == 4, f"kline 数据条数不匹配: {len(parsed)}"

    # 校验每条数据的字段数和格式（与 Rust 解析逻辑一致）
    for i, row in enumerate(parsed):
        assert len(row) >= 11, f"第 {i} 行字段数不足: {len(row)}"
        assert isinstance(row[0], str), f"第 {i} 行 date 不是字符串"
        assert row[10] in ("0", "1"), f"第 {i} 行 isST 值异常: {row[10]}"

    # 模拟 Rust 的日期范围过滤: 2026-05-29 ~ 2026-05-30 (2条)
    start_date = "2026-05-29"
    end_date = "2026-05-30"
    filtered = [row for row in parsed if start_date <= row[0] <= end_date]
    assert len(filtered) == 2, f"日期过滤后条数不匹配: {len(filtered)} (期望 2)"
    print(f"  [{PASS}] 读取 kline: {len(parsed)} 条, 过滤 {start_date}~{end_date}: {len(filtered)} 条")

    # 打印第一条详情
    r0 = parsed[0]
    print(f"         首条: date={r0[0]}, open={r0[1]}, close={r0[4]}, volume={r0[7]}")

    # 清理
    r.delete(key)
    print(f"  [{PASS}] 清理测试数据: {key}")
    return True


def test_kline_gap_detection(r):
    """测试 K线缺失检测逻辑（模拟 daily_kline_sync 的连贯性校验）"""
    key = f"{TEST_PREFIX}kline:sz.000001"

    # 构造有缺失的K线数据（缺少 05-29）
    kline_data = [
        ["2026-05-28", 10.0, 10.5, 9.8, 10.2, 10.0, 1000.0, 10000.0, 1.5, 2.0, "0"],
        ["2026-05-30", 10.2, 10.8, 10.0, 10.6, 10.2, 1200.0, 12000.0, 1.8, 3.9, "0"],
        ["2026-06-02", 10.6, 11.0, 10.5, 10.8, 10.6, 800.0, 8000.0, 1.2, 1.9, "0"],
    ]
    r.set(key, json.dumps(kline_data, ensure_ascii=False))

    # 模拟缺失检测
    cached = r.get(key)
    parsed = json.loads(cached)
    existing_dates = [row[0] for row in parsed]

    # 假设交易日列表包含 05-29
    trading_dates = ["2026-05-28", "2026-05-29", "2026-05-30", "2026-06-02"]
    gaps = [d for d in trading_dates if d not in existing_dates]

    assert len(gaps) == 1, f"缺失检测不正确: {gaps}"
    assert gaps[0] == "2026-05-29", f"缺失日期不正确: {gaps[0]}"
    print(f"  [{PASS}] 缺失检测: 发现 {len(gaps)} 个缺失交易日: {gaps}")

    # 模拟补齐：合并新数据
    backfill_data = [
        ["2026-05-29", 10.2, 10.5, 10.0, 10.3, 10.2, 900.0, 9000.0, 1.3, 0.98, "0"],
    ]
    existing_map = {row[0]: row for row in parsed}
    for row in backfill_data:
        existing_map[row[0]] = row
    merged = sorted(existing_map.values(), key=lambda x: x[0])

    assert len(merged) == 4, f"合并后条数不匹配: {len(merged)}"
    assert merged[1][0] == "2026-05-29", "合并后顺序不正确"
    print(f"  [{PASS}] 缺失补齐: 合并后 {len(merged)} 条，日期连续")

    # 清理
    r.delete(key)
    print(f"  [{PASS}] 清理测试数据: {key}")
    return True


def test_existing_data(r):
    """检查已有的 Redis 数据"""
    # 检查 memoa:stocks
    stock_count = r.hlen("memoa:stocks")
    if stock_count > 0:
        print(f"  [{PASS}] memoa:stocks 已有 {stock_count} 只股票")
        sample_code = r.hkeys("memoa:stocks")[0]
        sample_info = json.loads(r.hget("memoa:stocks", sample_code))
        print(f"         样本: {sample_code} -> {sample_info.get('name', 'N/A')}")
    else:
        print(f"  [{WARN}] memoa:stocks 为空，请先运行 baostock_sync")

    # 检查 memoa:kline
    cursor, keys = r.scan(0, match="memoa:kline:*", count=10)
    kline_count = len(keys)
    while cursor != 0:
        cursor, more_keys = r.scan(cursor, match="memoa:kline:*", count=100)
        kline_count += len(more_keys)
    if kline_count > 0:
        print(f"  [{PASS}] memoa:kline:* 已有 {kline_count} 只股票的K线数据")
        sample_key = keys[0] if keys else None
        if sample_key:
            sample_data = json.loads(r.get(sample_key))
            print(f"         样本: {sample_key} -> {len(sample_data)} 条K线")
    else:
        print(f"  [{WARN}] memoa:kline:* 为空，请先运行 baostock_sync")

    # 检查 memoa:stock_info
    cursor = 0
    info_keys = []
    while True:
        cursor, more_keys = r.scan(cursor, match="memoa:stock_info:*", count=100)
        info_keys.extend(more_keys)
        if cursor == 0:
            break
    info_count = len(info_keys)
    if info_count > 0:
        print(f"  [{PASS}] memoa:stock_info:* 已有 {info_count} 条缓存")
        sample_key = info_keys[0]
        sample_data = json.loads(r.get(sample_key))
        print(f"         样本: {sample_key}")
        print(f"           name={sample_data.get('name', 'N/A')}")
        print(f"           industry={sample_data.get('industry', 'N/A')}")
        print(f"           region={sample_data.get('region', 'N/A')}")
        print(f"           concepts={sample_data.get('concepts', [])}")
    else:
        print(f"  [{WARN}] memoa:stock_info:* 为空（首次访问股票详情后自动写入）")

    # 检查 daily_sync 状态
    daily_status = r.hgetall("memoa:daily_sync:status")
    if daily_status:
        print(f"  [{PASS}] memoa:daily_sync:status:")
        print(f"           status={daily_status.get('status', 'N/A')}")
        print(f"           synced={daily_status.get('synced', 'N/A')}/{daily_status.get('total', 'N/A')}")
        print(f"           gaps={daily_status.get('gaps', 'N/A')}, backfilled={daily_status.get('backfilled', 'N/A')}")
        print(f"           lastSyncDate={daily_status.get('lastSyncDate', 'N/A')}")
    else:
        print(f"  [{WARN}] memoa:daily_sync:status 为空（未运行过每日同步）")

    return True


def test_stock_info_compatibility_with_sync(r):
    """测试 stock_info 与 baostock_sync 数据的兼容性"""
    stock_count = r.hlen("memoa:stocks")
    if stock_count == 0:
        print(f"  [{WARN}] 跳过兼容性测试（memoa:stocks 为空）")
        return True

    sample_code = r.hkeys("memoa:stocks")[0]
    stock_data = json.loads(r.hget("memoa:stocks", sample_code))
    print(f"  memoa:stocks 样本: code={sample_code}, name={stock_data.get('name', 'N/A')}")

    info_key = f"memoa:stock_info:{sample_code}"
    info_data = r.get(info_key)
    if info_data:
        info = json.loads(info_data)
        print(f"  [{PASS}] 关联 stock_info 存在: name={info.get('name', 'N/A')}, industry={info.get('industry', 'N/A')}")
    else:
        print(f"  [{WARN}] 关联 stock_info 不存在（首次访问后自动创建）")

    kline_key = f"memoa:kline:{sample_code}"
    kline_data = r.get(kline_key)
    if kline_data:
        kline = json.loads(kline_data)
        print(f"  [{PASS}] 关联 kline 存在: {len(kline)} 条")
        # 校验K线数据格式与 Rust 解析兼容
        if kline:
            r0 = kline[0]
            assert isinstance(r0, list), "K线首条不是数组"
            assert len(r0) >= 11, f"K线首条字段数不足: {len(r0)}"
            assert isinstance(r0[0], str), f"K线 date 不是字符串: {type(r0[0])}"
            print(f"         首条: date={r0[0]}, open={r0[1]}, close={r0[4]}")
    else:
        print(f"  [{WARN}] 关联 kline 不存在")

    return True


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    redis_url = args.get("redis_url", DEFAULT_REDIS_URL)

    print("=" * 60)
    print("股票数据 Redis 读写验证")
    print("=" * 60)
    print(f"Redis URL: {redis_url}\n")

    r = redis.Redis.from_url(redis_url, decode_responses=True)

    results = []

    print("[1] Redis 连接测试")
    results.append(test_redis_connection(r))
    print()

    if not results[0]:
        print("Redis 连接失败，终止测试")
        sys.exit(1)

    print("[2] stock_info 写入/读取测试")
    results.append(test_stock_info_write_read(r))
    print()

    print("[3] kline 写入/读取测试")
    results.append(test_kline_write_read(r))
    print()

    print("[4] kline 缺失检测/补齐测试")
    results.append(test_kline_gap_detection(r))
    print()

    print("[5] 已有数据检查")
    results.append(test_existing_data(r))
    print()

    print("[6] 数据兼容性测试")
    results.append(test_stock_info_compatibility_with_sync(r))
    print()

    passed = sum(1 for r in results if r)
    total = len(results)
    print("=" * 60)
    print(f"测试结果: {passed}/{total} 通过")
    print("=" * 60)

    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
