"""
选股筛选策略单元测试

测试 limit_up / consecutive_limit / broken_limit 三个策略的核心逻辑，
使用 mock 数据，不依赖 Redis 和 baostock。
"""
import sys
import os
import unittest

# 将 scripts 目录加入 path，以便导入模块
sys.path.insert(0, os.path.dirname(__file__))

from baostock_screener import (
    parse_kline,
    count_consecutive_limit,
    screen_limit_up,
    screen_consecutive_limit,
    screen_broken_limit,
)


class MockRedis:
    """模拟 Redis，用内存字典替代"""

    def __init__(self, stocks=None, klines=None):
        # stocks: {code: json_str}
        self._stocks = stocks or {}
        # klines: {key: json_str}
        self._klines = klines or {}

    def hscan_iter(self, key):
        if key == "memoa:stocks":
            for code, val in self._stocks.items():
                yield code, val

    def get(self, key):
        return self._klines.get(key)

    def hlen(self, key):
        return len(self._stocks)

    def ping(self):
        return True


def make_stock_json(code, name="测试股"):
    import json
    return json.dumps({"code": code, "name": name, "klineCount": 10}, ensure_ascii=False)


def make_kline_json(rows):
    import json
    return json.dumps(rows, ensure_ascii=False)


def make_kline_row(date, open_, high, low, close, preclose, volume, amount, turn, pct_chg, is_st="0"):
    return [date, str(open_), str(high), str(low), str(close),
            str(preclose), str(volume), str(amount), str(turn), str(pct_chg), is_st]


# ---------- 测试数据 ----------

# 涨停股: 涨幅10%，首板
LIMIT_UP_1ST = {
    "code": "sh.600001",
    "name": "涨停首板",
    "kline": [
        make_kline_row("2026-05-25", 10, 10.5, 9.8, 10.2, 10, 100000, 1e8, 1.5, 2.0),
        make_kline_row("2026-05-26", 10.2, 10.8, 10.1, 10.5, 10.2, 120000, 1.2e8, 1.8, 2.9),
        make_kline_row("2026-06-02", 10.5, 11.55, 10.5, 11.55, 10.5, 200000, 2.2e8, 3.0, 10.0),
    ],
}

# 连板股: 连续2日涨停
LIMIT_UP_2ND = {
    "code": "sz.000002",
    "name": "两连板",
    "kline": [
        make_kline_row("2026-05-25", 20, 21, 19.5, 20.5, 20, 80000, 1.6e8, 2.0, 2.5),
        make_kline_row("2026-06-01", 20.5, 22.55, 20.5, 22.55, 20.5, 150000, 3.2e8, 4.0, 10.0),
        make_kline_row("2026-06-02", 22.55, 24.81, 22.55, 24.81, 22.55, 180000, 4.2e8, 5.0, 10.0),
    ],
}

# 三连板股
LIMIT_UP_3RD = {
    "code": "sh.600003",
    "name": "三连板",
    "kline": [
        make_kline_row("2026-05-22", 15, 15.5, 14.8, 15, 14.8, 90000, 1.3e8, 1.2, 1.4),
        make_kline_row("2026-05-29", 15, 16.5, 15, 16.5, 15, 160000, 2.5e8, 3.5, 10.0),
        make_kline_row("2026-05-30", 16.5, 18.15, 16.5, 18.15, 16.5, 170000, 2.9e8, 4.0, 10.0),
        make_kline_row("2026-06-02", 18.15, 19.97, 18.15, 19.97, 18.15, 190000, 3.6e8, 4.5, 10.0),
    ],
}

# ST涨停股: 涨幅5%
ST_LIMIT_UP = {
    "code": "sh.600004",
    "name": "*ST测试",
    "kline": [
        make_kline_row("2026-05-25", 5, 5.2, 4.9, 5.1, 5, 50000, 2.5e7, 1.0, 2.0, "1"),
        make_kline_row("2026-06-02", 5.1, 5.36, 5.1, 5.36, 5.1, 80000, 4e7, 1.5, 5.1, "1"),
    ],
}

