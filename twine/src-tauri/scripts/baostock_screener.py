"""
baostock 选股筛选脚本 (从Redis读取数据，零延迟)

支持14种筛选策略:
  1. new_high         - 历史新高个股 (收盘价创N日新高)
  2. top_gain_5d      - 最近5日涨幅排行
  3. top_gain_10d     - 最近10日涨幅排行
  4. volume_breakout  - 放量突破个股 (成交量>5日均量2倍 且 涨幅>3%)
  5. limit_up         - 昨日涨停个股 (涨幅>=9.8%)
  6. consecutive_limit - 昨日连板个股 (连续N日涨停)
  7. broken_limit     - 昨日炸板个股 (曾触及涨停但未封住)
  8. ma_bullish       - 均线多头排列 (MA5>MA10>MA20>MA60)
  9. ma_cross_up      - MA金叉 (MA5上穿MA10)
  10. macd_cross_up   - MACD金叉 (DIF上穿DEA)
  11. kdj_golden      - KDJ金叉 (K上穿D)
  12. rsi_oversold    - RSI超卖回升 (RSI从<30回升至>30)
  13. boll_breakout   - 布林带突破 (收盘价突破上轨)
  14. macd_diverge    - MACD底背离 (价格新低但MACD未新低)

数据来源: Redis (需先运行 baostock_sync.py 同步数据)
  - memoa:stocks       Hash  股票列表 {code: JSON{name,code,klineCount}}
  - memoa:kline:{code} String K线数据

用法: python3 baostock_screener.py '{"action":"limit_up","limit":50,"redis_url":"redis://:pass@host:port"}'
"""
import sys
import json
import redis


def parse_kline(kline_data):
    """解析K线数据，返回结构化列表"""
    result = []
    for row in kline_data:
        try:
            result.append({
                "date": row[0],
                "open": float(row[1]) if row[1] else 0,
                "high": float(row[2]) if row[2] else 0,
                "low": float(row[3]) if row[3] else 0,
                "close": float(row[4]) if row[4] else 0,
                "preclose": float(row[5]) if row[5] else 0,
                "volume": float(row[6]) if row[6] else 0,
                "amount": float(row[7]) if row[7] else 0,
                "turn": float(row[8]) if row[8] else 0,
                "pctChg": float(row[9]) if row[9] else 0,
                "isST": row[10] == "1" if len(row) > 10 else False,
            })
        except (ValueError, IndexError):
            continue
    return result


def get_stock_name(stock_json_str):
    """从股票信息JSON中提取名称"""
    try:
        info = json.loads(stock_json_str)
        return info.get("name", "")
    except Exception:
        return ""


