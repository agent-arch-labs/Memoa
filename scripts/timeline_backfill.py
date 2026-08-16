#!/usr/bin/env python3
"""
时序图数据批量计算脚本
从本地数据文件读取概念/行业成分股，通过 baostock Python 包获取历史K线，
按市值加权计算板块涨跌幅，结果存入 SQLite 数据库。

用法:
  python3 scripts/timeline_backfill.py              # 默认回填15天概念+行业
  python3 scripts/timeline_backfill.py --days 30     # 回填30天
  python3 scripts/timeline_backfill.py --mode concept # 只回填概念
  python3 scripts/timeline_backfill.py --mode industry # 只回填行业
  python3 scripts/timeline_backfill.py --flush       # 清除已有数据，强制重新计算
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
import time
import warnings
from datetime import datetime, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import baostock as bs
import redis

# --- 配置 ---
REDIS_URL = os.environ.get("MEMOA_REDIS_URL", "redis://:DVADMIN3@127.0.0.1:26379")
DATA_DIR = Path(os.environ.get("MEMOA_DATA_DIR", "/home/zhen/works/Memoa/twine/data"))
DB_PATH = Path(os.environ.get("MEMOA_DB_PATH", os.path.expanduser("~/.local/share/memoa/twine.db")))
SINA_QUOTE_API = "http://hq.sinajs.cn/list="

# 新股上市首日涨幅阈值（超过此值视为新股异常，排除）
IPO_PCT_THRESHOLD = 44.0


class _SuppressStdout:
    def __init__(self):
        self._original = None

    def __enter__(self):
        self._original = sys.stdout
        sys.stdout = open(os.devnull, "w")
        return self

    def __exit__(self, *args):
        sys.stdout.close()
        sys.stdout = self._original


def get_redis():
    return redis.from_url(REDIS_URL, decode_responses=True)


def get_db():
    """获取 SQLite 数据库连接，确保表存在"""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS concept_timeline (
            date TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS industry_timeline (
            date TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    return conn


def db_upsert(db: sqlite3.Connection, table: str, date: str, data_json: str):
    """Upsert 一条时序图数据"""
    db.execute(
        f"INSERT INTO {table} (date, data_json, updated_at) VALUES (?, ?, datetime('now')) "
        f"ON CONFLICT(date) DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')",
        (date, data_json),
    )


def db_list(db: sqlite3.Connection, table: str, days: int) -> list:
    """获取最近 N 天数据"""
    rows = db.execute(
        f"SELECT date, data_json FROM {table} ORDER BY date DESC LIMIT ?", (days,)
    ).fetchall()
    return rows


def load_stock_market_cap_map():
    """从全部股票.csv加载市值映射 code -> market_cap"""
    cap_map = {}
    csv_path = DATA_DIR / "全部股票.csv"
    if not csv_path.exists():
        print(f"[WARN] 文件不存在: {csv_path}")
        return cap_map

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            if len(row) >= 11:
                code = row[6].replace(".XSHE", "").replace(".XSHG", "")
                try:
                    market_cap = float(row[9])
                    if market_cap > 0:
                        cap_map[code] = market_cap
                except (ValueError, IndexError):
                    pass

    print(f"[INFO] 加载了 {len(cap_map)} 只股票的市值数据")
    return cap_map


def load_concepts():
    """从股票概念.json加载概念板块数据"""
    path = DATA_DIR / "股票概念.json"
    if not path.exists():
        print(f"[ERROR] 文件不存在: {path}")
        return []

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"[INFO] 加载了 {len(data)} 个概念板块")
    return data


def load_industries():
    """从证监会行业.json加载行业板块数据"""
    path = DATA_DIR / "证监会行业.json"
    if not path.exists():
        print(f"[ERROR] 文件不存在: {path}")
        return []

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"[INFO] 加载了 {len(data)} 个行业板块")
    return data


def build_baostock_code(code: str) -> str:
    """将纯数字代码转为 baostock 格式: sh.600000 / sz.000001"""
    if code.startswith("6"):
        return f"sh.{code}"
    elif code.startswith("0") or code.startswith("3"):
        return f"sz.{code}"
    elif code.startswith("4") or code.startswith("8"):
        return f"sh.{code}"  # 北交所
    return f"sz.{code}"


def fetch_kline_baostock(code: str, start_date: str, end_date: str) -> list:
    """从 baostock Python 包获取个股日K线数据

    返回: [(date, pctChg, amount), ...]
    pctChg 单位: 百分比（如 4.1 表示涨 4.1%）
    amount 单位: 元
    """
    bs_code = build_baostock_code(code)

    try:
        rs = bs.query_history_k_data_plus(
            code=bs_code,
            fields="date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,isST",
            start_date=start_date,
            end_date=end_date,
            frequency="d",
            adjustflag="3",
        )

        result = []
        while rs.error_code == "0" and rs.next():
            row = rs.get_row_data()
            if len(row) >= 11:
                date = row[0]
                try:
                    amount = float(row[8]) if row[8] else 0.0
                    change_pct = float(row[10]) if row[10] else 0.0  # pctChg 在索引10
                    result.append((date, change_pct, amount))
                except (ValueError, IndexError):
                    pass
        return result
    except Exception as e:
        print(f"  [WARN] baostock 获取 {code}({bs_code}) 失败: {e}")
        return []


def fetch_kline_redis(r: redis.Redis, code: str, start_date: str, end_date: str) -> list:
    """从 Redis 缓存获取K线数据

    Redis 缓存格式: [[date, open, high, low, close, preclose, volume, amount, turn, pctChg, isST], ...]
    pctChg 单位: 百分比（如 4.1 表示涨 4.1%）
    amount 单位: 元
    """
    bs_code = build_baostock_code(code)
    redis_key = f"memoa:kline:{bs_code}"
    cached = r.get(redis_key)
    if not cached:
        return []

    try:
        raw_arr = json.loads(cached)
        result = []
        for row in raw_arr:
            if len(row) < 10:
                continue
            date = row[0]
            if date < start_date or date > end_date:
                continue
            # Redis 中 pctChg 在索引9，单位是百分比
            change_pct = float(row[9]) if row[9] else 0.0
            amount = float(row[7]) if row[7] else 0.0
            result.append((date, change_pct, amount))
        return result
    except Exception:
        return []


def compute_weighted_change(stocks: list) -> tuple:
    """
    计算加权平均涨跌幅
    stocks: [(change_pct, market_cap, amount), ...]
    change_pct 单位: 百分比（如 4.1 表示涨 4.1%）
    返回: (weighted_change_pct, total_amount, up_count, down_count)
    weighted_change_pct 单位也是百分比
    """
    if not stocks:
        return (0.0, 0.0, 0, 0)

    total_cap = sum(cap for _, cap, _ in stocks)
    total_amount = sum(amt for _, _, amt in stocks)
    up_count = sum(1 for c, _, _ in stocks if c > 0)
    down_count = sum(1 for c, _, _ in stocks if c < 0)

    if total_cap > 0:
        weighted_change = sum(c * cap for c, cap, _ in stocks) / total_cap
    else:
        weighted_change = sum(c for c, _, _ in stocks) / len(stocks)

    return (weighted_change, total_amount, up_count, down_count)


def backfill(items: list, item_type: str, days: int, r: redis.Redis, cap_map: dict, db: sqlite3.Connection):
    """
    批量回填时序图数据
    items: 概念或行业列表 [{code, name, subcodes: [str]}, ...]
    item_type: "concept" 或 "industry"
    """
    table_name = f"{item_type}_timeline"

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days + 15)).strftime("%Y-%m-%d")

    # 收集所有股票代码
    all_codes = set()
    for item in items:
        all_codes.update(item.get("subcodes", []))

    print(f"\n[backfill] {item_type}: 需要查询 {len(all_codes)} 只股票")

    # 获取K线数据（先从 Redis 缓存，再从 baostock Python 包）
    kline_map = {}
    cached_count = 0

    for code in all_codes:
        klines = fetch_kline_redis(r, code, start_date, end_date)
        if klines:
            kline_map[code] = klines
            cached_count += 1

    print(f"[backfill] 从 Redis 缓存获取了 {cached_count} 只股票")

    # 对缺失的股票从 baostock Python 包获取
    missing_codes = [c for c in all_codes if c not in kline_map]
    # 限制最多查询800只
    missing_codes = missing_codes[:800]

    if missing_codes:
        print(f"[backfill] 从 baostock 获取 {len(missing_codes)} 只股票...")

        for i, code in enumerate(missing_codes):
            klines = fetch_kline_baostock(code, start_date, end_date)
            if klines:
                kline_map[code] = klines

            if (i + 1) % 50 == 0:
                print(f"  进度: {i + 1}/{len(missing_codes)}")
            time.sleep(0.05)  # 避免请求过快

        print(f"[backfill] baostock 获取完成，共 {len(kline_map)} 只股票有数据")

    # 按板块聚合（加权平均）
    daily_map = {}  # date -> [ConceptBoardItem]

    for item in items:
        date_stocks = {}  # date -> [(change_pct, market_cap, amount)]
        date_leading = {}  # date -> (code, change_pct)

        for code in item.get("subcodes", []):
            cap = cap_map.get(code, 0.0)
            klines = kline_map.get(code, [])
            for date, change_pct, amount in klines:
                # 排除新股上市首日异常涨幅（超过阈值视为新股异常数据）
                if abs(change_pct) > IPO_PCT_THRESHOLD:
                    continue

                if date not in date_stocks:
                    date_stocks[date] = []
                date_stocks[date].append((change_pct, cap, amount))

                if date not in date_leading or change_pct > date_leading[date][1]:
                    date_leading[date] = (code, change_pct)

        for date, stocks in date_stocks.items():
            if not stocks:
                continue

            weighted_change, total_amount, up_count, down_count = compute_weighted_change(stocks)

            if weighted_change <= 0:
                continue

            leading = date_leading.get(date, ("", 0.0))

            board_item = {
                "code": item.get("code", ""),
                "name": item.get("name", ""),
                # pctChg 已经是百分比单位，直接使用
                "changePercent": round(weighted_change * 100) / 100,
                "price": 0.0,
                "upCount": up_count,
                "downCount": down_count,
                "leadingCode": leading[0],
                "leadingName": "",
                "leadingChange": round(leading[1] * 100) / 100,
                "amount": round(total_amount / 1e8 * 100) / 100,
            }

            if date not in daily_map:
                daily_map[date] = []
            daily_map[date].append(board_item)

    # 排序、截断、存入 SQLite
    stored_count = 0
    for date, items_list in daily_map.items():
        items_list.sort(key=lambda x: x["changePercent"], reverse=True)
        items_list = items_list[:7]

        day_data = {
            "date": date,
            "concepts": items_list,
        }

        db_upsert(db, table_name, date, json.dumps(day_data, ensure_ascii=False))
        stored_count += 1

    db.commit()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[backfill] {item_type}: 存储了 {stored_count} 天的数据到 SQLite，更新时间 {now}")


def refresh_today(items: list, item_type: str, r: redis.Redis, cap_map: dict, db: sqlite3.Connection):
    """刷新当天数据（使用新浪行情API）"""
    import urllib.request

    table_name = f"{item_type}_timeline"
    today = datetime.now().strftime("%Y-%m-%d")

    # 收集所有股票代码
    all_codes = set()
    for item in items:
        all_codes.update(item.get("subcodes", []))

    # 构建新浪代码
    sina_codes = []
    for code in all_codes:
        if code.startswith("6"):
            sina_codes.append(f"sh{code}")
        elif code.startswith("0") or code.startswith("3"):
            sina_codes.append(f"sz{code}")
        elif code.startswith("4") or code.startswith("8"):
            sina_codes.append(f"bj{code}")

    # 分批查询新浪行情
    quote_map = {}
    for i in range(0, len(sina_codes), 50):
        chunk = sina_codes[i : i + 50]
        url = SINA_QUOTE_API + ",".join(chunk)

        try:
            req = urllib.request.Request(url, headers={"Referer": "https://finance.sina.com.cn/"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode("gbk", errors="ignore")

            for line in body.strip().split("\n"):
                if '="' not in line:
                    continue
                var_part, data_part = line.split('="', 1)
                sina_code = var_part.split("_")[-1].replace("=", "")
                fields = data_part.rstrip('";').split(",")
                if len(fields) < 32:
                    continue

                pure_code = sina_code[2:]  # 去掉 sh/sz/bj 前缀
                try:
                    price = float(fields[3])
                    prev_close = float(fields[2])
                    change_pct = (price - prev_close) / prev_close * 100 if prev_close > 0 else 0
                    amount = float(fields[9]) if fields[9] else 0.0  # 成交额
                    name = fields[0]
                    quote_map[pure_code] = {
                        "name": name,
                        "change_pct": change_pct,
                        "amount": amount,
                    }
                except (ValueError, IndexError):
                    pass
        except Exception as e:
            print(f"[WARN] 新浪行情请求失败: {e}")

        time.sleep(0.2)

    print(f"[refresh] {item_type}: 获取到 {len(quote_map)} 只股票的实时行情")

    # 按板块聚合（加权平均）
    board_items = []
    for item in items:
        stocks = []
        leading_code = ""
        leading_name = ""
        leading_change = float("-inf")

        for code in item.get("subcodes", []):
            quote = quote_map.get(code)
            if not quote:
                continue
            cap = cap_map.get(code, 0.0)
            change_pct = quote["change_pct"]  # 百分比，如 4.1 表示涨4.1%
            # 排除新股异常
            if abs(change_pct) > IPO_PCT_THRESHOLD:
                continue
            stocks.append((change_pct, cap, quote["amount"]))

            if change_pct > leading_change:
                leading_change = change_pct
                leading_code = code
                leading_name = quote["name"]

        if not stocks:
            continue

        weighted_change, total_amount, up_count, down_count = compute_weighted_change(stocks)

        if weighted_change <= 0:
            continue

        board_items.append({
            "code": item.get("code", ""),
            "name": item.get("name", ""),
            "changePercent": round(weighted_change * 100) / 100,
            "price": 0.0,
            "upCount": up_count,
            "downCount": down_count,
            "leadingCode": leading_code,
            "leadingName": leading_name,
            "leadingChange": round(leading_change * 100) / 100,
            "amount": round(total_amount / 1e8 * 100) / 100,
        })

    # 排序截断
    board_items.sort(key=lambda x: x["changePercent"], reverse=True)
    board_items = board_items[:7]

    day_data = {
        "date": today,
        "concepts": board_items,
    }

    db_upsert(db, table_name, today, json.dumps(day_data, ensure_ascii=False))
    db.commit()

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[refresh] {item_type}: 当天数据已更新，{len(board_items)} 个板块，更新时间 {now}")


def main():
    parser = argparse.ArgumentParser(description="时序图数据批量计算脚本")
    parser.add_argument("--days", type=int, default=15, help="回填天数（默认15）")
    parser.add_argument("--mode", choices=["concept", "industry", "all"], default="all", help="回填模式")
    parser.add_argument("--flush", action="store_true", help="清除已有数据，强制重新计算")
    parser.add_argument("--today-only", action="store_true", help="只刷新当天数据（使用新浪行情）")
    args = parser.parse_args()

    print(f"=== 时序图数据批量计算 ===")
    print(f"数据目录: {DATA_DIR}")
    print(f"数据库: {DB_PATH}")
    print(f"回填天数: {args.days}")
    print(f"模式: {args.mode}")

    r = get_redis()
    db = get_db()
    print(f"Redis 连接: {REDIS_URL.split('@')[-1]}")
    print(f"SQLite 连接成功")

    if args.flush:
        # 清除已有数据
        db.execute("DELETE FROM concept_timeline")
        db.execute("DELETE FROM industry_timeline")
        db.commit()
        print("[INFO] 已清除 SQLite 时序图数据")

    cap_map = load_stock_market_cap_map()

    if args.today_only:
        # 只刷新当天
        if args.mode in ("concept", "all"):
            concepts = load_concepts()
            if concepts:
                refresh_today(concepts, "concept", r, cap_map, db)

        if args.mode in ("industry", "all"):
            industries = load_industries()
            if industries:
                refresh_today(industries, "industry", r, cap_map, db)
    else:
        # 历史回填 - 登录 baostock
        print("[INFO] 登录 baostock...")
        with _SuppressStdout():
            lg = bs.login()
        if lg.error_code != "0":
            print(f"[ERROR] baostock 登录失败: {lg.error_msg}")
            return
        print("[INFO] baostock 登录成功")

        try:
            if args.mode in ("concept", "all"):
                concepts = load_concepts()
                if concepts:
                    backfill(concepts, "concept", args.days, r, cap_map, db)

            if args.mode in ("industry", "all"):
                industries = load_industries()
                if industries:
                    backfill(industries, "industry", args.days, r, cap_map, db)
        finally:
            with _SuppressStdout():
                bs.logout()
            print("[INFO] baostock 已登出")

    db.close()

    print("\n=== 完成 ===")


if __name__ == "__main__":
    main()