# 炸板股: 最高价触及涨停但收盘未封住
BROKEN_LIMIT = {
    "code": "sz.000005",
    "name": "炸板股",
    "kline": [
        make_kline_row("2026-05-25", 8, 8.5, 7.8, 8.2, 8, 70000, 5.6e7, 2.0, 2.5),
        # preclose=8.2, 涨停价=9.02, high=9.05触及, close=8.8未封住, pctChg=7.3%
        make_kline_row("2026-06-02", 8.2, 9.05, 8.5, 8.8, 8.2, 200000, 1.7e8, 5.0, 7.3),
    ],
}

# 普通股: 涨幅2%，不满足任何策略
NORMAL_STOCK = {
    "code": "sh.600006",
    "name": "普通股",
    "kline": [
        make_kline_row("2026-05-25", 30, 30.5, 29.5, 30, 30, 110000, 3.3e8, 1.0, 0.0),
        make_kline_row("2026-06-02", 30, 30.8, 29.8, 30.6, 30, 115000, 3.5e8, 1.1, 2.0),
    ],
}


def build_mock_redis(*stock_defs):
    """根据股票定义构建 MockRedis"""
    stocks = {}
    klines = {}
    for s in stock_defs:
        code = s["code"]
        stocks[code] = make_stock_json(code, s["name"])
        klines[f"memoa:kline:{code}"] = make_kline_json(s["kline"])
    return MockRedis(stocks=stocks, klines=klines)


# ---------- 测试类 ----------

class TestParseKline(unittest.TestCase):
    """测试K线数据解析"""

    def test_normal_parse(self):
        rows = [make_kline_row("2026-06-02", 10, 11, 9.5, 10.5, 10, 100000, 1e8, 2.5, 5.0)]
        result = parse_kline(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["date"], "2026-06-02")
        self.assertAlmostEqual(result[0]["close"], 10.5)
        self.assertAlmostEqual(result[0]["pctChg"], 5.0)
        self.assertFalse(result[0]["isST"])

    def test_st_parse(self):
        rows = [make_kline_row("2026-06-02", 5, 5.3, 4.9, 5.2, 5, 50000, 2.5e7, 1.0, 4.0, "1")]
        result = parse_kline(rows)
        self.assertTrue(result[0]["isST"])

    def test_empty_values(self):
        rows = [["2026-06-02", "", "", "", "", "", "", "", "", "", "0"]]
        result = parse_kline(rows)
        self.assertEqual(len(result), 1)
        self.assertAlmostEqual(result[0]["close"], 0)

    def test_invalid_row_skipped(self):
        rows = [["only_one_field"]]
        result = parse_kline(rows)
        self.assertEqual(len(result), 0)