def screen_new_high(r, days=60, limit=50):
    """历史新高筛选: 收盘价创N日新高"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < days:
            continue

        recent = kline[-days:]
        closes = [k["close"] for k in recent if k["close"] > 0]
        if len(closes) < days // 2:
            continue

        last_close = closes[-1]
        max_close = max(closes[:-1]) if len(closes) > 1 else 0

        if last_close >= max_close and last_close > 0:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last_close,
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "highDays": days,
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def screen_top_gain(r, period_days=5, limit=50):
    """涨幅排行: 最近N日累计涨幅"""
    results = []

    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 2:
            continue

        recent = kline[-period_days:]
        if len(recent) < 2:
            continue

        start_close = recent[0]["close"]
        end_close = recent[-1]["close"]
        if start_close <= 0:
            continue

        gain_pct = (end_close - start_close) / start_close * 100

        results.append({
            "code": code,
            "name": get_stock_name(stock_json),
            "isST": recent[-1]["isST"],
            "close": end_close,
            "gainPct": round(gain_pct, 2),
            "pctChg": recent[-1]["pctChg"],
            "volume": recent[-1]["volume"],
            "turn": recent[-1]["turn"],
            "periodDays": period_days,
        })

    results.sort(key=lambda x: x["gainPct"], reverse=True)
    return {"data": results[:limit]}


def screen_volume_breakout(r, limit=50):
    """放量突破: 成交量>5日均量2倍 且 当日涨幅>3%"""
    results = []

    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 6:
            continue

        last = kline[-1]
        last_close = last["close"]
        last_vol = last["volume"]
        last_pct = last["pctChg"]

        if last_pct <= 3.0 or last_close <= 0:
            continue

        vols = [k["volume"] for k in kline[-6:-1] if k["volume"] > 0]
        if len(vols) < 3:
            continue
        avg_vol = sum(vols) / len(vols)

        if last_vol > avg_vol * 2:
            vol_ratio = round(last_vol / avg_vol, 2) if avg_vol > 0 else 0
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last_close,
                "pctChg": last_pct,
                "volume": last_vol,
                "volRatio": vol_ratio,
                "turn": last["turn"],
            })

    results.sort(key=lambda x: x["volRatio"], reverse=True)
    return {"data": results[:limit]}


def screen_limit_up(r, limit=50):
    """昨日涨停: 最近一个交易日涨幅>=9.8% (ST股>=4.8%)"""
    results = []

    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 1:
            continue

        last = kline[-1]
        pct = last["pctChg"]
        is_st = last["isST"]

        # 涨停判断: ST股>=4.8%, 普通股>=9.8%
        threshold = 4.8 if is_st else 9.8
        if pct < threshold:
            continue

        # 计算连板天数
        limit_days = count_consecutive_limit(kline)

        results.append({
            "code": code,
            "name": get_stock_name(stock_json),
            "isST": is_st,
            "close": last["close"],
            "pctChg": pct,
            "volume": last["volume"],
            "turn": last["turn"],
            "limitUpDays": limit_days,
        })

    results.sort(key=lambda x: x.get("limitUpDays", 0), reverse=True)
    return {"data": results[:limit]}


def screen_consecutive_limit(r, min_days=2, limit=50):
    """昨日连板: 连续N日涨停 (N>=2)"""
    results = []

    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 2:
            continue

        last = kline[-1]
        # 先确认最近一天涨停
        pct = last["pctChg"]
        is_st = last["isST"]
        threshold = 4.8 if is_st else 9.8
        if pct < threshold:
            continue

        # 计算连板天数
        limit_days = count_consecutive_limit(kline)
        if limit_days < min_days:
            continue

        results.append({
            "code": code,
            "name": get_stock_name(stock_json),
            "isST": is_st,
            "close": last["close"],
            "pctChg": pct,
            "volume": last["volume"],
            "turn": last["turn"],
            "limitUpDays": limit_days,
        })

    results.sort(key=lambda x: x.get("limitUpDays", 0), reverse=True)
    return {"data": results[:limit]}


def screen_broken_limit(r, limit=50):
    """昨日炸板: 曾触及涨停价但收盘未封住 (最高价触及涨停价 但 收盘价<涨停价)

    涨停价 = 昨收 * 1.1 (ST: 1.05)
    炸板条件: high >= 涨停价 且 close < 涨停价 且 pctChg < 9.8%
    """
    results = []

    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 2:
            continue

        last = kline[-1]
        preclose = last["preclose"]
        high = last["high"]
        close = last["close"]
        pct = last["pctChg"]
        is_st = last["isST"]

        if preclose <= 0:
            continue

        # 涨停价
        limit_price = preclose * (1.05 if is_st else 1.10)
        # 涨停阈值
        threshold = 4.8 if is_st else 9.8

        # 炸板: 最高价触及涨停 但 收盘未封住 且 涨幅未达涨停
        if high >= limit_price * 0.995 and close < limit_price * 0.995 and pct < threshold:
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": is_st,
                "close": close,
                "pctChg": pct,
                "volume": last["volume"],
                "turn": last["turn"],
                "limitPrice": round(limit_price, 2),
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def count_consecutive_limit(kline):
    """计算从最近一天开始的连续涨停天数"""
    count = 0
    for i in range(len(kline) - 1, -1, -1):
        day = kline[i]
        pct = day["pctChg"]
        is_st = day["isST"]
        threshold = 4.8 if is_st else 9.8
        if pct >= threshold:
            count += 1
        else:
            break
    return count


# ==================== 技术指标计算 ====================

def calc_ma(closes, period):
    """计算移动平均线"""
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def calc_ema(values, period):
    """计算指数移动平均线"""
    if len(values) < period:
        return []
    k = 2 / (period + 1)
    ema = [sum(values[:period]) / period]
    for i in range(period, len(values)):
        ema.append(values[i] * k + ema[-1] * (1 - k))
    return ema


def calc_macd(closes, fast=12, slow=26, signal=9):
    """计算MACD指标，返回 (dif, dea, macd_hist) 的最近值和前一日值"""
    if len(closes) < slow + signal:
        return None
    ema_fast = calc_ema(closes, fast)
    ema_slow = calc_ema(closes, slow)
    # 对齐: ema_fast 和 ema_slow 都从第 slow-1 个开始
    dif = [ema_fast[i + (slow - fast)] - ema_slow[i] for i in range(len(ema_slow))]
    dea = calc_ema(dif, signal)
    # 对齐 dea
    offset = len(dif) - len(dea)
    macd_hist = [(dif[i + offset] - dea[i]) * 2 for i in range(len(dea))]
    if len(macd_hist) < 2:
        return None
    return {
        "dif": dif[-1],
        "dif_prev": dif[-2],
        "dea": dea[-1],
        "dea_prev": dea[-2],
        "hist": macd_hist[-1],
        "hist_prev": macd_hist[-2],
    }


def calc_kdj(kline, n=9, m1=3, m2=3):
    """计算KDJ指标"""
    if len(kline) < n:
        return None
    highs = [k["high"] for k in kline]
    lows = [k["low"] for k in kline]
    closes = [k["close"] for k in kline]

    k_values = []
    d_values = []
    k_val = 50
    d_val = 50

    for i in range(n - 1, len(closes)):
        high_n = max(highs[i - n + 1:i + 1])
        low_n = min(lows[i - n + 1:i + 1])
        rsv = (closes[i] - low_n) / (high_n - low_n) * 100 if high_n != low_n else 50
        k_val = (2 / m1) * k_val + (1 / m1) * rsv
        d_val = (2 / m2) * d_val + (1 / m2) * k_val
        k_values.append(k_val)
        d_values.append(d_val)

    if len(k_values) < 2:
        return None
    return {
        "k": round(k_values[-1], 2),
        "d": round(d_values[-1], 2),
        "j": round(3 * k_values[-1] - 2 * d_values[-1], 2),
        "k_prev": round(k_values[-2], 2),
        "d_prev": round(d_values[-2], 2),
    }


def calc_rsi(closes, period=14):
    """计算RSI指标"""
    if len(closes) < period + 1:
        return None
    gains = []
    losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))

    if len(gains) < period:
        return None

    # 使用简单移动平均
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return {"rsi": 100, "rsi_prev": 100}

    rsi = 100 - 100 / (1 + avg_gain / avg_loss)

    # 前一日RSI
    if len(gains) > period:
        avg_gain_prev = sum(gains[-period - 1:-1]) / period
        avg_loss_prev = sum(losses[-period - 1:-1]) / period
        if avg_loss_prev == 0:
            rsi_prev = 100
        else:
            rsi_prev = 100 - 100 / (1 + avg_gain_prev / avg_loss_prev)
    else:
        rsi_prev = rsi

    return {"rsi": round(rsi, 2), "rsi_prev": round(rsi_prev, 2)}


def calc_boll(closes, period=20, nbdev=2):
    """计算布林带指标"""
    if len(closes) < period:
        return None
    recent = closes[-period:]
    mid = sum(recent) / period
    variance = sum((x - mid) ** 2 for x in recent) / period
    std = variance ** 0.5
    upper = mid + nbdev * std
    lower = mid - nbdev * std
    return {
        "upper": round(upper, 2),
        "mid": round(mid, 2),
        "lower": round(lower, 2),
    }


# ==================== 技术指标筛选策略 ====================

def screen_ma_bullish(r, limit=50):
    """均线多头排列: MA5 > MA10 > MA20 > MA60"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 60:
            continue

        closes = [k["close"] for k in kline if k["close"] > 0]
        if len(closes) < 60:
            continue

        ma5 = calc_ma(closes, 5)
        ma10 = calc_ma(closes, 10)
        ma20 = calc_ma(closes, 20)
        ma60 = calc_ma(closes, 60)

        if ma5 and ma10 and ma20 and ma60 and ma5 > ma10 > ma20 > ma60:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last["close"],
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "ma5": round(ma5, 2),
                "ma10": round(ma10, 2),
                "ma20": round(ma20, 2),
                "ma60": round(ma60, 2),
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def screen_ma_cross_up(r, limit=50):
    """MA金叉: MA5从下方上穿MA10"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 11:
            continue

        closes = [k["close"] for k in kline if k["close"] > 0]
        if len(closes) < 11:
            continue

        ma5 = calc_ma(closes, 5)
        ma10 = calc_ma(closes, 10)
        ma5_prev = calc_ma(closes[:-1], 5)
        ma10_prev = calc_ma(closes[:-1], 10)

        # 金叉: 今日MA5>MA10 且 昨日MA5<=MA10
        if ma5 and ma10 and ma5_prev and ma10_prev:
            if ma5 > ma10 and ma5_prev <= ma10_prev:
                last = kline[-1]
                results.append({
                    "code": code,
                    "name": get_stock_name(stock_json),
                    "isST": last["isST"],
                    "close": last["close"],
                    "pctChg": last["pctChg"],
                    "volume": last["volume"],
                    "turn": last["turn"],
                    "ma5": round(ma5, 2),
                    "ma10": round(ma10, 2),
                })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def screen_macd_cross_up(r, limit=50):
    """MACD金叉: DIF从下方上穿DEA"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        closes = [k["close"] for k in kline if k["close"] > 0]
        if len(closes) < 35:
            continue

        macd = calc_macd(closes)
        if not macd:
            continue

        # 金叉: 今日DIF>DEA 且 昨日DIF<=DEA
        if macd["dif"] > macd["dea"] and macd["dif_prev"] <= macd["dea_prev"]:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last["close"],
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "dif": round(macd["dif"], 3),
                "dea": round(macd["dea"], 3),
                "macdHist": round(macd["hist"], 3),
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def screen_kdj_golden(r, limit=50):
    """KDJ金叉: K线从下方上穿D线"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        if len(kline) < 10:
            continue

        kdj = calc_kdj(kline)
        if not kdj:
            continue

        # 金叉: 今日K>D 且 昨日K<=D
        if kdj["k"] > kdj["d"] and kdj["k_prev"] <= kdj["d_prev"]:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last["close"],
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "k": kdj["k"],
                "d": kdj["d"],
                "j": kdj["j"],
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def screen_rsi_oversold(r, limit=50):
    """RSI超卖回升: RSI从30以下回升至30以上"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        closes = [k["close"] for k in kline if k["close"] > 0]
        if len(closes) < 16:
            continue

        rsi_data = calc_rsi(closes)
        if not rsi_data:
            continue

        # 超卖回升: 昨日RSI<30 且 今日RSI>=30
        if rsi_data["rsi_prev"] < 30 and rsi_data["rsi"] >= 30:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last["close"],
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "rsi": rsi_data["rsi"],
                "rsiPrev": rsi_data["rsi_prev"],
            })

    results.sort(key=lambda x: x["rsi"])
    return {"data": results[:limit]}


