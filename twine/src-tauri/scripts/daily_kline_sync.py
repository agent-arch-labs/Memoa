"""
每日K线增量同步脚本

功能:
  1. 增量同步：只获取昨日交易数据，追加到已有K线末尾
  2. 连贯性校验：检测K线数据是否有缺失交易日
  3. 缺失补齐：发现缺失时，从缺失日期起重新拉取数据
  4. 窗口维护：保持最近 kline_days 个交易日，自动淘汰过期数据

Redis 数据格式:
  memoa:kline:{code}  -> [[date, open, high, low, close, preclose, volume, amount, turn, pctChg, isST], ...]
  memoa:daily_sync:status -> Hash { lastSyncDate, synced, gaps, backfilled, errors }

用法:
  python3 daily_kline_sync.py '{"redis_url":"redis://:pass@host:port"}'
  python3 daily_kline_sync.py '{"redis_url":"redis://:pass@host:port","kline_days":120}'
  python3 daily_kline_sync.py '{"redis_url":"redis://:pass@host:port","check_gaps":true}'
"""
import sys
import json
import os
import signal
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import baostock as bs
import redis


DEFAULT_REDIS_URL = "redis://:DVADMIN3@127.0.0.1:26379"
DEFAULT_KLINE_DAYS = 120
LOGIN_TIMEOUT = 30  # baostock 登录超时秒数


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


class _LoginTimeout(Exception):
    pass


def _login_alarm_handler(signum, frame):
    raise _LoginTimeout("baostock login timed out")


def baostock_login_with_timeout(timeout=LOGIN_TIMEOUT):
    """带超时的 baostock 登录，防止网络问题导致无限挂起"""
    old_handler = signal.signal(signal.SIGALRM, _login_alarm_handler)
    signal.alarm(timeout)
    try:
        with _SuppressStdout():
            lg = bs.login()
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
    return lg


def fetch_kline(code, start_date, end_date):
    """从 baostock 获取K线数据"""
    rs = bs.query_history_k_data_plus(
        code=code,
        fields="date,code,open,high,low,close,preclose,volume,amount,turn,pctChg,isST",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="3",
    )
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(rs.get_row_data())
    return rows


def row_to_compact(row):
    """baostock 行数据 -> 紧凑格式"""
    try:
        return [
            row[0],   # date
            row[2],   # open
            row[3],   # high
            row[4],   # low
            row[5],   # close
            row[6],   # preclose
            row[7],   # volume
            row[8],   # amount
            row[9],   # turn
            row[10],  # pctChg
            row[11] if len(row) > 11 else "0",  # isST
        ]
    except (ValueError, IndexError):
        return None


def get_trading_dates(start_date, end_date):
    """获取交易日列表（使用上证指数作为参考）"""
    rs = bs.query_history_k_data_plus(
        code="sh.000001",
        fields="date",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="3",
    )
    dates = []
    while rs.error_code == "0" and rs.next():
        row = rs.get_row_data()
        if row and row[0]:
            dates.append(row[0])
    return dates


def get_trading_dates_batch(start_date, end_date, cache):
    """获取交易日列表（带缓存，避免重复查询 baostock）

    cache: dict，跨多次调用复用。交易日是全市场统一的，只需查一次覆盖最大范围即可。
    """
    # 用更大的范围查一次，后续所有股票复用
    cache_key = "all"
    if cache_key not in cache:
        dates = get_trading_dates(start_date, end_date)
        cache[cache_key] = set(dates)
    # 按当前股票的实际范围过滤
    return [d for d in sorted(cache[cache_key]) if start_date <= d <= end_date]


def find_gaps(existing_dates, trading_dates):
    """找出已有K线中缺失的交易日"""
    existing_set = set(existing_dates)
    gaps = [d for d in trading_dates if d not in existing_set]
    return gaps