class TestCountConsecutiveLimit(unittest.TestCase):
    """测试连板天数计算"""

    def test_no_limit(self):
        kline = parse_kline([
            make_kline_row("2026-06-01", 10, 10.5, 9.5, 10.2, 10, 100000, 1e8, 1.5, 2.0),
            make_kline_row("2026-06-02", 10.2, 10.8, 10, 10.5, 10.2, 110000, 1.1e8, 1.6, 2.9),
        ])
        self.assertEqual(count_consecutive_limit(kline), 0)

    def test_one_limit(self):
        kline = parse_kline([
            make_kline_row("2026-06-01", 10, 10.5, 9.5, 10.2, 10, 100000, 1e8, 1.5, 2.0),
            make_kline_row("2026-06-02", 10.2, 11.22, 10.2, 11.22, 10.2, 200000, 2.2e8, 3.0, 10.0),
        ])
        self.assertEqual(count_consecutive_limit(kline), 1)

    def test_three_consecutive(self):
        kline = parse_kline([
            make_kline_row("2026-05-28", 10, 10.5, 9.5, 10.2, 10, 100000, 1e8, 1.5, 2.0),
            make_kline_row("2026-05-29", 10.2, 11.22, 10.2, 11.22, 10.2, 200000, 2.2e8, 3.0, 10.0),
            make_kline_row("2026-05-30", 11.22, 12.34, 11.22, 12.34, 11.22, 220000, 2.7e8, 3.2, 10.0),
            make_kline_row("2026-06-02", 12.34, 13.57, 12.34, 13.57, 12.34, 250000, 3.3e8, 3.5, 10.0),
        ])
        self.assertEqual(count_consecutive_limit(kline), 3)

    def test_st_limit(self):
        kline = parse_kline([
            make_kline_row("2026-06-01", 5, 5.2, 4.9, 5.1, 5, 50000, 2.5e7, 1.0, 2.0, "1"),
            make_kline_row("2026-06-02", 5.1, 5.36, 5.1, 5.36, 5.1, 80000, 4e7, 1.5, 5.1, "1"),
        ])
        self.assertEqual(count_consecutive_limit(kline), 1)

    def test_middle_break(self):
        """中间有非涨停日，只计最近连续段"""
        kline = parse_kline([
            make_kline_row("2026-05-27", 10, 11, 10, 11, 10, 200000, 2.2e8, 3.0, 10.0),
            make_kline_row("2026-05-28", 11, 11.5, 10.5, 11.2, 11, 150000, 1.6e8, 2.0, 1.8),
            make_kline_row("2026-05-29", 11.2, 12.32, 11.2, 12.32, 11.2, 220000, 2.7e8, 3.5, 10.0),
        ])
        self.assertEqual(count_consecutive_limit(kline), 1)


class TestScreenLimitUp(unittest.TestCase):
    """测试涨停筛选"""

    def test_finds_limit_up(self):
        r = build_mock_redis(LIMIT_UP_1ST, NORMAL_STOCK)
        result = screen_limit_up(r, limit=50)
        codes = [s["code"] for s in result["data"]]
        self.assertIn("sh.600001", codes)
        self.assertNotIn("sh.600006", codes)

    def test_includes_consecutive_days(self):
        r = build_mock_redis(LIMIT_UP_2ND)
        result = screen_limit_up(r, limit=50)
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["limitUpDays"], 2)

    def test_st_stock_threshold(self):
        """ST股5%即涨停"""
        r = build_mock_redis(ST_LIMIT_UP)
        result = screen_limit_up(r, limit=50)
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["code"], "sh.600004")

    def test_normal_stock_below_threshold(self):
        """涨幅2%不算涨停"""
        r = build_mock_redis(NORMAL_STOCK)
        result = screen_limit_up(r, limit=50)
        self.assertEqual(len(result["data"]), 0)

    def test_sorted_by_limit_days(self):
        """连板数多的排前面"""
        r = build_mock_redis(LIMIT_UP_1ST, LIMIT_UP_2ND, LIMIT_UP_3RD)
        result = screen_limit_up(r, limit=50)
        days = [s["limitUpDays"] for s in result["data"]]
        self.assertEqual(days, sorted(days, reverse=True))

    def test_name_included(self):
        r = build_mock_redis(LIMIT_UP_1ST)
        result = screen_limit_up(r, limit=50)
        self.assertEqual(result["data"][0]["name"], "涨停首板")

    def test_is_st_field(self):
        """isST字段正确返回"""
        r = build_mock_redis(LIMIT_UP_1ST, ST_LIMIT_UP)
        result = screen_limit_up(r, limit=50)
        by_code = {s["code"]: s for s in result["data"]}
        self.assertFalse(by_code["sh.600001"]["isST"])
        self.assertTrue(by_code["sh.600004"]["isST"])


