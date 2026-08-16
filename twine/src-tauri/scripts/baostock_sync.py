"""
baostock 股票列表同步脚本 (轻量版，不含K线)

将A股所有股票列表同步到Redis:
  - memoa:stocks       Hash  {code: JSON}  股票列表（代码、名称、类型）
  - memoa:sync:status  Hash  同步状态信息 (含断点续传游标)

K线数据由 daily_kline_sync.py 单独负责，每天增量同步。

用法:
  python3 baostock_sync.py '{"redis_url":"redis://:pass@host:port"}'
  python3 baostock_sync.py '{"redis_url":"redis://:pass@host:port","force":true}'  # 强制全量更新
"""
import sys
import json
import os
import warnings
from datetime import datetime

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import baostock as bs
import redis


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


def get_stock_list():
    """获取全部A股列表 (只返回正常交易的股票)"""
    rs = bs.query_stock_basic()
    rows = []
    while rs.error_code == "0" and rs.next():
        row = rs.get_row_data()
        # type=1 是股票, status=1 是正常交易
        if len(row) >= 6 and row[4] == "1" and row[5] == "1":
            rows.append(row)
    return rows


def is_a_stock(code):
    """判断是否为A股 (排除指数、债券等)"""
    return code.startswith("sh.6") or code.startswith("sz.0") or code.startswith("sz.3")


def sync_stock_list(redis_url, force=False):
    """同步股票列表到Redis (支持断点续传)

    只同步股票基本信息（代码、名称），不同步K线数据。
    K线数据由 daily_kline_sync.py 负责。
    """
    r = redis.Redis.from_url(redis_url, decode_responses=True)

    # 测试连接
    try:
        r.ping()
    except Exception as e:
        return {"error": f"Redis connection failed: {e}"}

    with _SuppressStdout():
        lg = bs.login()
    if lg.error_code != "0":
        return {"error": lg.error_msg}

    try:
        stock_list = get_stock_list()
        a_stocks = [row for row in stock_list if is_a_stock(row[0])]
        total = len(a_stocks)

        # 读取上次断点
        prev_status = r.hgetall("memoa:sync:status")
        last_code = prev_status.get("lastCode", "") if not force else ""
        prev_errors = int(prev_status.get("errors", "0")) if not force else 0

        # 断点续传：找到上次中断位置
        start_index = 0
        if last_code and not force:
            for idx, row in enumerate(a_stocks):
                if row[0] == last_code:
                    start_index = idx + 1
                    break

        is_resume = start_index > 0
        mode_label = "全量" if force else ("续传" if is_resume else "全量")

        # synced 从当前轮次已处理的位置开始计数
        synced = start_index
        skipped = 0
        errors = prev_errors

        # 设置同步状态
        r.hset("memoa:sync:status", mapping={
            "status": "syncing",
            "total": str(total),
            "synced": str(synced),
            "skipped": "0",
            "startTime": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "lastCode": last_code,
            "mode": mode_label,
        })
        pipe = r.pipeline()
        batch_count = 0

        for i in range(start_index, total):
            row = a_stocks[i]
            code = row[0]  # sh.600000
            code_name = row[1] if len(row) > 1 else ""

            try:
                # 检查是否已存在 (非force模式跳过)
                if not force and r.hexists("memoa:stocks", code):
                    skipped += 1
                    synced += 1
                    if (i + 1) % 200 == 0:
                        r.hset("memoa:sync:status", mapping={
                            "synced": str(synced),
                            "skipped": str(skipped),
                            "lastCode": code,
                            "errors": str(errors),
                        })
                    continue

                # 写入股票信息 (HSET天然去重，同code覆盖)
                stock_info = json.dumps({
                    "code": code,
                    "name": code_name,
                }, ensure_ascii=False)

                pipe.hset("memoa:stocks", code, stock_info)

                synced += 1
                batch_count += 1

            except Exception:
                errors += 1

            # 每200只批量提交 + 更新进度游标
            if (i + 1) % 200 == 0:
                pipe.execute()
                pipe = r.pipeline()
                batch_count = 0
                r.hset("memoa:sync:status", mapping={
                    "synced": str(synced),
                    "skipped": str(skipped),
                    "lastCode": code,
                    "errors": str(errors),
                })

        # 提交剩余数据
        if batch_count > 0:
            pipe.execute()

        # 更新同步完成状态
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        r.hset("memoa:sync:status", mapping={
            "status": "done",
            "total": str(total),
            "synced": str(synced),
            "skipped": str(skipped),
            "errors": str(errors),
            "lastCode": "",
            "finishTime": now_str,
            "mode": mode_label,
        })

        return {
            "total": total,
            "synced": synced,
            "skipped": skipped,
            "errors": errors,
            "finishTime": now_str,
            "mode": mode_label,
        }

    finally:
        with _SuppressStdout():
            bs.logout()


def main():
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    redis_url = args.get("redis_url", "redis://:DVADMIN3@127.0.0.1:26379")
    force = args.get("force", False)

    result = sync_stock_list(redis_url, force=force)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