def screen_boll_breakout(r, limit=50):
    """布林带突破: 收盘价突破上轨"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        closes = [k["close"] for k in kline if k["close"] > 0]
        if len(closes) < 20:
            continue

        boll = calc_boll(closes)
        if not boll:
            continue

        last_close = closes[-1]
        # 突破上轨
        if last_close > boll["upper"]:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last_close,
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "bollUpper": boll["upper"],
                "bollMid": boll["mid"],
                "bollLower": boll["lower"],
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def screen_macd_diverge(r, limit=50):
    """MACD底背离: 价格创近期新低但MACD柱未创新低"""
    results = []
    for code, stock_json in r.hscan_iter("memoa:stocks"):
        try:
            kline_raw = r.get(f"memoa:kline:{code}")
            if not kline_raw:
                continue
            kline = parse_kline(json.loads(kline_raw))
        except Exception:
            continue

        closes = [k["close"] for k in kline if k["close"] > 0]
        if len(closes) < 40:
            continue

        macd = calc_macd(closes)
        if not macd:
            continue

        # 底背离检测: 最近60日内，价格创新低但MACD柱未创新低
        lookback = min(60, len(closes))
        recent_closes = closes[-lookback:]
        recent_kline = kline[-lookback:]

        # 找最近两个价格低点
        price_min_idx = recent_closes.index(min(recent_closes))
        if price_min_idx < 5 or price_min_idx >= len(recent_closes) - 2:
            continue

        # 前一个低点区间
        prev_closes = recent_closes[:price_min_idx]
        if len(prev_closes) < 5:
            continue
        prev_min_idx = prev_closes.index(min(prev_closes))
        if prev_min_idx < 2:
            continue

        # 价格创新低
        if recent_closes[price_min_idx] >= prev_closes[prev_min_idx]:
            continue

        # 计算对应位置的MACD柱
        closes_for_macd = [k["close"] for k in kline if k["close"] > 0]
        macd_full = calc_macd(closes_for_macd)
        if not macd_full or macd_full["hist"] >= 0:
            continue

        # MACD柱未创新低 (当前柱 > 前一个低点时的柱)
        # 简化判断: 当前MACD柱为负但比前低点时更浅
        if macd_full["hist"] > macd_full["hist_prev"]:
            last = kline[-1]
            results.append({
                "code": code,
                "name": get_stock_name(stock_json),
                "isST": last["isST"],
                "close": last["close"],
                "pctChg": last["pctChg"],
                "volume": last["volume"],
                "turn": last["turn"],
                "dif": round(macd_full["dif"], 3),
                "dea": round(macd_full["dea"], 3),
                "macdHist": round(macd_full["hist"], 3),
            })

    results.sort(key=lambda x: x["pctChg"], reverse=True)
    return {"data": results[:limit]}


def main():
    args = json.loads(sys.argv[1])
    action = args.get("action", "")
    limit = args.get("limit", 50)
    redis_url = args.get("redis_url", "redis://:DVADMIN3@127.0.0.1:26379")

    r = redis.Redis.from_url(redis_url, decode_responses=True)

    try:
        r.ping()
    except Exception as e:
        print(json.dumps({"error": f"Redis connection failed: {e}"}, ensure_ascii=False))
        return

    stock_count = r.hlen("memoa:stocks")
    if stock_count == 0:
        print(json.dumps({"error": "No stock data in Redis, please run baostock_sync.py first"}, ensure_ascii=False))
        return

    if action == "new_high":
        days = args.get("days", 60)
        result = screen_new_high(r, days=days, limit=limit)
    elif action == "top_gain_5d":
        result = screen_top_gain(r, period_days=5, limit=limit)
    elif action == "top_gain_10d":
        result = screen_top_gain(r, period_days=10, limit=limit)
    elif action == "volume_breakout":
        result = screen_volume_breakout(r, limit=limit)
    elif action == "limit_up":
        result = screen_limit_up(r, limit=limit)
    elif action == "consecutive_limit":
        result = screen_consecutive_limit(r, min_days=2, limit=limit)
    elif action == "broken_limit":
        result = screen_broken_limit(r, limit=limit)
    elif action == "ma_bullish":
        result = screen_ma_bullish(r, limit=limit)
    elif action == "ma_cross_up":
        result = screen_ma_cross_up(r, limit=limit)
    elif action == "macd_cross_up":
        result = screen_macd_cross_up(r, limit=limit)
    elif action == "kdj_golden":
        result = screen_kdj_golden(r, limit=limit)
    elif action == "rsi_oversold":
        result = screen_rsi_oversold(r, limit=limit)
    elif action == "boll_breakout":
        result = screen_boll_breakout(r, limit=limit)
    elif action == "macd_diverge":
        result = screen_macd_diverge(r, limit=limit)
    else:
        result = {"error": f"unknown action: {action}"}

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