class TestScreenConsecutiveLimit(unittest.TestCase):
    """测试连板筛选"""

    def test_requires_min_2_days(self):
        """首板不算连板"""
        r = build_mock_redis(LIMIT_UP_1ST)
        result = screen_consecutive_limit(r, min_days=2, limit=50)
        self.assertEqual(len(result["data"]), 0)

    def test_finds_2_consecutive(self):
        r = build_mock_redis(LIMIT_UP_2ND)
        result = screen_consecutive_limit(r, min_days=2, limit=50)
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["limitUpDays"], 2)

    def test_finds_3_consecutive(self):
        r = build_mock_redis(LIMIT_UP_3RD)
        result = screen_consecutive_limit(r, min_days=2, limit=50)
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["limitUpDays"], 3)

    def test_mixed_stocks(self):
        """只有连板股入选"""
        r = build_mock_redis(LIMIT_UP_1ST, LIMIT_UP_2ND, LIMIT_UP_3RD, NORMAL_STOCK)
        result = screen_consecutive_limit(r, min_days=2, limit=50)
        codes = [s["code"] for s in result["data"]]
        self.assertIn("sz.000002", codes)
        self.assertIn("sh.600003", codes)
        self.assertNotIn("sh.600001", codes)
        self.assertNotIn("sh.600006", codes)

    def test_sorted_by_limit_days(self):
        r = build_mock_redis(LIMIT_UP_2ND, LIMIT_UP_3RD)
        result = screen_consecutive_limit(r, min_days=2, limit=50)
        days = [s["limitUpDays"] for s in result["data"]]
        self.assertEqual(days, sorted(days, reverse=True))


class TestScreenBrokenLimit(unittest.TestCase):
    """测试炸板筛选"""

    def test_finds_broken_limit(self):
        r = build_mock_redis(BROKEN_LIMIT)
        result = screen_broken_limit(r, limit=50)
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["code"], "sz.000005")

    def test_limit_price_calculated(self):
        """涨停价 = preclose * 1.1"""
        r = build_mock_redis(BROKEN_LIMIT)
        result = screen_broken_limit(r, limit=50)
        # preclose=8.2, limit_price=8.2*1.1=9.02
        self.assertAlmostEqual(result["data"][0]["limitPrice"], 9.02, places=2)

    def test_normal_stock_not_broken(self):
        """普通股不满足炸板条件"""
        r = build_mock_redis(NORMAL_STOCK)
        result = screen_broken_limit(r, limit=50)
        self.assertEqual(len(result["data"]), 0)

    def test_real_limit_up_not_broken(self):
        """真正涨停的不算炸板"""
        r = build_mock_redis(LIMIT_UP_1ST)
        result = screen_broken_limit(r, limit=50)
        self.assertEqual(len(result["data"]), 0)

    def test_st_broken_limit(self):
        """ST股涨停价=preclose*1.05"""
        st_broken = {
            "code": "sh.600007",
            "name": "*ST炸板",
            "kline": [
                make_kline_row("2026-05-25", 4, 4.2, 3.9, 4.1, 4, 40000, 1.6e7, 1.0, 2.5, "1"),
                # preclose=4.1, ST涨停价=4.1*1.05=4.305, high=4.31触及, close=4.2未封住, pctChg=2.4%
                make_kline_row("2026-06-02", 4.1, 4.31, 4.0, 4.2, 4.1, 60000, 2.5e7, 1.5, 2.4, "1"),
            ],
        }
        r = build_mock_redis(st_broken)
        result = screen_broken_limit(r, limit=50)
        self.assertEqual(len(result["data"]), 1)
        self.assertAlmostEqual(result["data"][0]["limitPrice"], 4.305, places=2)

    def test_mixed_stocks(self):
        """只有炸板股入选"""
        r = build_mock_redis(BROKEN_LIMIT, LIMIT_UP_1ST, NORMAL_STOCK)
        result = screen_broken_limit(r, limit=50)
        codes = [s["code"] for s in result["data"]]
        self.assertIn("sz.000005", codes)
        self.assertNotIn("sh.600001", codes)
        self.assertNotIn("sh.600006", codes)


if __name__ == "__main__":
    unittest.main()