def sync_daily_kline(redis_url, kline_days=DEFAULT_KLINE_DAYS, check_gaps=True):
    """每日K线增量同步

    逻辑:
      1. 遍历 memoa:stocks 中所有股票
      2. 读取已有K线，找到最后一条日期
      3. 从最后日期+1到昨天，获取增量数据追加
      4. 如果 check_gaps=true，校验连贯性，发现缺失则补齐
      5. 保持窗口大小为 kline_days，淘汰过期数据
    """
    r = redis.Redis.from_url(redis_url, decode_responses=True)

    def set_error_status(msg):
        """出错时更新 Redis 状态为 error，避免前端永远卡在 syncing/connecting"""
        try:
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            r.hset("memoa:daily_sync:status", mapping={
                "status": "error",
                "finishTime": now_str,
                "errors": "1",
            })
        except Exception:
            pass

    try:
        r.ping()
    except Exception as e:
        return {"error": f"Redis connection failed: {e}"}

    # 先设 connecting 状态，让前端知道正在连接 baostock
    try:
        r.hset("memoa:daily_sync:status", mapping={
            "status": "connecting",
            "synced": "0",
            "gaps": "0",
            "backfilled": "0",
            "errors": "0",
            "startTime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
    except Exception:
        pass

    # 带超时的 baostock 登录
    try:
        lg = baostock_login_with_timeout()
    except _LoginTimeout:
        set_error_status("baostock login timed out")
        return {"error": "baostock login timed out (30s)"}
    except Exception as e:
        set_error_status(f"baostock login failed: {e}")
        return {"error": f"baostock login failed: {e}"}

    if lg.error_code != "0":
        set_error_status(lg.error_msg)
        return {"error": lg.error_msg}

    try:
        # 获取所有股票代码
        all_stocks = r.hgetall("memoa:stocks")
        if not all_stocks:
            set_error_status("No stocks found in Redis")
            return {"error": "No stocks found in Redis, run baostock_sync first"}

        total = len(all_stocks)
        synced = 0
        gap_count = 0
        backfilled = 0
        errors = 0
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

        # 更新同步状态
        r.hset("memoa:daily_sync:status", mapping={
            "status": "connecting",
            "total": str(total),
            "synced": "0",
            "gaps": "0",
            "backfilled": "0",
            "errors": "0",
            "startTime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })

        # 预取全市场交易日（只需一次），覆盖 kline_days*2 天的范围，供 gap 检测复用
        trading_dates_cache = {}
        if check_gaps:
            pre_start = (datetime.now() - timedelta(days=kline_days * 2 + 30)).strftime("%Y-%m-%d")
            get_trading_dates_batch(pre_start, today, trading_dates_cache)

        # 切换为 syncing 状态
        r.hset("memoa:daily_sync:status", mapping={
            "status": "syncing",
        })

        for i, (code, stock_json) in enumerate(all_stocks.items()):
            try:
                kline_key = f"memoa:kline:{code}"
                cached = r.get(kline_key)

                if not cached:
                    # 没有K线数据，全量拉取最近 kline_days 天
                    start = (datetime.now() - timedelta(days=kline_days * 2)).strftime("%Y-%m-%d")
                    rows = fetch_kline(code, start, today)
                    compact = [row_to_compact(row) for row in rows]
                    compact = [c for c in compact if c is not None]
                    compact = compact[-kline_days:]
                    if compact:
                        r.set(kline_key, json.dumps(compact, ensure_ascii=False))
                    synced += 1
                    continue

                # 解析已有K线
                existing = json.loads(cached)
                if not existing or not isinstance(existing, list):
                    synced += 1
                    continue

                last_date = existing[-1][0]  # 最后一条日期

                # === 1. 增量同步：获取 last_date+1 到昨天的数据 ===
                next_day = (datetime.strptime(last_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                if next_day <= yesterday:
                    rows = fetch_kline(code, next_day, yesterday)
                    new_data = [row_to_compact(row) for row in rows]
                    new_data = [c for c in new_data if c is not None]
                    if new_data:
                        existing.extend(new_data)
                        # 保持窗口大小
                        existing = existing[-kline_days:]
                        r.set(kline_key, json.dumps(existing, ensure_ascii=False))

                # === 2. 连贯性校验 + 缺失补齐（使用缓存的交易日，不再逐股查 baostock）===
                if check_gaps:
                    existing_dates = [row[0] for row in existing]
                    first_date = existing_dates[0]
                    last_date = existing_dates[-1]

                    # 用缓存的交易日集合做过滤，不重复调 baostock
                    trading_dates = get_trading_dates_batch(first_date, last_date, trading_dates_cache)

                    if trading_dates:
                        gaps = find_gaps(existing_dates, trading_dates)
                        if gaps:
                            gap_count += len(gaps)
                            # 发现缺失，从第一个缺失日期到昨天重新拉取
                            gap_start = gaps[0]
                            gap_end = yesterday

                            rows = fetch_kline(code, gap_start, gap_end)
                            new_data = [row_to_compact(row) for row in rows]
                            new_data = [c for c in new_data if c is not None]

                            if new_data:
                                # 合并：用日期去重，保持有序
                                existing_map = {row[0]: row for row in existing}
                                for row in new_data:
                                    existing_map[row[0]] = row
                                merged = sorted(existing_map.values(), key=lambda x: x[0])
                                merged = merged[-kline_days:]
                                r.set(kline_key, json.dumps(merged, ensure_ascii=False))
                                backfilled += len(gaps)

                synced += 1

            except Exception as e:
                errors += 1

            # 每50只更新进度
            if (i + 1) % 50 == 0:
                r.hset("memoa:daily_sync:status", mapping={
                    "synced": str(synced),
                    "gaps": str(gap_count),
                    "backfilled": str(backfilled),
                    "errors": str(errors),
                })

        # 更新完成状态
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        r.hset("memoa:daily_sync:status", mapping={
            "status": "done",
            "total": str(total),
            "synced": str(synced),
            "gaps": str(gap_count),
            "backfilled": str(backfilled),
            "errors": str(errors),
            "lastSyncDate": yesterday,
            "finishTime": now_str,
        })

        return {
            "total": total,
            "synced": synced,
            "gaps": gap_count,
            "backfilled": backfilled,
            "errors": errors,
            "lastSyncDate": yesterday,
            "finishTime": now_str,
        }

    except Exception as e:
        set_error_status(str(e))
        return {"error": str(e)}

    finally:
        with _SuppressStdout():
            try:
                bs.logout()
            except Exception:
                pass


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    redis_url = args.get("redis_url", DEFAULT_REDIS_URL)
    kline_days = args.get("kline_days", DEFAULT_KLINE_DAYS)
    check_gaps = args.get("check_gaps", True)

    result = sync_daily_kline(redis_url, kline_days=kline_days, check_gaps=check_gaps)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
