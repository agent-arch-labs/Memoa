"""
缺失K线数据补取脚本

功能:
  接收一组股票代码列表，使用 baostock Python SDK 获取K线数据，
  存入 Redis，并返回获取结果。

用法:
  python3 kline_fetch_missing.py '{"redis_url":"redis://:pass@host:port","codes":["sh.600519","sz.000001"],"start_date":"2026-04-23","end_date":"2026-06-07","kline_days":120}'
"""
import sys
import json
import os
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import baostock as bs
import redis


DEFAULT_REDIS_URL = "redis://:DVADMIN3@127.0.0.1:26379"
DEFAULT_KLINE_DAYS = 120


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


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    redis_url = args.get("redis_url", DEFAULT_REDIS_URL)
    codes = args.get("codes", [])
    start_date = args.get("start_date", "")
    end_date = args.get("end_date", datetime.now().strftime("%Y-%m-%d"))
    kline_days = args.get("kline_days", DEFAULT_KLINE_DAYS)

    if not codes:
        print(json.dumps({"fetched": 0, "failed": 0, "errors": []}, ensure_ascii=False))
        return

    r = redis.Redis.from_url(redis_url, decode_responses=True)

    try:
        r.ping()
    except Exception as e:
        print(json.dumps({"fetched": 0, "failed": len(codes), "errors": [f"Redis connection failed: {e}"]}, ensure_ascii=False))
        return

    with _SuppressStdout():
        lg = bs.login()
    if lg.error_code != "0":
        print(json.dumps({"fetched": 0, "failed": len(codes), "errors": [f"baostock login failed: {lg.error_msg}"]}, ensure_ascii=False))
        return

    fetched = 0
    failed = 0
    errors = []

    try:
        for code in codes:
            try:
                # 如果 Redis 已有数据，跳过
                kline_key = f"memoa:kline:{code}"
                cached = r.get(kline_key)
                if cached:
                    existing = json.loads(cached)
                    if existing and len(existing) > 0:
                        fetched += 1
                        continue

                # 使用 baostock SDK 获取K线
                if not start_date:
                    sd = (datetime.now() - timedelta(days=kline_days * 2)).strftime("%Y-%m-%d")
                else:
                    sd = start_date

                rows = fetch_kline(code, sd, end_date)
                compact = [row_to_compact(row) for row in rows]
                compact = [c for c in compact if c is not None]
                compact = compact[-kline_days:]

                if compact:
                    r.set(kline_key, json.dumps(compact, ensure_ascii=False))
                    fetched += 1
                else:
                    failed += 1
                    errors.append(f"{code}: no data returned")

            except Exception as e:
                failed += 1
                errors.append(f"{code}: {str(e)}")

    finally:
        with _SuppressStdout():
            bs.logout()

    result = {
        "fetched": fetched,
        "failed": failed,
        "errors": errors[:20],  # 最多返回20条错误
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
