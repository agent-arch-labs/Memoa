import sys
import json
import os
import warnings
from datetime import datetime

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

import baostock as bs


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


def query_profit(code, year, quarter):
    rs = bs.query_profit_data(code=code, year=year, quarter=quarter)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_growth(code, year, quarter):
    rs = bs.query_growth_data(code=code, year=year, quarter=quarter)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_balance(code, year, quarter):
    rs = bs.query_balance_data(code=code, year=year, quarter=quarter)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_cash_flow(code, year, quarter):
    rs = bs.query_cash_flow_data(code=code, year=year, quarter=quarter)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_dupont(code, year, quarter):
    rs = bs.query_dupont_data(code=code, year=year, quarter=quarter)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_operation(code, year, quarter):
    rs = bs.query_operation_data(code=code, year=year, quarter=quarter)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_express(code, start_date, end_date):
    """季频业绩快报：query_performance_express_report()"""
    rs = bs.query_performance_express_report(code=code, start_date=start_date, end_date=end_date)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


def query_forecast(code, start_date, end_date):
    """季频业绩预告：query_forecast_report()"""
    rs = bs.query_forecast_report(code=code, start_date=start_date, end_date=end_date)
    rows = []
    while rs.error_code == "0" and rs.next():
        rows.append(dict(zip(rs.fields, rs.get_row_data())))
    return rows


# 季报类查询（按 year+quarter）
QUARTERLY_DISPATCH = {
    "profit": query_profit,
    "growth": query_growth,
    "balance": query_balance,
    "cashFlow": query_cash_flow,
    "dupont": query_dupont,
    "operation": query_operation,
}

# 日期范围类查询（按 start_date+end_date）
DATE_RANGE_DISPATCH = {
    "express": query_express,
    "forecast": query_forecast,
}


def get_recent_quarters(n_years=3, annual_only=False):
    now = datetime.now()
    current_year = now.year
    current_month = now.month
    if current_month <= 3:
        latest_quarter = 4
        latest_year = current_year - 1
    elif current_month <= 6:
        latest_quarter = 1
        latest_year = current_year
    elif current_month <= 9:
        latest_quarter = 2
        latest_year = current_year
    else:
        latest_quarter = 3
        latest_year = current_year

    quarters = []
    y, q = latest_year, latest_quarter
    for _ in range(n_years * 4):
        if not annual_only or q == 4:
            quarters.append({"year": y, "quarter": q})
        q -= 1
        if q == 0:
            q = 4
            y -= 1
    return quarters


def get_date_range(n_years=3):
    """返回 n_years 年前的日期到今天的字符串"""
    now = datetime.now()
    start = datetime(now.year - n_years, 1, 1)
    return start.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")


def main():
    args = json.loads(sys.argv[1])
    action = args.get("action", "")
    code = args.get("code", "")
    year = args.get("year", 0)
    quarter = args.get("quarter", 0)
    periods = args.get("periods", None)

    annual_only = args.get("annualOnly", False)

    with _SuppressStdout():
        lg = bs.login()

    if lg.error_code != "0":
        print(json.dumps({"error": lg.error_msg}))
        return

    try:
        if periods is None:
            periods = get_recent_quarters(3, annual_only=annual_only)

        if action == "all":
            result = {}
            # 季报类查询
            for name, fn in QUARTERLY_DISPATCH.items():
                all_rows = []
                for p in periods:
                    rows = fn(code, p["year"], p["quarter"])
                    all_rows.extend(rows)
                result[name] = all_rows
            # 日期范围类查询
            start_date, end_date = get_date_range(3)
            for name, fn in DATE_RANGE_DISPATCH.items():
                rows = fn(code, start_date, end_date)
                result[name] = rows
            print(json.dumps({"data": result}, ensure_ascii=False))
        elif action in QUARTERLY_DISPATCH:
            all_rows = []
            for p in periods:
                rows = QUARTERLY_DISPATCH[action](code, p["year"], p["quarter"])
                all_rows.extend(rows)
            print(json.dumps({"data": all_rows}, ensure_ascii=False))
        elif action in DATE_RANGE_DISPATCH:
            start_date, end_date = get_date_range(3)
            rows = DATE_RANGE_DISPATCH[action](code, start_date, end_date)
            print(json.dumps({"data": rows}, ensure_ascii=False))
        else:
            print(json.dumps({"error": f"unknown action: {action}"}))
    finally:
        with _SuppressStdout():
            bs.logout()


if __name__ == "__main__":
    main()
