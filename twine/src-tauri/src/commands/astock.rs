use crate::error::AppResult;
use chrono::{Datelike, Timelike};
use encoding_rs::GBK;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

fn decode_gbk_bytes(bytes: &[u8]) -> String {
    let (cow, _, _) = GBK.decode(bytes);
    cow.into_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockSuggestItem {
    pub code: String,
    pub market: String,
    pub full_code: String,
    pub name: String,
    pub item_type: String,
    pub has_esg: bool,
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SinaQuoteData {
    pub code: String,
    pub name: String,
    pub open: f64,
    pub yesterday_close: f64,
    pub current: f64,
    pub high: f64,
    pub low: f64,
    // 五档买盘 (量, 价)
    pub buy1_vol: f64,
    pub buy1: f64,
    pub buy2_vol: f64,
    pub buy2: f64,
    pub buy3_vol: f64,
    pub buy3: f64,
    pub buy4_vol: f64,
    pub buy4: f64,
    pub buy5_vol: f64,
    pub buy5: f64,
    // 五档卖盘 (量, 价)
    pub sell1_vol: f64,
    pub sell1: f64,
    pub sell2_vol: f64,
    pub sell2: f64,
    pub sell3_vol: f64,
    pub sell3: f64,
    pub sell4_vol: f64,
    pub sell4: f64,
    pub sell5_vol: f64,
    pub sell5: f64,
    pub volume: f64,
    pub amount: f64,
    pub date: String,
    pub time: String,
    pub change: f64,
    pub change_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaoStockKLine {
    pub date: String,
    pub code: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub preclose: f64,
    pub volume: f64,
    pub amount: f64,
    pub adjustflag: String,
    pub turn: f64,
    pub tradestatus: String,
    pub pct_chg: f64,
    #[serde(rename = "isST")]
    pub is_st: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaoStockFinancial {
    pub code: String,
    pub pub_date: String,
    pub stat_date: String,
    pub fields: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EastStockInfo {
    pub code: String,
    pub name: String,
    pub industry: String,
    pub region: String,
    pub concepts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketIndex {
    pub code: String,
    pub name: String,
    pub market: String,
    pub price: f64,
    pub change_percent: f64,
    pub change: f64,
}

fn build_east_code(code: &str, market: &str) -> String {
    let prefix = match market {
        "sh" => "SH",
        "sz" => "SZ",
        "bj" => "BJ",
        _ => "SH",
    };
    format!("{}.{}", code, prefix)
}

#[tauri::command]
pub async fn east_stock_info(app_handle: tauri::AppHandle, code: String, market: String) -> AppResult<EastStockInfo> {
    let bs_code = build_baostock_code(&code);
    let redis_key = format!("memoa:stock_info:{}", bs_code);

    // 优先从 Redis 缓存读取
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        if let Some(cached) = redis::cmd("GET")
            .arg(&redis_key)
            .query_async::<String>(&mut conn)
            .await
            .ok()
        {
            if let Ok(info) = serde_json::from_str::<EastStockInfo>(&cached) {
                return Ok(info);
            }
        }
    }

    let east_code = build_east_code(&code, &market);

    let url = format!(
        "https://emweb.securities.eastmoney.com/CoreConception/PageAjax?code={}",
        east_code
    );

    let client = crate::http_client::get_client();
    let response = client
        .get(&url)
        .header("Referer", "https://emweb.securities.eastmoney.com/")
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok(EastStockInfo {
            code: code.clone(),
            name: String::new(),
            industry: String::new(),
            region: String::new(),
            concepts: vec![],
        });
    }

    let body: serde_json::Value = response.json().await?;

    let ssbk = body
        .get("ssbk")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut name = String::new();
    let mut industry_parts: Vec<String> = Vec::new();
    let mut region = String::new();
    let mut concepts: Vec<String> = Vec::new();

    for item in &ssbk {
        let board_name = item
            .get("BOARD_NAME")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let board_rank = item
            .get("BOARD_RANK")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let is_precise = item
            .get("IS_PRECISE")
            .and_then(|v| v.as_str())
            .unwrap_or("0");

        if name.is_empty() {
            name = item
                .get("SECURITY_NAME_ABBR")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
        }

        if board_rank >= 1 && board_rank <= 3 {
            industry_parts.push(board_name.to_string());
        } else if board_rank == 4 {
            region = board_name.to_string();
        }

        if is_precise == "1" {
            concepts.push(board_name.to_string());
        }
    }

    let industry = industry_parts.join("-");

    let info = EastStockInfo {
        code,
        name,
        industry,
        region,
        concepts,
    };

    // 同步写入 Redis，TTL 24小时
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        if let Ok(json_str) = serde_json::to_string(&info) {
            let _ = redis::cmd("SETEX")
                .arg(&redis_key)
                .arg(86400)
                .arg(&json_str)
                .query_async::<String>(&mut conn)
                .await;
        }
    }

    Ok(info)
}

#[tauri::command]
pub async fn east_market_indices() -> AppResult<Vec<MarketIndex>> {
    // 使用新浪行情接口获取三大指数（上证/深证/创业板）
    let codes = "sh000001,sz399001,sz399006";
    let url = format!("http://hq.sinajs.cn/list={}", codes);

    let client = crate::http_client::get_client();
    let response = client
        .get(&url)
        .header("Referer", "https://finance.sina.com.cn/")
        .send()
        .await?;

    let bytes = response.bytes().await?;
    let body = decode_gbk_bytes(&bytes);

    let mut results = Vec::new();
    for line in body.lines() {
        let line = line.trim();
        if !line.starts_with("var hq_str_") {
            continue;
        }

        let eq_pos = match line.find('=') {
            Some(p) => p,
            None => continue,
        };

        let stock_code = line["var hq_str_".len()..eq_pos].to_string();

        let value_part = match line.find('"') {
            Some(start) => {
                let remaining = &line[start + 1..];
                match remaining.rfind('"') {
                    Some(end) => &remaining[..end],
                    None => continue,
                }
            }
            None => continue,
        };

        if value_part.is_empty() {
            continue;
        }

        let fields: Vec<&str> = value_part.split(',').collect();
        if fields.len() < 32 {
            continue;
        }

        let parse_f = |s: &str| s.parse::<f64>().unwrap_or(0.0);

        let name = fields[0].to_string();
        let current = parse_f(fields[3]);
        let yesterday_close = parse_f(fields[2]);
        let change = if yesterday_close > 0.0 {
            current - yesterday_close
        } else {
            0.0
        };
        let change_percent = if yesterday_close > 0.0 {
            (change / yesterday_close) * 100.0
        } else {
            0.0
        };

        let (market, code) = if stock_code.starts_with("sh") {
            ("sh".to_string(), stock_code[2..].to_string())
        } else if stock_code.starts_with("sz") {
            ("sz".to_string(), stock_code[2..].to_string())
        } else {
            (stock_code.clone(), stock_code.clone())
        };

        results.push(MarketIndex {
            code,
            name,
            market,
            price: current,
            change_percent,
            change,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn write_stock_file(
    path: String,
    content: String,
    append: Option<bool>,
) -> AppResult<String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let should_append = append.unwrap_or(false);

    if should_append {
        let existing = if file_path.exists() {
            fs::read_to_string(file_path)?
        } else {
            String::new()
        };

        let separator = if existing.is_empty() { "" } else { "\n\n" };
        let new_content = format!("{}{}{}", existing, separator, content);
        fs::write(file_path, &new_content)?;
    } else {
        fs::write(file_path, &content)?;
    }

    Ok(file_path.to_string_lossy().to_string())
}

pub fn parse_suggest_body(body: &str) -> Vec<StockSuggestItem> {
    let data_str = match body.find('"') {
        Some(start) => {
            let remaining = &body[start + 1..];
            match remaining.rfind('"') {
                Some(end) => &remaining[..end],
                None => return vec![],
            }
        }
        None => return vec![],
    };

    if data_str.is_empty() {
        return vec![];
    }

    let mut results = Vec::new();
    for item in data_str.split(';') {
        let parts: Vec<&str> = item.split(',').collect();
        if parts.len() < 10 {
            continue;
        }

        let item_type = parts.get(1).unwrap_or(&"").to_string();
        let code = parts.get(2).unwrap_or(&"").to_string();
        let full_code = parts.get(3).unwrap_or(&"").to_string();
        let name = parts.get(4).unwrap_or(&"").to_string();

        if item_type != "11" {
            continue;
        }

        let market = if full_code.starts_with("sh") {
            "sh".to_string()
        } else if full_code.starts_with("sz") {
            "sz".to_string()
        } else if full_code.starts_with("bj") {
            "bj".to_string()
        } else {
            continue;
        };

        let has_esg = parts.get(9).map(|s| *s == "ESG").unwrap_or(false);
        let alias = if parts.len() > 11 && !parts[11].is_empty() {
            Some(parts[11].to_string())
        } else {
            None
        };

        results.push(StockSuggestItem {
            code,
            market,
            full_code,
            name,
            item_type,
            has_esg,
            alias,
        });

        if results.len() >= 10 {
            break;
        }
    }

    results
}

pub fn parse_quote_body(body: &str) -> Vec<SinaQuoteData> {
    let mut results = Vec::new();

    for line in body.lines() {
        let line = line.trim();
        if !line.starts_with("var hq_str_") {
            continue;
        }

        let eq_pos = match line.find('=') {
            Some(p) => p,
            None => continue,
        };

        let stock_code = line["var hq_str_".len()..eq_pos].to_string();

        let value_part = match line.find('"') {
            Some(start) => {
                let remaining = &line[start + 1..];
                match remaining.rfind('"') {
                    Some(end) => &remaining[..end],
                    None => continue,
                }
            }
            None => continue,
        };

        if value_part.is_empty() {
            continue;
        }

        let fields: Vec<&str> = value_part.split(',').collect();
        if fields.len() < 32 {
            continue;
        }

        let parse_f = |s: &str| s.parse::<f64>().unwrap_or(0.0);

        let current = parse_f(fields[3]);
        let yesterday_close = parse_f(fields[2]);
        let change = if yesterday_close > 0.0 {
            current - yesterday_close
        } else {
            0.0
        };
        let change_percent = if yesterday_close > 0.0 {
            (change / yesterday_close) * 100.0
        } else {
            0.0
        };

        results.push(SinaQuoteData {
            code: stock_code,
            name: fields[0].to_string(),
            open: parse_f(fields[1]),
            yesterday_close,
            current,
            high: parse_f(fields[4]),
            low: parse_f(fields[5]),
            // 五档买盘: fields[10..20] = 买一量,买一价,买二量,买二价,...,买五量,买五价
            buy1_vol: parse_f(fields[10]),
            buy1: parse_f(fields[6]),
            buy2_vol: parse_f(fields[12]),
            buy2: parse_f(fields[13]),
            buy3_vol: parse_f(fields[14]),
            buy3: parse_f(fields[15]),
            buy4_vol: parse_f(fields[16]),
            buy4: parse_f(fields[17]),
            buy5_vol: parse_f(fields[18]),
            buy5: parse_f(fields[19]),
            // 五档卖盘: fields[20..30] = 卖一量,卖一价,卖二量,卖二价,...,卖五量,卖五价
            sell1_vol: parse_f(fields[20]),
            sell1: parse_f(fields[7]),
            sell2_vol: parse_f(fields[22]),
            sell2: parse_f(fields[23]),
            sell3_vol: parse_f(fields[24]),
            sell3: parse_f(fields[25]),
            sell4_vol: parse_f(fields[26]),
            sell4: parse_f(fields[27]),
            sell5_vol: parse_f(fields[28]),
            sell5: parse_f(fields[29]),
            volume: parse_f(fields[8]),
            amount: parse_f(fields[9]),
            date: fields[30].to_string(),
            time: fields[31].to_string(),
            change,
            change_percent,
        });
    }

    results
}

pub fn build_kline_code(code: &str) -> String {
    if code.starts_with("s_") || code.starts_with("sh") || code.starts_with("sz") || code.starts_with("bj") {
        code.to_string()
    } else if code.starts_with('6') {
        format!("sh{}", code)
    } else if code.starts_with('0') || code.starts_with('3') {
        format!("sz{}", code)
    } else if code.starts_with('4') || code.starts_with('8') {
        format!("bj{}", code)
    } else {
        code.to_string()
    }
}

pub fn build_baostock_code(code: &str) -> String {
    if code.contains('.') {
        code.to_string()
    } else if code.starts_with('6') {
        format!("sh.{}", code)
    } else if code.starts_with('0') || code.starts_with('3') {
        format!("sz.{}", code)
    } else if code.starts_with('4') || code.starts_with('8') {
        format!("bj.{}", code)
    } else {
        code.to_string()
    }
}

#[tauri::command]
pub async fn stock_suggest(keyword: String) -> AppResult<Vec<StockSuggestItem>> {
    if keyword.trim().is_empty() {
        return Ok(vec![]);
    }

    let url = format!(
        "https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key={}&name=suggestdata_{}",
        keyword,
        chrono::Utc::now().timestamp_millis()
    );

    let client = crate::http_client::get_client();
    let response = client
        .get(&url)
        .header("Referer", "https://finance.sina.com.cn/")
        .send()
        .await?;

    let bytes = response.bytes().await?;
    let body = decode_gbk_bytes(&bytes);
    Ok(parse_suggest_body(&body))
}

#[tauri::command]
pub async fn stock_quote(codes: Vec<String>) -> AppResult<Vec<SinaQuoteData>> {
    if codes.is_empty() {
        return Ok(vec![]);
    }

    let codes_str = codes.join(",");
    let url = format!("http://hq.sinajs.cn/list={}", codes_str);

    let client = crate::http_client::get_client();
    let response = client
        .get(&url)
        .header("Referer", "https://finance.sina.com.cn/")
        .send()
        .await?;

    let bytes = response.bytes().await?;
    let body = decode_gbk_bytes(&bytes);
    Ok(parse_quote_body(&body))
}

#[tauri::command]
pub fn kline_image_url(code: String, period: String) -> String {
    let full_code = build_kline_code(&code);
    format!(
        "https://image.sinajs.cn/newchart/{}/n/{}.gif",
        period, full_code
    )
}

#[tauri::command]
pub fn index_kline_image_url(index_code: String, period: String) -> String {
    format!(
        "https://image.sinajs.cn/newchart/{}/n/{}.gif",
        period, index_code
    )
}

#[tauri::command]
pub async fn baostock_query_kline(
    app_handle: tauri::AppHandle,
    code: String,
    start_date: String,
    end_date: String,
    frequency: String,
    adjustflag: Option<String>,
) -> AppResult<Vec<BaoStockKLine>> {
    let baostock_code = build_baostock_code(&code);
    let adjust = adjustflag.unwrap_or_else(|| "3".to_string());

    // 优先从 Redis 缓存读取 (baostock_sync 同步的数据)
    if frequency == "d" && adjust == "3" {
        let redis_key = format!("memoa:kline:{}", baostock_code);
        if let Some(mut conn) = get_redis_connection(&app_handle).await {
            if let Some(cached) = redis::cmd("GET")
                .arg(&redis_key)
                .query_async::<String>(&mut conn)
                .await
                .ok()
            {
                if let Ok(raw_arr) = serde_json::from_str::<Vec<Vec<serde_json::Value>>>(&cached) {
                    let results: Vec<BaoStockKLine> = raw_arr
                        .into_iter()
                        .filter_map(|row| {
                            if row.len() < 11 {
                                return None;
                            }
                            let parse_f = |v: &serde_json::Value| v.as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                            Some(BaoStockKLine {
                                date: row[0].as_str().unwrap_or("").to_string(),
                                code: baostock_code.clone(),
                                open: parse_f(&row[1]),
                                high: parse_f(&row[2]),
                                low: parse_f(&row[3]),
                                close: parse_f(&row[4]),
                                preclose: parse_f(&row[5]),
                                volume: parse_f(&row[6]),
                                amount: parse_f(&row[7]),
                                adjustflag: "3".to_string(),
                                turn: parse_f(&row[8]),
                                tradestatus: "1".to_string(),
                                pct_chg: parse_f(&row[9]),
                                is_st: row.get(10).and_then(|v| v.as_str()) == Some("1"),
                            })
                        })
                        .filter(|k| k.date >= start_date && k.date <= end_date)
                        .collect();
                    if !results.is_empty() {
                        return Ok(results);
                    }
                }
            }
        }
    }

    let url = format!(
        "http://baostock.com:9000/api/kline?code={}&start={}&end={}&frequency={}&adjustflag={}",
        baostock_code, start_date, end_date, frequency, adjust
    );

    let client = crate::http_client::get_client();
    let response = client
        .get(&url)
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body: serde_json::Value = response.json().await?;

    let Some(data_arr) = body.get("data").and_then(|d| d.get("kline")) else {
        return Ok(vec![]);
    };

    let Some(fields) = body.get("data").and_then(|d| d.get("fields")) else {
        return Ok(vec![]);
    };

    let field_names: Vec<&str> = fields
        .as_str()
        .unwrap_or("")
        .split('|')
        .collect();

    let field_idx = |name: &str| -> usize {
        field_names.iter().position(|&f| f == name).unwrap_or(0)
    };

    let mut results = Vec::new();

    if let Some(arr) = data_arr.as_array() {
        for item in arr {
            let vals: Vec<&str> = item
                .as_str()
                .unwrap_or("")
                .split('|')
                .collect();

            if vals.len() < 14 {
                continue;
            }

            let parse_f = |idx: usize| -> f64 {
                vals.get(idx)
                    .and_then(|v| v.parse::<f64>().ok())
                    .unwrap_or(0.0)
            };

            results.push(BaoStockKLine {
                date: vals.get(field_idx("date")).unwrap_or(&"").to_string(),
                code: vals.get(field_idx("code")).unwrap_or(&"").to_string(),
                open: parse_f(field_idx("open")),
                high: parse_f(field_idx("high")),
                low: parse_f(field_idx("low")),
                close: parse_f(field_idx("close")),
                preclose: parse_f(field_idx("preclose")),
                volume: parse_f(field_idx("volume")),
                amount: parse_f(field_idx("amount")),
                adjustflag: vals.get(field_idx("adjustflag")).unwrap_or(&"").to_string(),
                turn: parse_f(field_idx("turn")),
                tradestatus: vals.get(field_idx("tradestatus")).unwrap_or(&"").to_string(),
                pct_chg: parse_f(field_idx("pctChg")),
                is_st: *vals.get(field_idx("isST")).unwrap_or(&"0") == "1",
            });
        }
    }

    // 同步写入 Redis（仅日K线后复权数据）
    if frequency == "d" && adjust == "3" && !results.is_empty() {
        let redis_key = format!("memoa:kline:{}", baostock_code);
        if let Some(mut conn) = get_redis_connection(&app_handle).await {
            let compact: Vec<Vec<serde_json::Value>> = results.iter().map(|k| {
                vec![
                    serde_json::Value::from(k.date.clone()),
                    serde_json::Value::from(k.open),
                    serde_json::Value::from(k.high),
                    serde_json::Value::from(k.low),
                    serde_json::Value::from(k.close),
                    serde_json::Value::from(k.preclose),
                    serde_json::Value::from(k.volume),
                    serde_json::Value::from(k.amount),
                    serde_json::Value::from(k.turn),
                    serde_json::Value::from(k.pct_chg),
                    serde_json::Value::from(if k.is_st { "1" } else { "0" }),
                ]
            }).collect();
            if let Ok(json_str) = serde_json::to_string(&compact) {
                let _ = redis::cmd("SET")
                    .arg(&redis_key)
                    .arg(&json_str)
                    .query_async::<String>(&mut conn)
                    .await;
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn baostock_query_financial(
    code: String,
    year: i32,
    quarter: i32,
) -> AppResult<Vec<BaoStockFinancial>> {
    let baostock_code = build_baostock_code(&code);

    let url = format!(
        "http://baostock.com:9000/api/profit?code={}&year={}&quarter={}",
        baostock_code, year, quarter
    );

    let client = crate::http_client::get_client();
    let response = client
        .get(&url)
        .send()
        .await?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body: serde_json::Value = response.json().await?;

    let Some(data_arr) = body.get("data").and_then(|d| d.get("profit")) else {
        return Ok(vec![]);
    };

    let Some(fields) = body.get("data").and_then(|d| d.get("fields")) else {
        return Ok(vec![]);
    };

    let field_names: Vec<&str> = fields
        .as_str()
        .unwrap_or("")
        .split('|')
        .collect();

    let mut results = Vec::new();

    if let Some(arr) = data_arr.as_array() {
        for item in arr {
            let vals: Vec<&str> = item
                .as_str()
                .unwrap_or("")
                .split('|')
                .collect();

            let mut map = serde_json::Map::new();
            for (i, &name) in field_names.iter().enumerate() {
                let val = vals.get(i).unwrap_or(&"");
                if let Ok(n) = val.parse::<f64>() {
                    map.insert(name.to_string(), serde_json::Value::from(n));
                } else {
                    map.insert(name.to_string(), serde_json::Value::from(*val));
                }
            }

            results.push(BaoStockFinancial {
                code: map
                    .get("code")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                pub_date: map
                    .get("pubDate")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                stat_date: map
                    .get("statDate")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                fields: serde_json::Value::Object(map),
            });
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn baostock_stock_list() -> AppResult<Vec<StockSuggestItem>> {
    let url = "http://baostock.com:9000/api/stock_list?type=stock";

    let client = crate::http_client::get_client();
    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body: serde_json::Value = response.json().await?;

    let Some(data_arr) = body.get("data").and_then(|d| d.get("stock")) else {
        return Ok(vec![]);
    };

    let Some(fields) = body.get("data").and_then(|d| d.get("fields")) else {
        return Ok(vec![]);
    };

    let field_names: Vec<&str> = fields
        .as_str()
        .unwrap_or("")
        .split('|')
        .collect();

    let mut results = Vec::new();

    if let Some(arr) = data_arr.as_array() {
        for item in arr {
            let vals: Vec<&str> = item
                .as_str()
                .unwrap_or("")
                .split('|')
                .collect();

            let get_field = |name: &str| -> &str {
                let idx = field_names.iter().position(|&f| f == name).unwrap_or(0);
                vals.get(idx).unwrap_or(&"")
            };

            let code = get_field("code");
            let trade_status = get_field("tradeStatus");

            if trade_status == "0" {
                continue;
            }

            let (market, pure_code) = if code.starts_with("sh.") {
                ("sh", &code[3..])
            } else if code.starts_with("sz.") {
                ("sz", &code[3..])
            } else if code.starts_with("bj.") {
                ("bj", &code[3..])
            } else {
                continue;
            };

            let ipo_date = get_field("ipoDate");

            results.push(StockSuggestItem {
                code: pure_code.to_string(),
                market: market.to_string(),
                full_code: code.to_string(),
                name: format!("{}({})", pure_code, market.to_uppercase()),
                item_type: "11".to_string(),
                has_esg: false,
                alias: if ipo_date.is_empty() {
                    None
                } else {
                    Some(ipo_date.to_string())
                },
            });
        }
    }

    Ok(results)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaoStockFinancialResult {
    pub profit: Vec<serde_json::Value>,
    pub growth: Vec<serde_json::Value>,
    pub balance: Vec<serde_json::Value>,
    pub cash_flow: Vec<serde_json::Value>,
    pub dupont: Vec<serde_json::Value>,
    pub operation: Vec<serde_json::Value>,
    #[serde(default)]
    pub express: Vec<serde_json::Value>,
    #[serde(default)]
    pub forecast: Vec<serde_json::Value>,
}

// ========== 选股筛选相关类型 ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenerStock {
    pub code: String,
    pub name: String,
    #[serde(rename = "isST")]
    pub is_st: bool,
    pub close: f64,
    pub pct_chg: f64,
    pub volume: f64,
    pub turn: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub high_days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gain_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vol_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_up_days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_price: Option<f64>,
    // MA 指标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ma5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ma10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ma20: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ma60: Option<f64>,
    // MACD 指标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dif: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dea: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "macdHist")]
    pub macd_hist: Option<f64>,
    // KDJ 指标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub k: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub d: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub j: Option<f64>,
    // RSI 指标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rsi: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rsi_prev: Option<f64>,
    // BOLL 指标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boll_upper: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boll_mid: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boll_lower: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenerResult {
    pub action: String,
    pub stocks: Vec<ScreenerStock>,
    pub cached: bool,
    pub updated_at: String,
}

async fn get_redis_connection(app_handle: &tauri::AppHandle) -> Option<redis::aio::MultiplexedConnection> {
    let config = app_handle.state::<crate::config::AppConfig>();
    let client = redis::Client::open(config.redis_url.as_str()).ok()?;
    client.get_multiplexed_async_connection().await.ok()
}

async fn get_screener_cache(
    conn: &mut redis::aio::MultiplexedConnection,
    key: &str,
) -> Option<String> {
    redis::cmd("GET")
        .arg(key)
        .query_async::<String>(conn)
        .await
        .ok()
}

async fn set_screener_cache(
    conn: &mut redis::aio::MultiplexedConnection,
    key: &str,
    value: &str,
    ttl_secs: u64,
) {
    let _ = redis::cmd("SETEX")
        .arg(key)
        .arg(ttl_secs)
        .arg(value)
        .query_async::<String>(conn)
        .await;
}

fn find_screener_script(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, crate::error::AppError> {
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        candidates.push(res_dir.join("scripts/baostock_screener.py"));
    }
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf()).unwrap_or_default()) {
        candidates.push(exe_dir.join("scripts/baostock_screener.py"));
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    candidates.push(cwd.join("src-tauri/scripts/baostock_screener.py"));
    candidates.push(cwd.join("scripts/baostock_screener.py"));
    candidates.push(std::path::PathBuf::from("scripts/baostock_screener.py"));
    candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| crate::error::AppError::Other("baostock_screener.py not found".to_string()))
}

fn find_sync_script(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, crate::error::AppError> {
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        candidates.push(res_dir.join("scripts/baostock_sync.py"));
    }
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf()).unwrap_or_default()) {
        candidates.push(exe_dir.join("scripts/baostock_sync.py"));
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    candidates.push(cwd.join("src-tauri/scripts/baostock_sync.py"));
    candidates.push(cwd.join("scripts/baostock_sync.py"));
    candidates.push(std::path::PathBuf::from("scripts/baostock_sync.py"));
    candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| crate::error::AppError::Other("baostock_sync.py not found".to_string()))
}

#[tauri::command]
pub async fn baostock_screener(
    app_handle: tauri::AppHandle,
    action: String,
    days: Option<i32>,
    limit: Option<i32>,
) -> AppResult<ScreenerResult> {
    let cache_key = format!("memoa:screener:{}", action);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 尝试从Redis缓存获取
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        if let Some(cached) = get_screener_cache(&mut conn, &cache_key).await {
            if let Ok(mut result) = serde_json::from_str::<ScreenerResult>(&cached) {
                result.cached = true;
                return Ok(result);
            }
        }
    }

    // 缓存未命中，调用Python脚本 (从Redis读取数据)
    let script_path = find_screener_script(&app_handle)?;
    let config = app_handle.state::<crate::config::AppConfig>();

    let args_json = serde_json::json!({
        "action": action,
        "days": days.unwrap_or(60),
        "limit": limit.unwrap_or(50),
        "redis_url": config.redis_url,
    })
    .to_string();

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60), // 从Redis读取，1分钟足够
        tokio::process::Command::new("python3")
            .arg(&script_path)
            .arg(&args_json)
            .output(),
    )
    .await
    .map_err(|_| crate::error::AppError::Other("screener query timeout (60s)".to_string()))?
    .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::AppError::Other(format!(
            "screener script failed: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let wrapper: serde_json::Value = serde_json::from_str(&stdout).unwrap_or_else(|e| {
        eprintln!("[baostock_screener] JSON parse error: {}", e);
        serde_json::json!({})
    });

    if let Some(err) = wrapper.get("error").and_then(|v| v.as_str()) {
        return Err(crate::error::AppError::Other(err.to_string()));
    }

    let data_arr = wrapper
        .get("data")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut stocks = Vec::new();
    for item in &data_arr {
        let code = item.get("code").and_then(|v| v.as_str()).unwrap_or("");
        let (market, pure_code) = if code.starts_with("sh.") {
            ("sh", &code[3..])
        } else if code.starts_with("sz.") {
            ("sz", &code[3..])
        } else {
            ("", code)
        };

        stocks.push(ScreenerStock {
            code: format!("{}{}", market, pure_code),
            name: item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            is_st: item.get("isST").and_then(|v| v.as_bool()).unwrap_or(false),
            close: item.get("close").and_then(|v| v.as_f64()).unwrap_or(0.0),
            pct_chg: item.get("pctChg").and_then(|v| v.as_f64()).unwrap_or(0.0),
            volume: item.get("volume").and_then(|v| v.as_f64()).unwrap_or(0.0),
            turn: item.get("turn").and_then(|v| v.as_f64()).unwrap_or(0.0),
            high_days: item.get("highDays").and_then(|v| v.as_i64()).map(|v| v as i32),
            gain_pct: item.get("gainPct").and_then(|v| v.as_f64()),
            period_days: item.get("periodDays").and_then(|v| v.as_i64()).map(|v| v as i32),
            vol_ratio: item.get("volRatio").and_then(|v| v.as_f64()),
            limit_up_days: item.get("limitUpDays").and_then(|v| v.as_i64()).map(|v| v as i32),
            limit_price: item.get("limitPrice").and_then(|v| v.as_f64()),
            ma5: item.get("ma5").and_then(|v| v.as_f64()),
            ma10: item.get("ma10").and_then(|v| v.as_f64()),
            ma20: item.get("ma20").and_then(|v| v.as_f64()),
            ma60: item.get("ma60").and_then(|v| v.as_f64()),
            dif: item.get("dif").and_then(|v| v.as_f64()),
            dea: item.get("dea").and_then(|v| v.as_f64()),
            macd_hist: item.get("macdHist").and_then(|v| v.as_f64()),
            k: item.get("k").and_then(|v| v.as_f64()),
            d: item.get("d").and_then(|v| v.as_f64()),
            j: item.get("j").and_then(|v| v.as_f64()),
            rsi: item.get("rsi").and_then(|v| v.as_f64()),
            rsi_prev: item.get("rsiPrev").and_then(|v| v.as_f64()),
            boll_upper: item.get("bollUpper").and_then(|v| v.as_f64()),
            boll_mid: item.get("bollMid").and_then(|v| v.as_f64()),
            boll_lower: item.get("bollLower").and_then(|v| v.as_f64()),
        });
    }

    let result = ScreenerResult {
        action: action.clone(),
        stocks,
        cached: false,
        updated_at: now,
    };

    // 写入Redis缓存，TTL 4小时
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        if let Ok(json_str) = serde_json::to_string(&result) {
            set_screener_cache(&mut conn, &cache_key, &json_str, 14400).await;
        }
    }

    Ok(result)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub status: String,
    pub total: i64,
    pub synced: i64,
    pub skipped: Option<i64>,
    pub errors: Option<i64>,
    pub start_time: Option<String>,
    pub finish_time: Option<String>,
    pub last_code: Option<String>,
    pub stock_count: i64,
    pub mode: Option<String>,
}

#[tauri::command]
pub async fn baostock_sync_status(app_handle: tauri::AppHandle) -> AppResult<SyncStatus> {
    let Some(mut conn) = get_redis_connection(&app_handle).await else {
        return Ok(SyncStatus {
            status: "no_redis".to_string(),
            total: 0,
            synced: 0,
            skipped: None,
            errors: None,
            start_time: None,
            finish_time: None,
            last_code: None,
            stock_count: 0,
            mode: None,
        });
    };

    let stock_count: i64 = redis::cmd("HLEN")
        .arg("memoa:stocks")
        .query_async(&mut conn)
        .await
        .unwrap_or(0);

    let status_map: std::collections::HashMap<String, String> = redis::cmd("HGETALL")
        .arg("memoa:sync:status")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    let get = |key: &str| -> Option<String> { status_map.get(key).cloned() };
    let parse_i64 = |key: &str| -> i64 {
        get(key).and_then(|v| v.parse().ok()).unwrap_or(0)
    };

    Ok(SyncStatus {
        status: get("status").unwrap_or_else(|| "never".to_string()),
        total: parse_i64("total"),
        synced: parse_i64("synced"),
        skipped: get("skipped").and_then(|v| v.parse().ok()),
        errors: get("errors").and_then(|v| v.parse().ok()),
        start_time: get("startTime"),
        finish_time: get("finishTime"),
        last_code: get("lastCode"),
        stock_count,
        mode: get("mode"),
    })
}

#[tauri::command]
pub async fn baostock_sync_data(app_handle: tauri::AppHandle) -> AppResult<String> {
    let script_path = find_sync_script(&app_handle)?;
    let config = app_handle.state::<crate::config::AppConfig>();

    // 股票列表同步（轻量，不含K线）
    let args_json = serde_json::json!({
        "redis_url": config.redis_url,
    })
    .to_string();

    // 更新 Redis 状态为 syncing
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = redis::cmd("HSET")
            .arg("memoa:sync:status")
            .arg("status")
            .arg("triggered")
            .arg("startTime")
            .arg(&now)
            .query_async::<String>(&mut conn)
            .await;
    }

    let app = app_handle.clone();
    tokio::spawn(async move {
        let output = tokio::process::Command::new("python3")
            .arg(&script_path)
            .arg(&args_json)
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                eprintln!("[stock_sync] 股票列表同步完成");
            }
            Ok(out) => {
                eprintln!("[stock_sync] stderr: {}", String::from_utf8_lossy(&out.stderr));
            }
            Err(e) => {
                eprintln!("[stock_sync] failed: {}", e);
            }
        }

        let _ = app.emit("stock-sync-finished", "done");
    });

    Ok("stock sync started".to_string())
}

#[tauri::command]
pub async fn redis_health_check(app_handle: tauri::AppHandle) -> AppResult<bool> {
    match get_redis_connection(&app_handle).await {
        Some(mut conn) => {
            let result: String = redis::cmd("PING")
                .query_async(&mut conn)
                .await
                .unwrap_or_default();
            Ok(result == "PONG")
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn baostock_financial_report(
    app_handle: tauri::AppHandle,
    code: String,
    force_refresh: Option<bool>,
) -> AppResult<BaoStockFinancialResult> {
    let bs_code = build_baostock_code(&code);
    let refresh = force_refresh.unwrap_or(false);
    eprintln!("[baostock_financial_report] code={}, bs_code={}, force_refresh={}", code, bs_code, refresh);

    // 优先从本地数据库读取
    if !refresh {
        if let Ok(Some(cached_json)) = crate::db::financial::get(&code) {
            if let Ok(result) = serde_json::from_str::<BaoStockFinancialResult>(&cached_json) {
                eprintln!("[baostock_financial_report] hit local cache for {}", code);
                return Ok(result);
            }
        }
    }

    let script_path = {
        // 1. 尝试 Tauri resource_dir（打包后）
        let mut candidates = Vec::new();
        if let Ok(res_dir) = app_handle.path().resource_dir() {
            candidates.push(res_dir.join("scripts/baostock_query.py"));
        }
        // 2. 尝试可执行文件同级目录
        if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf()).unwrap_or_default()) {
            candidates.push(exe_dir.join("scripts/baostock_query.py"));
        }
        // 3. 开发模式：当前工作目录
        let cwd = std::env::current_dir().unwrap_or_default();
        candidates.push(cwd.join("src-tauri/scripts/baostock_query.py"));
        candidates.push(cwd.join("scripts/baostock_query.py"));
        candidates.push(std::path::PathBuf::from("scripts/baostock_query.py"));

        eprintln!("[baostock_financial_report] searching script in {:?}:", candidates);
        let found = candidates
            .into_iter()
            .find(|p| {
                let exists = p.exists();
                eprintln!("  {} -> {}", p.display(), exists);
                exists
            });
        found.ok_or_else(|| {
            crate::error::AppError::Other("baostock_query.py not found in any candidate path".to_string())
        })?
    };

    let args_json = serde_json::json!({
        "action": "all",
        "code": bs_code,
    })
    .to_string();

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        tokio::process::Command::new("python3")
            .arg(&script_path)
            .arg(&args_json)
            .output(),
    )
    .await
    .map_err(|_| crate::error::AppError::Other("baostock query timeout (60s)".to_string()))?
    .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::AppError::Other(format!(
            "baostock script failed: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let wrapper: serde_json::Value =
        serde_json::from_str(&stdout).unwrap_or_else(|e| {
            eprintln!("[baostock_financial_report] JSON parse error: {}", e);
            serde_json::json!({})
        });

    let data_value = wrapper.get("data").cloned().unwrap_or(serde_json::json!({}));
    let result: BaoStockFinancialResult =
        serde_json::from_value(data_value).unwrap_or_else(|e| {
            eprintln!("[baostock_financial_report] data parse error: {}", e);
            BaoStockFinancialResult {
                profit: vec![],
                growth: vec![],
                balance: vec![],
                cash_flow: vec![],
                dupont: vec![],
                operation: vec![],
                express: vec![],
                forecast: vec![],
            }
        });

    // 保存到本地数据库
    if let Ok(json_str) = serde_json::to_string(&result) {
        let _ = crate::db::financial::upsert(&code, &json_str);
        eprintln!("[baostock_financial_report] saved to local cache for {}", code);
    }

    Ok(result)
}

// ========== 每日K线增量同步 ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySyncStatus {
    pub status: String,
    pub total: i64,
    pub synced: i64,
    pub gaps: i64,
    pub backfilled: i64,
    pub errors: i64,
    pub last_sync_date: Option<String>,
    pub start_time: Option<String>,
    pub finish_time: Option<String>,
}

fn find_daily_sync_script(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, crate::error::AppError> {
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        candidates.push(res_dir.join("scripts/daily_kline_sync.py"));
    }
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf()).unwrap_or_default()) {
        candidates.push(exe_dir.join("scripts/daily_kline_sync.py"));
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    candidates.push(cwd.join("src-tauri/scripts/daily_kline_sync.py"));
    candidates.push(cwd.join("scripts/daily_kline_sync.py"));
    candidates.push(std::path::PathBuf::from("scripts/daily_kline_sync.py"));

    candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| crate::error::AppError::Other("daily_kline_sync.py not found".to_string()))
}

fn find_kline_fetch_script(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        candidates.push(res_dir.join("scripts/kline_fetch_missing.py"));
    }
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf()).unwrap_or_default()) {
        candidates.push(exe_dir.join("scripts/kline_fetch_missing.py"));
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    candidates.push(cwd.join("src-tauri/scripts/kline_fetch_missing.py"));
    candidates.push(cwd.join("scripts/kline_fetch_missing.py"));
    candidates.push(std::path::PathBuf::from("scripts/kline_fetch_missing.py"));

    candidates.into_iter().find(|p| p.exists())
}

/// 触发每日K线增量同步（后台运行）
#[tauri::command]
pub async fn sync_daily_kline(app_handle: tauri::AppHandle) -> AppResult<String> {
    let script_path = find_daily_sync_script(&app_handle)?;
    let config = app_handle.state::<crate::config::AppConfig>();

    let args_json = serde_json::json!({
        "redis_url": config.redis_url,
        "kline_days": 120,
        "check_gaps": true,
    })
    .to_string();

    // 更新 Redis 状态为 syncing
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = redis::cmd("HSET")
            .arg("memoa:daily_sync:status")
            .arg("status")
            .arg("triggered")
            .arg("startTime")
            .arg(&now)
            .query_async::<String>(&mut conn)
            .await;
    }

    let app = app_handle.clone();
    tokio::spawn(async move {
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(1800), // 30分钟超时（5000+股票全量同步可能很慢）
            tokio::process::Command::new("python3")
                .arg(&script_path)
                .arg(&args_json)
                .output(),
        )
        .await;

        let (status_msg, need_update_redis) = match output {
            Ok(Ok(out)) if out.status.success() => {
                // Python 退出码 0，但输出可能含 {"error": "..."}（登录失败等）
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("\"error\"") {
                    eprintln!("[daily_kline_sync] script returned error: {}", stdout);
                    // Python 脚本已自行更新 Redis 为 error，无需 Rust 重复更新
                    ("error".to_string(), false)
                } else {
                    ("done".to_string(), false)
                }
            }
            Ok(Ok(out)) => {
                eprintln!("[daily_kline_sync] stderr: {}", String::from_utf8_lossy(&out.stderr));
                ("error".to_string(), true)
            }
            Ok(Err(e)) => {
                eprintln!("[daily_kline_sync] failed: {}", e);
                ("error".to_string(), true)
            }
            Err(_) => {
                eprintln!("[daily_kline_sync] timeout after 30min");
                ("error".to_string(), true)
            }
        };

        // Python 脚本失败/超时时，主动更新 Redis 状态，避免前端永远卡在 "syncing"
        if need_update_redis {
            if let Some(mut conn) = get_redis_connection(&app).await {
                let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let _ = redis::cmd("HSET")
                    .arg("memoa:daily_sync:status")
                    .arg("status")
                    .arg(&status_msg)
                    .arg("finishTime")
                    .arg(&now)
                    .query_async::<String>(&mut conn)
                    .await;
            }
        }

        // 发送事件通知前端
        let _ = app.emit("daily-sync-finished", &status_msg);
    });

    Ok("daily sync started".to_string())
}

/// 查询每日同步状态
#[tauri::command]
pub async fn daily_sync_status(app_handle: tauri::AppHandle) -> AppResult<DailySyncStatus> {
    let Some(mut conn) = get_redis_connection(&app_handle).await else {
        return Ok(DailySyncStatus {
            status: "no_redis".to_string(),
            total: 0,
            synced: 0,
            gaps: 0,
            backfilled: 0,
            errors: 0,
            last_sync_date: None,
            start_time: None,
            finish_time: None,
        });
    };

    let status_map: std::collections::HashMap<String, String> = redis::cmd("HGETALL")
        .arg("memoa:daily_sync:status")
        .query_async(&mut conn)
        .await
        .unwrap_or_default();

    let get = |key: &str| -> Option<String> { status_map.get(key).cloned() };
    let parse_i64 = |key: &str| -> i64 { get(key).and_then(|v| v.parse().ok()).unwrap_or(0) };

    Ok(DailySyncStatus {
        status: get("status").unwrap_or_else(|| "never".to_string()),
        total: parse_i64("total"),
        synced: parse_i64("synced"),
        gaps: parse_i64("gaps"),
        backfilled: parse_i64("backfilled"),
        errors: parse_i64("errors"),
        last_sync_date: get("lastSyncDate"),
        start_time: get("startTime"),
        finish_time: get("finishTime"),
    })
}

/// 启动每日定时同步调度器（每天8:00自动触发）
pub fn start_daily_sync_scheduler(app_handle: tauri::AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};

    static SCHEDULER_STARTED: AtomicBool = AtomicBool::new(false);

    // 防止重复启动
    if SCHEDULER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        use tokio::time::{self, Duration};

        let mut last_sync_date = String::new();

        // 每分钟检查一次是否到了8:00
        let mut interval = time::interval(Duration::from_secs(60));

        loop {
            interval.tick().await;

            let now = chrono::Local::now();
            let today = now.format("%Y-%m-%d").to_string();

            // 检查：当前是8:00整（允许1分钟误差），且今天还没同步过
            if now.hour() == 8 && now.minute() < 1 && today != last_sync_date {
                eprintln!("[scheduler] 触发每日K线同步: {}", today);

                let script_path = match find_daily_sync_script(&app_handle) {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!("[scheduler] 找不到脚本: {}", e);
                        continue;
                    }
                };

                let config = app_handle.state::<crate::config::AppConfig>();
                let args_json = serde_json::json!({
                    "redis_url": config.redis_url,
                    "kline_days": 120,
                    "check_gaps": true,
                })
                .to_string();

                // 更新状态
                if let Some(mut conn) = get_redis_connection(&app_handle).await {
                    let now_str = now.format("%Y-%m-%d %H:%M:%S").to_string();
                    let _ = redis::cmd("HSET")
                        .arg("memoa:daily_sync:status")
                        .arg("status")
                        .arg("scheduled")
                        .arg("startTime")
                        .arg(&now_str)
                        .query_async::<String>(&mut conn)
                        .await;
                }

                let app = app_handle.clone();
                let output = tokio::process::Command::new("python3")
                    .arg(&script_path)
                    .arg(&args_json)
                    .output()
                    .await;

                match output {
                    Ok(out) if out.status.success() => {
                        eprintln!("[scheduler] 每日同步完成");
                        last_sync_date = today.clone();
                    }
                    Ok(out) => {
                        eprintln!(
                            "[scheduler] 同步失败: {}",
                            String::from_utf8_lossy(&out.stderr)
                        );
                    }
                    Err(e) => {
                        eprintln!("[scheduler] 同步执行失败: {}", e);
                    }
                }

                let _ = app.emit("daily-sync-finished", "scheduled");
            }
        }
    });
}

// ========== 概念板块时序图 ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeadingStock {
    pub code: String,
    pub name: String,
    pub change_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptBoardItem {
    pub code: String,         // 板块代码
    pub name: String,         // 板块名称
    pub change_percent: f64,  // 涨跌幅
    pub price: f64,           // 最新价
    pub up_count: i64,        // 上涨家数
    pub down_count: i64,      // 下跌家数
    pub leading_code: String, // 领涨股代码（兼容旧字段）
    pub leading_name: String, // 领涨股名称（兼容旧字段）
    pub leading_change: f64,  // 领涨股涨跌幅（兼容旧字段）
    pub amount: f64,          // 成交额(亿)
    #[serde(default)]
    pub top_leading_stocks: Vec<LeadingStock>, // Top N 领涨股
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptDayData {
    pub date: String,
    pub concepts: Vec<ConceptBoardItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConceptTimelineResult {
    pub days: Vec<ConceptDayData>,
    pub cached: bool,
    pub updated_at: String,
}

/// 本地概念板块数据结构（对应 股票概念.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalConceptItem {
    name: String,
    code: String,
    subcodes: Vec<String>,
}

/// 查找数据目录
fn find_data_dir(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut candidates = Vec::new();

    // 1. Tauri resource_dir（打包后）
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        candidates.push(res_dir.join("data"));
    }

    // 2. 可执行文件同级目录
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().map(|d| d.to_path_buf()).unwrap_or_default()) {
        candidates.push(exe_dir.join("data"));
    }

    // 3. 开发模式：项目根目录
    let cwd = std::env::current_dir().unwrap_or_default();
    candidates.push(cwd.join("data"));
    candidates.push(cwd.join("../data"));
    candidates.push(cwd.join("../../data"));

    // 4. 硬编码开发路径（确保开发环境可用）
    candidates.push(std::path::PathBuf::from("/home/zhen/works/Memoa/twine/data"));
    candidates.push(std::path::PathBuf::from("/home/zhen/works/Memoa/data"));

    // 5. 从 Redis 读取已同步的数据目录路径
    // （先不在这里查 Redis，避免循环依赖）

    let found = candidates.into_iter().find(|p| p.exists());
    if let Some(ref dir) = found {
        eprintln!("[find_data_dir] 找到数据目录: {:?}", dir);
    } else {
        eprintln!("[find_data_dir] 未找到数据目录，已搜索所有候选路径");
    }
    found
}

/// 从本地 JSON 文件加载概念板块列表
fn load_concepts_from_local(data_dir: &std::path::Path) -> Option<Vec<LocalConceptItem>> {
    let path = data_dir.join("股票概念.json");
    if !path.exists() {
        eprintln!("[concept] 本地概念文件不存在: {:?}", path);
        return None;
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Vec<LocalConceptItem>>(&content) {
            Ok(items) => {
                eprintln!("[concept] 从本地加载了 {} 个概念", items.len());
                Some(items)
            }
            Err(e) => {
                eprintln!("[concept] 解析概念JSON失败: {}", e);
                None
            }
        },
        Err(e) => {
            eprintln!("[concept] 读取概念文件失败: {}", e);
            None
        }
    }
}

/// 从全部股票.csv加载市值映射 (code -> market_cap)
fn load_stock_market_cap_map(data_dir: &std::path::Path) -> std::collections::HashMap<String, f64> {
    let mut map = std::collections::HashMap::new();
    let csv_path = data_dir.join("全部股票.csv");
    if !csv_path.exists() {
        return map;
    }
    if let Ok(content) = std::fs::read_to_string(&csv_path) {
        for line in content.lines().skip(1) {
            let parts: Vec<&str> = line.splitn(16, ',').collect();
            if parts.len() >= 11 {
                let code = parts[6].replace(".XSHE", "").replace(".XSHG", "");
                // market_cap 是第10列(0-indexed: 9)，circulating_market_cap 是第11列(0-indexed: 10)
                let market_cap = parts[9].parse::<f64>().unwrap_or(0.0);
                if market_cap > 0.0 {
                    map.insert(code, market_cap);
                }
            }
        }
    }
    eprintln!("[market_cap] 加载了 {} 只股票的市值数据", map.len());
    map
}

/// 从 全部股票.csv 加载股票代码 -> 名称映射
fn load_stock_name_map(data_dir: &std::path::Path) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let csv_path = data_dir.join("全部股票.csv");
    if !csv_path.exists() {
        return map;
    }
    if let Ok(content) = std::fs::read_to_string(&csv_path) {
        for line in content.lines().skip(1) {
            let parts: Vec<&str> = line.splitn(16, ',').collect();
            if parts.len() >= 7 {
                let code = parts[6].replace(".XSHE", "").replace(".XSHG", "");
                let name = parts[1].to_string();
                if !name.is_empty() {
                    map.insert(code, name);
                }
            }
        }
    }
    eprintln!("[stock_name] 加载了 {} 只股票的名称映射", map.len());
    map
}

/// 计算加权平均涨跌幅
/// stocks: [(change_pct, market_cap, amount)]
/// 返回: (weighted_change_pct, total_amount, up_count, down_count)
fn compute_weighted_change(stocks: &[(f64, f64, f64)]) -> (f64, f64, i64, i64) {
    let total_cap: f64 = stocks.iter().map(|(_, cap, _)| *cap).sum();
    let total_amount: f64 = stocks.iter().map(|(_, _, amt)| *amt).sum();
    let up_count = stocks.iter().filter(|(c, _, _)| *c > 0.0).count() as i64;
    let down_count = stocks.iter().filter(|(c, _, _)| *c < 0.0).count() as i64;

    let weighted_change = if total_cap > 0.0 {
        // 按市值加权平均
        stocks.iter().map(|(c, cap, _)| c * cap).sum::<f64>() / total_cap
    } else {
        // 无市值数据时简单平均
        stocks.iter().map(|(c, _, _)| c).sum::<f64>() / stocks.len() as f64
    };

    (weighted_change, total_amount, up_count, down_count)
}

/// 从新浪行情获取股票实时报价，按概念/行业聚合计算加权平均涨跌幅
async fn fetch_concept_quotes_sina_weighted<T: HasSubcodes>(
    items: &[T],
    market_cap_map: &std::collections::HashMap<String, f64>,
) -> Vec<ConceptBoardItem> {
    let client = crate::http_client::get_client();

    // 收集所有需要查询的股票代码（去重）
    let mut all_codes: std::collections::HashSet<String> = std::collections::HashSet::new();
    for item in items {
        for code in item.subcodes() {
            all_codes.insert(code.clone());
        }
    }

    // 分批查询新浪行情
    let mut quote_map: std::collections::HashMap<String, SinaQuoteData> =
        std::collections::HashMap::new();

    let codes_vec: Vec<String> = all_codes.into_iter().collect();
    for chunk in codes_vec.chunks(50) {
        let codes_str = chunk.join(",");
        let url = format!("http://hq.sinajs.cn/list={}", codes_str);

        match client
            .get(&url)
            .header("Referer", "https://finance.sina.com.cn/")
            .send()
            .await
        {
            Ok(response) => {
                if let Ok(bytes) = response.bytes().await {
                    let body = decode_gbk_bytes(&bytes);
                    let quotes = parse_quote_body(&body);
                    for q in quotes {
                        let pure_code = q.code.trim_start_matches("sh")
                            .trim_start_matches("sz")
                            .trim_start_matches("bj")
                            .to_string();
                        quote_map.insert(pure_code, q);
                    }
                }
            }
            Err(e) => {
                eprintln!("[weighted] 新浪行情请求失败: {}", e);
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    eprintln!("[weighted] 获取到 {} 只股票的实时行情", quote_map.len());

    // 按概念/行业聚合（加权平均）
    let mut concept_items = Vec::new();

    for item in items {
        // 收集 (change_pct, market_cap, amount)
        let mut stocks: Vec<(f64, f64, f64)> = Vec::new();
        let mut leading_code = String::new();
        let mut leading_name = String::new();
        let mut leading_change = f64::MIN;
        // 收集所有股票涨跌幅用于 Top N 领涨
        let mut all_changes: Vec<(String, String, f64)> = Vec::new(); // (code, name, change_pct)

        for code in item.subcodes() {
            if let Some(quote) = quote_map.get(code) {
                let cap = market_cap_map.get(code).copied().unwrap_or(0.0);
                let change_pct = quote.change_percent;
                // 排除新股上市首日异常涨幅
                if change_pct.abs() > IPO_PCT_THRESHOLD {
                    continue;
                }
                stocks.push((change_pct, cap, quote.amount));
                all_changes.push((code.clone(), quote.name.clone(), change_pct));

                if change_pct > leading_change {
                    leading_change = change_pct;
                    leading_code = code.clone();
                    leading_name = quote.name.clone();
                }
            }
        }

        if stocks.is_empty() {
            continue;
        }

        let (weighted_change, total_amount, up_count, down_count) =
            compute_weighted_change(&stocks);

        // 只保留加权平均涨幅 > 0 的板块
        if weighted_change <= 0.0 {
            continue;
        }

        // 取 Top 6 领涨股
        all_changes.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        let top_leading_stocks: Vec<LeadingStock> = all_changes.iter().take(6)
            .map(|(c, n, ch)| LeadingStock {
                code: c.clone(),
                name: n.clone(),
                change_percent: (ch * 100.0).round() / 100.0,
            })
            .collect();

        concept_items.push(ConceptBoardItem {
            code: item.code().to_string(),
            name: item.name().to_string(),
            change_percent: (weighted_change * 100.0).round() / 100.0,
            price: 0.0,
            up_count,
            down_count,
            leading_code,
            leading_name,
            leading_change: (leading_change * 100.0).round() / 100.0,
            amount: (total_amount / 1e8 * 100.0).round() / 100.0,
            top_leading_stocks,
        });
    }

    // 按涨幅降序排列
    concept_items.sort_by(|a, b| {
        b.change_percent
            .partial_cmp(&a.change_percent)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // 只保留涨幅前 10 名
    concept_items.truncate(10);

    concept_items
}

/// 刷新概念板块当日排行：使用本地概念数据 + 新浪行情（加权平均）
#[tauri::command]
pub async fn concept_timeline_refresh(app_handle: tauri::AppHandle) -> AppResult<ConceptDayData> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let data_dir = find_data_dir(&app_handle)
        .ok_or_else(|| crate::error::AppError::Other("未找到数据目录".to_string()))?;

    let concepts = load_concepts_from_local(&data_dir)
        .ok_or_else(|| crate::error::AppError::Other("未找到本地概念数据文件 股票概念.json".to_string()))?;

    if concepts.is_empty() {
        return Err(crate::error::AppError::Other("本地概念数据为空".to_string()));
    }

    eprintln!("[concept_refresh] 使用本地概念数据({}个) + 新浪行情", concepts.len());

    // 加载股票市值数据用于加权计算
    let market_cap_map = load_stock_market_cap_map(&data_dir);

    let concept_items = fetch_concept_quotes_sina_weighted(&concepts, &market_cap_map).await;

    let day_data = ConceptDayData {
        date: today.clone(),
        concepts: concept_items,
    };

    // 存储到 SQLite
    if let Ok(json_str) = serde_json::to_string(&day_data) {
        let _ = crate::db::financial::concept_timeline_upsert(&today, &json_str);
    }

    Ok(day_data)
}

/// 新股上市首日涨幅阈值（超过此值视为新股异常，排除加权计算）
const IPO_PCT_THRESHOLD: f64 = 44.0;

fn json_value_as_f64(v: &serde_json::Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
}

/// 同步概念板块历史数据：从本地概念数据 + Redis K线缓存计算加权平均涨幅，upsert 到 SQLite
#[tauri::command]
pub async fn concept_timeline_sync(
    app_handle: tauri::AppHandle,
    days: Option<i32>,
) -> AppResult<String> {
    let target_days = days.unwrap_or(15);

    let data_dir = find_data_dir(&app_handle)
        .ok_or_else(|| crate::error::AppError::Other("未找到数据目录".to_string()))?;

    let concepts = load_concepts_from_local(&data_dir)
        .ok_or_else(|| crate::error::AppError::Other("未找到本地概念数据文件".to_string()))?;

    eprintln!("[concept_sync] 从本地加载了 {} 个概念", concepts.len());

    let end_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let start_date = (chrono::Local::now() - chrono::Duration::days(target_days as i64 + 15))
        .format("%Y-%m-%d")
        .to_string();

    // 加载市值数据用于加权计算
    let market_cap_map = load_stock_market_cap_map(&data_dir);
    // 加载股票名称映射
    let name_map = load_stock_name_map(&data_dir);

    // 收集所有股票代码
    let mut all_stock_codes: std::collections::HashSet<String> = std::collections::HashSet::new();
    for concept in &concepts {
        for code in &concept.subcodes {
            all_stock_codes.insert(code.clone());
        }
    }

    eprintln!("[concept_sync] 需要查询 {} 只股票", all_stock_codes.len());

    // 从 Redis 获取已有的 K线数据（由 daily_kline_sync.py 同步）
    let mut kline_map: std::collections::HashMap<String, Vec<(String, f64, f64)>> =
        std::collections::HashMap::new();

    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        let mut cached_count = 0;
        for code in &all_stock_codes {
            let bs_code = build_baostock_code(code);
            let redis_key = format!("memoa:kline:{}", bs_code);
            if let Some(cached) = redis::cmd("GET")
                .arg(&redis_key)
                .query_async::<String>(&mut conn)
                .await
                .ok()
            {
                if let Ok(raw_arr) = serde_json::from_str::<Vec<Vec<serde_json::Value>>>(&cached) {
                    let parsed: Vec<(String, f64, f64)> = raw_arr
                        .into_iter()
                        .filter_map(|row| {
                            if row.len() < 10 {
                                return None;
                            }
                            let date = row[0].as_str()?.to_string();
                            if date < start_date || date > end_date {
                                return None;
                            }
                            let change_pct = json_value_as_f64(&row[9]).unwrap_or(0.0);
                            // 排除新股上市首日异常涨幅
                            if change_pct.abs() > IPO_PCT_THRESHOLD {
                                return None;
                            }
                            let amount = json_value_as_f64(&row[7]).unwrap_or(0.0);
                            Some((date, change_pct, amount))
                        })
                        .collect();
                    if !parsed.is_empty() {
                        kline_map.insert(code.clone(), parsed);
                        cached_count += 1;
                    }
                }
            }
        }
        eprintln!("[concept_sync] 从 Redis 缓存获取了 {} 只股票", cached_count);
    }

    let missing_count = all_stock_codes.iter().filter(|c| !kline_map.contains_key(*c)).count();
    if missing_count > 0 {
        eprintln!("[concept_sync] {} 只股票无K线缓存（需运行 daily_kline_sync.py 同步）", missing_count);
    }

    // 按概念聚合（加权平均）
    let mut daily_map: std::collections::HashMap<String, Vec<ConceptBoardItem>> =
        std::collections::HashMap::new();

    for concept in &concepts {
        // date -> [(change_pct, market_cap, amount)]
        let mut date_stocks: std::collections::HashMap<String, Vec<(f64, f64, f64)>> =
            std::collections::HashMap::new();
        // date -> [(code, change_pct)] 用于取 Top 3 领涨
        let mut date_all_changes: std::collections::HashMap<String, Vec<(String, f64)>> =
            std::collections::HashMap::new();

        for code in &concept.subcodes {
            let cap = market_cap_map.get(code).copied().unwrap_or(0.0);
            if let Some(klines) = kline_map.get(code) {
                for (date, change_pct, amount) in klines {
                    date_stocks
                        .entry(date.clone())
                        .or_default()
                        .push((*change_pct, cap, *amount));

                    date_all_changes
                        .entry(date.clone())
                        .or_default()
                        .push((code.clone(), *change_pct));
                }
            }
        }

        for (date, stocks) in date_stocks {
            if stocks.is_empty() {
                continue;
            }

            let (weighted_change, total_amount, up_count, down_count) =
                compute_weighted_change(&stocks);

            if weighted_change <= 0.0 {
                continue;
            }

            // 取 Top 6 领涨股
            let mut top_changes = date_all_changes.get(&date).cloned().unwrap_or_default();
            top_changes.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            let top_leading_stocks: Vec<LeadingStock> = top_changes.iter().take(6)
                .map(|(c, ch)| {
                    let n = name_map.get(c).cloned().unwrap_or_default();
                    if n.is_empty() && !c.is_empty() {
                        eprintln!("[concept_sync] leading_name MISS for code={} concept={} date={}", c, concept.name, date);
                    }
                    LeadingStock {
                        code: c.clone(),
                        name: n,
                        change_percent: (ch * 100.0).round() / 100.0,
                    }
                })
                .collect();

            let leading = top_changes.first().cloned().unwrap_or_default();
            let leading_name = name_map.get(&leading.0).cloned().unwrap_or_default();

            daily_map
                .entry(date)
                .or_default()
                .push(ConceptBoardItem {
                    code: concept.code.clone(),
                    name: concept.name.clone(),
                    change_percent: (weighted_change * 100.0).round() / 100.0,
                    price: 0.0,
                    up_count,
                    down_count,
                    leading_code: leading.0.clone(),
                    leading_name,
                    leading_change: (leading.1 * 100.0).round() / 100.0,
                    amount: (total_amount / 1e8 * 100.0).round() / 100.0,
                    top_leading_stocks,
                });
        }
    }

    // 存入 SQLite
    let mut stored_count = 0;
    for (date, mut concepts_list) in daily_map {
        concepts_list.sort_by(|a, b| {
            b.change_percent
                .partial_cmp(&a.change_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        concepts_list.truncate(10);

        let day_data = ConceptDayData {
            date: date.clone(),
            concepts: concepts_list,
        };

        if let Ok(json_str) = serde_json::to_string(&day_data) {
            if crate::db::financial::concept_timeline_upsert(&date, &json_str).is_ok() {
                stored_count += 1;
            }
        }
    }

    eprintln!("[concept_sync] 存储了 {} 天的数据到 SQLite", stored_count);

    // 打印最新 3 条记录用于调试
    if let Ok(rows) = crate::db::financial::concept_timeline_list(3) {
        eprintln!("[concept_sync] === SQLite concept_timeline 最新 {} 条 ===", rows.len());
        for (date, json_str) in &rows {
            if let Ok(day_data) = serde_json::from_str::<ConceptDayData>(json_str) {
                let concepts_preview: Vec<String> = day_data.concepts.iter().take(3)
                    .map(|c| format!("{}[+{:.1}% lead={}({}) up={}/{} amount={:.1}亿]",
                        c.name, c.change_percent, c.leading_name, c.leading_code, c.up_count, c.up_count + c.down_count, c.amount))
                    .collect();
                eprintln!("[concept_sync]   {} -> {}", date, concepts_preview.join(", "));
            }
        }
    }

    Ok(format!("synced {} days of concept timeline data", stored_count))
}

/// 查询概念板块时序图数据（从 SQLite 读取）
#[tauri::command]
pub async fn concept_timeline_query(
    days: i32,
) -> AppResult<ConceptTimelineResult> {
    let mut result_days = Vec::new();
    let mut updated_at = String::new();

    // 获取更新时间
    if let Ok(Some(ua)) = crate::db::financial::concept_timeline_updated_at() {
        updated_at = ua;
    }

    // 从 SQLite 读取最近 N 天数据
    if let Ok(rows) = crate::db::financial::concept_timeline_list(days) {
        for (date, json_str) in rows {
            if let Ok(day_data) = serde_json::from_str::<ConceptDayData>(&json_str) {
                result_days.push(day_data);
            }
        }
    }

    // 按日期升序排列
    result_days.sort_by(|a, b| a.date.cmp(&b.date));

    Ok(ConceptTimelineResult {
        days: result_days,
        cached: true,
        updated_at,
    })
}

/// 重置时序图数据：删除已有数据，从本地数据库 + baostock 重新计算最近30个交易日
#[tauri::command]
pub async fn timeline_reset(
    app_handle: tauri::AppHandle,
    mode: String, // "concept" | "industry"
) -> AppResult<String> {
    let days = 30;

    // 1. 删除已有数据
    let deleted = if mode == "concept" {
        crate::db::financial::concept_timeline_delete_all()?
    } else {
        crate::db::financial::industry_timeline_delete_all()?
    };
    eprintln!("[timeline_reset] 删除了 {} 条{}时序数据", deleted, if mode == "concept" { "概念" } else { "行业" });

    // 2. 加载本地板块数据
    let data_dir = match find_data_dir(&app_handle) {
        Some(d) => d,
        None => return Err(crate::error::AppError::Other("未找到数据目录".to_string())),
    };

    let (concepts, is_concept) = if mode == "concept" {
        let c = load_concepts_from_local(&data_dir)
            .ok_or_else(|| crate::error::AppError::Other("未找到本地概念数据文件".to_string()))?;
        (c, true)
    } else {
        let path = data_dir.join("证监会行业.json");
        let content = std::fs::read_to_string(&path)
            .map_err(|e| crate::error::AppError::Other(format!("读取证监会行业.json失败: {}", e)))?;
        let industries: Vec<LocalIndustryItem> = serde_json::from_str(&content)
            .map_err(|e| crate::error::AppError::Other(format!("解析证监会行业.json失败: {}", e)))?;
        let c: Vec<LocalConceptItem> = industries.into_iter()
            .map(|i| LocalConceptItem { name: i.name, code: i.code, subcodes: i.subcodes })
            .collect();
        (c, false)
    };

    eprintln!("[timeline_reset] 从本地加载了 {} 个{}", concepts.len(), if is_concept { "概念" } else { "行业" });

    let end_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let start_date = (chrono::Local::now() - chrono::Duration::days(days as i64 + 15))
        .format("%Y-%m-%d")
        .to_string();

    let market_cap_map = load_stock_market_cap_map(&data_dir);
    let name_map = load_stock_name_map(&data_dir);

    // 3. 收集所有股票代码
    let mut all_stock_codes: std::collections::HashSet<String> = std::collections::HashSet::new();
    for concept in &concepts {
        for code in &concept.subcodes {
            all_stock_codes.insert(code.clone());
        }
    }
    eprintln!("[timeline_reset] 需要查询 {} 只股票", all_stock_codes.len());

    // 4. 从 Redis 获取已有 K 线数据
    let mut kline_map: std::collections::HashMap<String, Vec<(String, f64, f64)>> =
        std::collections::HashMap::new();

    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        for code in &all_stock_codes {
            let bs_code = build_baostock_code(code);
            let redis_key = format!("memoa:kline:{}", bs_code);
            if let Some(cached) = redis::cmd("GET")
                .arg(&redis_key)
                .query_async::<String>(&mut conn)
                .await
                .ok()
            {
                if let Ok(raw_arr) = serde_json::from_str::<Vec<Vec<serde_json::Value>>>(&cached) {
                    let parsed: Vec<(String, f64, f64)> = raw_arr
                        .into_iter()
                        .filter_map(|row| {
                            if row.len() < 10 { return None; }
                            let date = row[0].as_str()?.to_string();
                            if date < start_date || date > end_date { return None; }
                            let change_pct = json_value_as_f64(&row[9]).unwrap_or(0.0);
                            if change_pct.abs() > IPO_PCT_THRESHOLD { return None; }
                            let amount = json_value_as_f64(&row[7]).unwrap_or(0.0);
                            Some((date, change_pct, amount))
                        })
                        .collect();
                    if !parsed.is_empty() {
                        kline_map.insert(code.clone(), parsed);
                    }
                }
            }
        }
    }

    // 5. 对缺失 K 线的股票，使用 baostock Python SDK 补取
    let missing_codes: Vec<String> = all_stock_codes
        .iter()
        .filter(|c| !kline_map.contains_key(*c))
        .cloned()
        .collect();

    let mut python_fetched = 0usize;
    if !missing_codes.is_empty() {
        eprintln!("[timeline_reset] {} 只股票无 Redis 缓存，使用 baostock Python SDK 补取", missing_codes.len());

        // 查找 Python 脚本路径
        let script_path = find_kline_fetch_script(&app_handle);
        if let Some(script) = script_path {
            let bs_codes: Vec<String> = missing_codes.iter().map(|c| build_baostock_code(c)).collect();
            let config = app_handle.state::<crate::config::AppConfig>();
            let args_json = serde_json::json!({
                "redis_url": config.redis_url,
                "codes": bs_codes,
                "start_date": start_date,
                "end_date": end_date,
                "kline_days": 120,
            })
            .to_string();

            let output = tokio::process::Command::new("python3")
                .arg(&script)
                .arg(&args_json)
                .output()
                .await;

            match output {
                Ok(out) if out.status.success() => {
                    if let Ok(result) = serde_json::from_str::<serde_json::Value>(
                        &String::from_utf8_lossy(&out.stdout),
                    ) {
                        python_fetched = result.get("fetched").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                        let failed = result.get("failed").and_then(|v| v.as_u64()).unwrap_or(0);
                        eprintln!("[timeline_reset] Python SDK 补取完成: fetched={}, failed={}", python_fetched, failed);
                    }
                }
                Ok(out) => {
                    eprintln!("[timeline_reset] Python 脚本执行失败: {}", String::from_utf8_lossy(&out.stderr));
                }
                Err(e) => {
                    eprintln!("[timeline_reset] Python 脚本启动失败: {}", e);
                }
            }

            // 从 Redis 重新读取 Python 脚本补取的数据
            if let Some(mut conn) = get_redis_connection(&app_handle).await {
                for code in &missing_codes {
                    if kline_map.contains_key(code) {
                        continue;
                    }
                    let bs_code = build_baostock_code(code);
                    let redis_key = format!("memoa:kline:{}", bs_code);
                    if let Some(cached) = redis::cmd("GET")
                        .arg(&redis_key)
                        .query_async::<String>(&mut conn)
                        .await
                        .ok()
                    {
                        if let Ok(raw_arr) = serde_json::from_str::<Vec<Vec<serde_json::Value>>>(&cached) {
                            let parsed: Vec<(String, f64, f64)> = raw_arr
                                .into_iter()
                                .filter_map(|row| {
                                    if row.len() < 10 { return None; }
                                    let date = row[0].as_str()?.to_string();
                                    if date < start_date || date > end_date { return None; }
                                    let change_pct = json_value_as_f64(&row[9]).unwrap_or(0.0);
                                    if change_pct.abs() > IPO_PCT_THRESHOLD { return None; }
                                    let amount = json_value_as_f64(&row[7]).unwrap_or(0.0);
                                    Some((date, change_pct, amount))
                                })
                                .collect();
                            if !parsed.is_empty() {
                                kline_map.insert(code.clone(), parsed);
                            }
                        }
                    }
                }
            }
        } else {
            eprintln!("[timeline_reset] 未找到 kline_fetch_missing.py 脚本，跳过补取");
        }
    }

    eprintln!("[timeline_reset] K线数据就绪: {} 只股票", kline_map.len());

    // 6. 按板块聚合计算（与 concept_timeline_sync 相同逻辑）
    let mut daily_map: std::collections::HashMap<String, Vec<ConceptBoardItem>> =
        std::collections::HashMap::new();

    for concept in &concepts {
        let mut date_stocks: std::collections::HashMap<String, Vec<(f64, f64, f64)>> =
            std::collections::HashMap::new();
        let mut date_all_changes: std::collections::HashMap<String, Vec<(String, f64)>> =
            std::collections::HashMap::new();

        for code in &concept.subcodes {
            let cap = market_cap_map.get(code).copied().unwrap_or(0.0);
            if let Some(klines) = kline_map.get(code) {
                for (date, change_pct, amount) in klines {
                    date_stocks
                        .entry(date.clone())
                        .or_default()
                        .push((*change_pct, cap, *amount));
                    date_all_changes
                        .entry(date.clone())
                        .or_default()
                        .push((code.clone(), *change_pct));
                }
            }
        }

        for (date, stocks) in date_stocks {
            if stocks.is_empty() { continue; }
            let (weighted_change, total_amount, up_count, down_count) =
                compute_weighted_change(&stocks);
            if weighted_change <= 0.0 { continue; }

            let mut top_changes = date_all_changes.get(&date).cloned().unwrap_or_default();
            top_changes.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            let top_leading_stocks: Vec<LeadingStock> = top_changes.iter().take(6)
                .map(|(c, ch)| {
                    let n = name_map.get(c).cloned().unwrap_or_default();
                    LeadingStock {
                        code: c.clone(),
                        name: n,
                        change_percent: (ch * 100.0).round() / 100.0,
                    }
                })
                .collect();

            let leading = top_changes.first().cloned().unwrap_or_default();
            let leading_name = name_map.get(&leading.0).cloned().unwrap_or_default();

            daily_map
                .entry(date)
                .or_default()
                .push(ConceptBoardItem {
                    code: concept.code.clone(),
                    name: concept.name.clone(),
                    change_percent: (weighted_change * 100.0).round() / 100.0,
                    price: 0.0,
                    up_count,
                    down_count,
                    leading_code: leading.0.clone(),
                    leading_name,
                    leading_change: (leading.1 * 100.0).round() / 100.0,
                    amount: (total_amount / 1e8 * 100.0).round() / 100.0,
                    top_leading_stocks,
                });
        }
    }

    // 7. 存入 SQLite
    let mut stored_count = 0;
    for (date, mut concepts_list) in daily_map {
        concepts_list.sort_by(|a, b| {
            b.change_percent
                .partial_cmp(&a.change_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        concepts_list.truncate(10);

        let day_data = ConceptDayData {
            date: date.clone(),
            concepts: concepts_list,
        };

        if let Ok(json_str) = serde_json::to_string(&day_data) {
            let upsert_result = if is_concept {
                crate::db::financial::concept_timeline_upsert(&date, &json_str)
            } else {
                crate::db::financial::industry_timeline_upsert(&date, &json_str)
            };
            if upsert_result.is_ok() {
                stored_count += 1;
            }
        }
    }

    let msg = format!(
        "重置完成：删除{}条旧数据，重新计算{}天{}时序（{}只股票有K线，{}只从baostock SDK补）",
        deleted,
        stored_count,
        if is_concept { "概念" } else { "行业" },
        kline_map.len() - missing_codes.iter().filter(|c| kline_map.contains_key(*c)).count(),
        python_fetched
    );
    eprintln!("[timeline_reset] {}", msg);
    Ok(msg)
}

/// 本地行业数据结构（对应 证监会行业.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalIndustryItem {
    name: String,
    code: String,
    subcodes: Vec<String>,
}

/// 本地股票数据结构（对应 全部股票.csv 的每一行）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStockItem {
    pub display_name: String,
    pub name: String,
    pub code: String,
    pub start_date: String,
    pub end_date: String,
    pub stock_type: String,
    pub capitalization: Option<f64>,
    pub circulating_cap: Option<f64>,
    pub market_cap: Option<f64>,
    pub circulating_market_cap: Option<f64>,
    pub csrc_industry: String,       // 证监会行业
    pub jq_industry_l2: String,      // 聚宽二级行业
    pub sw_industry_l3: String,      // 申万三级行业
    pub concepts: String,            // 概念（|分隔）
}

/// 同步本地基础数据到 Redis
#[tauri::command]
pub async fn sync_local_data(app_handle: tauri::AppHandle) -> AppResult<String> {
    let data_dir = match find_data_dir(&app_handle) {
        Some(d) => d,
        None => return Err(crate::error::AppError::Other("未找到数据目录".to_string())),
    };

    let mut synced_count = 0;

    // 1. 同步全部股票 CSV
    let stock_csv_path = data_dir.join("全部股票.csv");
    if stock_csv_path.exists() {
        match std::fs::read_to_string(&stock_csv_path) {
            Ok(content) => {
                let mut stocks = Vec::new();
                for line in content.lines().skip(1) {
                    let parts: Vec<&str> = line.splitn(16, ',').collect();
                    if parts.len() >= 15 {
                        let stock = LocalStockItem {
                            display_name: parts[1].to_string(),
                            name: parts[2].to_string(),
                            code: parts[6].to_string(),
                            start_date: parts[3].to_string(),
                            end_date: parts[4].to_string(),
                            stock_type: parts[5].to_string(),
                            capitalization: parts[7].parse().ok(),
                            circulating_cap: parts[8].parse().ok(),
                            market_cap: parts[9].parse().ok(),
                            circulating_market_cap: parts[10].parse().ok(),
                            csrc_industry: parts[11].to_string(),
                            jq_industry_l2: parts[12].to_string(),
                            sw_industry_l3: parts[13].to_string(),
                            concepts: parts[14].to_string(),
                        };
                        stocks.push(stock);
                    }
                }

                if let Some(mut conn) = get_redis_connection(&app_handle).await {
                    // 存储股票列表
                    if let Ok(json_str) = serde_json::to_string(&stocks) {
                        let _ = redis::cmd("SET")
                            .arg("memoa:local:stocks")
                            .arg(&json_str)
                            .query_async::<String>(&mut conn)
                            .await;
                    }

                    // 构建股票代码 -> 行业/概念映射
                    let mut stock_industry_map: std::collections::HashMap<String, String> =
                        std::collections::HashMap::new();
                    let mut stock_concept_map: std::collections::HashMap<String, Vec<String>> =
                        std::collections::HashMap::new();

                    for stock in &stocks {
                        let pure_code = stock.code.replace(".XSHE", "").replace(".XSHG", "");
                        if !stock.csrc_industry.is_empty() {
                            stock_industry_map.insert(pure_code.clone(), stock.csrc_industry.clone());
                        }
                        if !stock.concepts.is_empty() {
                            let concepts: Vec<String> = stock.concepts.split('|')
                                .map(|s| s.to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            if !concepts.is_empty() {
                                stock_concept_map.insert(pure_code, concepts);
                            }
                        }
                    }

                    // 存储映射
                    if let Ok(json_str) = serde_json::to_string(&stock_industry_map) {
                        let _ = redis::cmd("SET")
                            .arg("memoa:local:stock_industry_map")
                            .arg(&json_str)
                            .query_async::<String>(&mut conn)
                            .await;
                    }
                    if let Ok(json_str) = serde_json::to_string(&stock_concept_map) {
                        let _ = redis::cmd("SET")
                            .arg("memoa:local:stock_concept_map")
                            .arg(&json_str)
                            .query_async::<String>(&mut conn)
                            .await;
                    }

                    eprintln!("[sync_local] 同步了 {} 只股票数据", stocks.len());
                    synced_count += 1;
                }
            }
            Err(e) => eprintln!("[sync_local] 读取全部股票.csv失败: {}", e),
        }
    }

    // 2. 同步证监会行业 JSON
    let industry_json_path = data_dir.join("证监会行业.json");
    if industry_json_path.exists() {
        match std::fs::read_to_string(&industry_json_path) {
            Ok(content) => {
                if let Ok(industries) = serde_json::from_str::<Vec<LocalIndustryItem>>(&content) {
                    if let Some(mut conn) = get_redis_connection(&app_handle).await {
                        if let Ok(json_str) = serde_json::to_string(&industries) {
                            let _ = redis::cmd("SET")
                                .arg("memoa:local:csrc_industries")
                                .arg(&json_str)
                                .query_async::<String>(&mut conn)
                                .await;
                        }
                        eprintln!("[sync_local] 同步了 {} 个证监会行业", industries.len());
                        synced_count += 1;
                    }
                }
            }
            Err(e) => eprintln!("[sync_local] 读取证监会行业.json失败: {}", e),
        }
    }

    // 3. 同步概念板块 JSON
    let concept_json_path = data_dir.join("股票概念.json");
    if concept_json_path.exists() {
        match std::fs::read_to_string(&concept_json_path) {
            Ok(content) => {
                if let Ok(concepts) = serde_json::from_str::<Vec<LocalConceptItem>>(&content) {
                    if let Some(mut conn) = get_redis_connection(&app_handle).await {
                        if let Ok(json_str) = serde_json::to_string(&concepts) {
                            let _ = redis::cmd("SET")
                                .arg("memoa:local:concepts")
                                .arg(&json_str)
                                .query_async::<String>(&mut conn)
                                .await;
                        }
                        eprintln!("[sync_local] 同步了 {} 个概念板块", concepts.len());
                        synced_count += 1;
                    }
                }
            }
            Err(e) => eprintln!("[sync_local] 读取股票概念.json失败: {}", e),
        }
    }

    // 4. 同步申万三级行业 CSV
    let sw_csv_path = data_dir.join("申万三级行业.csv");
    if sw_csv_path.exists() {
        match std::fs::read_to_string(&sw_csv_path) {
            Ok(content) => {
                let mut industries = Vec::new();
                for line in content.lines().skip(1) {
                    let parts: Vec<&str> = line.splitn(3, ',').collect();
                    if parts.len() >= 2 {
                        industries.push(serde_json::json!({
                            "code": parts[0],
                            "name": parts[1],
                        }));
                    }
                }
                if let Some(mut conn) = get_redis_connection(&app_handle).await {
                    if let Ok(json_str) = serde_json::to_string(&industries) {
                        let _ = redis::cmd("SET")
                            .arg("memoa:local:sw_l3_industries")
                            .arg(&json_str)
                            .query_async::<String>(&mut conn)
                            .await;
                    }
                    eprintln!("[sync_local] 同步了 {} 个申万三级行业", industries.len());
                    synced_count += 1;
                }
            }
            Err(e) => eprintln!("[sync_local] 读取申万三级行业.csv失败: {}", e),
        }
    }

    // 5. 同步聚宽二级行业 CSV
    let jq_csv_path = data_dir.join("聚宽二级行业.csv");
    if jq_csv_path.exists() {
        match std::fs::read_to_string(&jq_csv_path) {
            Ok(content) => {
                let mut industries = Vec::new();
                for line in content.lines().skip(1) {
                    let parts: Vec<&str> = line.splitn(3, ',').collect();
                    if parts.len() >= 2 {
                        industries.push(serde_json::json!({
                            "code": parts[0],
                            "name": parts[1],
                        }));
                    }
                }
                if let Some(mut conn) = get_redis_connection(&app_handle).await {
                    if let Ok(json_str) = serde_json::to_string(&industries) {
                        let _ = redis::cmd("SET")
                            .arg("memoa:local:jq_l2_industries")
                            .arg(&json_str)
                            .query_async::<String>(&mut conn)
                            .await;
                    }
                    eprintln!("[sync_local] 同步了 {} 个聚宽二级行业", industries.len());
                    synced_count += 1;
                }
            }
            Err(e) => eprintln!("[sync_local] 读取聚宽二级行业.csv失败: {}", e),
        }
    }

    // 记录同步时间
    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = redis::cmd("SET")
            .arg("memoa:local:synced_at")
            .arg(&now)
            .query_async::<String>(&mut conn)
            .await;
    }

    Ok(format!("同步完成，共处理 {} 类数据", synced_count))
}

/// 行业时序图数据结构（复用 ConceptBoardItem）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndustryDayData {
    pub date: String,
    pub industries: Vec<ConceptBoardItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndustryTimelineResult {
    pub days: Vec<IndustryDayData>,
    pub cached: bool,
    pub updated_at: String,
}

/// 刷新行业板块时序图当天数据（加权平均）
#[tauri::command]
pub async fn industry_timeline_refresh(app_handle: tauri::AppHandle) -> AppResult<ConceptDayData> {
    let data_dir = match find_data_dir(&app_handle) {
        Some(d) => d,
        None => return Err(crate::error::AppError::Other("未找到数据目录".to_string())),
    };

    // 从本地加载证监会行业数据
    let path = data_dir.join("证监会行业.json");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| crate::error::AppError::Other(format!("读取证监会行业.json失败: {}", e)))?;
    let industries: Vec<LocalIndustryItem> = serde_json::from_str(&content)
        .map_err(|e| crate::error::AppError::Other(format!("解析证监会行业.json失败: {}", e)))?;

    eprintln!("[industry_refresh] 从本地加载了 {} 个行业", industries.len());

    // 加载市值数据用于加权计算
    let market_cap_map = load_stock_market_cap_map(&data_dir);

    // 使用新浪行情API获取成分股实时报价，按行业聚合（加权平均）
    let industry_items: Vec<ConceptBoardItem> = fetch_concept_quotes_sina_weighted(&industries, &market_cap_map).await;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let day_data = ConceptDayData {
        date: today.clone(),
        concepts: industry_items,
    };

    // 存入 SQLite
    if let Ok(json_str) = serde_json::to_string(&day_data) {
        let _ = crate::db::financial::industry_timeline_upsert(&today, &json_str);
    }

    Ok(day_data)
}

/// Trait for items that have subcodes (concepts, industries)
trait HasSubcodes {
    fn subcodes(&self) -> &[String];
    fn name(&self) -> &str;
    fn code(&self) -> &str;
}

impl HasSubcodes for LocalConceptItem {
    fn subcodes(&self) -> &[String] { &self.subcodes }
    fn name(&self) -> &str { &self.name }
    fn code(&self) -> &str { &self.code }
}

impl HasSubcodes for LocalIndustryItem {
    fn subcodes(&self) -> &[String] { &self.subcodes }
    fn name(&self) -> &str { &self.name }
    fn code(&self) -> &str { &self.code }
}

/// 同步行业板块历史数据：从本地行业数据 + Redis K线缓存计算加权平均涨幅，upsert 到 SQLite
#[tauri::command]
pub async fn industry_timeline_sync(
    app_handle: tauri::AppHandle,
    days: Option<i32>,
) -> AppResult<String> {
    let target_days = days.unwrap_or(15);

    let data_dir = find_data_dir(&app_handle)
        .ok_or_else(|| crate::error::AppError::Other("未找到数据目录".to_string()))?;

    // 从本地加载证监会行业数据
    let path = data_dir.join("证监会行业.json");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| crate::error::AppError::Other(format!("读取证监会行业.json失败: {}", e)))?;
    let industries: Vec<LocalIndustryItem> = serde_json::from_str(&content)
        .map_err(|e| crate::error::AppError::Other(format!("解析证监会行业.json失败: {}", e)))?;

    eprintln!("[industry_sync] 从本地加载了 {} 个行业", industries.len());

    let end_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let start_date = (chrono::Local::now() - chrono::Duration::days(target_days as i64 + 15))
        .format("%Y-%m-%d")
        .to_string();

    // 加载市值数据用于加权计算
    let market_cap_map = load_stock_market_cap_map(&data_dir);
    // 加载股票名称映射
    let name_map = load_stock_name_map(&data_dir);

    // 收集所有股票代码
    let mut all_stock_codes: std::collections::HashSet<String> = std::collections::HashSet::new();
    for industry in &industries {
        for code in &industry.subcodes {
            all_stock_codes.insert(code.clone());
        }
    }

    eprintln!("[industry_sync] 需要查询 {} 只股票", all_stock_codes.len());

    // 从 Redis 获取已有的 K线数据
    let mut kline_map: std::collections::HashMap<String, Vec<(String, f64, f64)>> =
        std::collections::HashMap::new();

    if let Some(mut conn) = get_redis_connection(&app_handle).await {
        let mut cached_count = 0;
        for code in &all_stock_codes {
            let bs_code = build_baostock_code(code);
            let redis_key = format!("memoa:kline:{}", bs_code);
            if let Some(cached) = redis::cmd("GET")
                .arg(&redis_key)
                .query_async::<String>(&mut conn)
                .await
                .ok()
            {
                if let Ok(raw_arr) = serde_json::from_str::<Vec<Vec<serde_json::Value>>>(&cached) {
                    let parsed: Vec<(String, f64, f64)> = raw_arr
                        .into_iter()
                        .filter_map(|row| {
                            if row.len() < 10 {
                                return None;
                            }
                            let date = row[0].as_str()?.to_string();
                            if date < start_date || date > end_date {
                                return None;
                            }
                            let change_pct = json_value_as_f64(&row[9]).unwrap_or(0.0);
                            // 排除新股上市首日异常涨幅
                            if change_pct.abs() > IPO_PCT_THRESHOLD {
                                return None;
                            }
                            let amount = json_value_as_f64(&row[7]).unwrap_or(0.0);
                            Some((date, change_pct, amount))
                        })
                        .collect();
                    if !parsed.is_empty() {
                        kline_map.insert(code.clone(), parsed);
                        cached_count += 1;
                    }
                }
            }
        }
        eprintln!("[industry_sync] 从 Redis 缓存获取了 {} 只股票", cached_count);
    }

    let missing_count = all_stock_codes.iter().filter(|c| !kline_map.contains_key(*c)).count();
    if missing_count > 0 {
        eprintln!("[industry_sync] {} 只股票无K线缓存（需运行 daily_kline_sync.py 同步）", missing_count);
    }

    // 按行业聚合（加权平均）
    let mut daily_map: std::collections::HashMap<String, Vec<ConceptBoardItem>> =
        std::collections::HashMap::new();

    for industry in &industries {
        let mut date_stocks: std::collections::HashMap<String, Vec<(f64, f64, f64)>> =
            std::collections::HashMap::new();
        // date -> [(code, change_pct)] 用于取 Top 3 领涨
        let mut date_all_changes: std::collections::HashMap<String, Vec<(String, f64)>> =
            std::collections::HashMap::new();

        for code in &industry.subcodes {
            let cap = market_cap_map.get(code).copied().unwrap_or(0.0);
            if let Some(klines) = kline_map.get(code) {
                for (date, change_pct, amount) in klines {
                    date_stocks
                        .entry(date.clone())
                        .or_default()
                        .push((*change_pct, cap, *amount));

                    date_all_changes
                        .entry(date.clone())
                        .or_default()
                        .push((code.clone(), *change_pct));
                }
            }
        }

        for (date, stocks) in date_stocks {
            if stocks.is_empty() {
                continue;
            }

            let (weighted_change, total_amount, up_count, down_count) =
                compute_weighted_change(&stocks);

            if weighted_change <= 0.0 {
                continue;
            }

            // 取 Top 6 领涨股
            let mut top_changes = date_all_changes.get(&date).cloned().unwrap_or_default();
            top_changes.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
            let top_leading_stocks: Vec<LeadingStock> = top_changes.iter().take(6)
                .map(|(c, ch)| {
                    let n = name_map.get(c).cloned().unwrap_or_default();
                    if n.is_empty() && !c.is_empty() {
                        eprintln!("[industry_sync] leading_name MISS for code={} industry={} date={}", c, industry.name, date);
                    }
                    LeadingStock {
                        code: c.clone(),
                        name: n,
                        change_percent: (ch * 100.0).round() / 100.0,
                    }
                })
                .collect();

            let leading = top_changes.first().cloned().unwrap_or_default();
            let leading_name = name_map.get(&leading.0).cloned().unwrap_or_default();

            daily_map
                .entry(date)
                .or_default()
                .push(ConceptBoardItem {
                    code: industry.code.clone(),
                    name: industry.name.clone(),
                    change_percent: (weighted_change * 100.0).round() / 100.0,
                    price: 0.0,
                    up_count,
                    down_count,
                    leading_code: leading.0.clone(),
                    leading_name,
                    leading_change: (leading.1 * 100.0).round() / 100.0,
                    amount: (total_amount / 1e8 * 100.0).round() / 100.0,
                    top_leading_stocks,
                });
        }
    }

    // 存入 SQLite
    let mut stored_count = 0;
    for (date, mut industries_list) in daily_map {
        industries_list.sort_by(|a, b| {
            b.change_percent
                .partial_cmp(&a.change_percent)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        industries_list.truncate(10);

        let day_data = ConceptDayData {
            date: date.clone(),
            concepts: industries_list,
        };

        if let Ok(json_str) = serde_json::to_string(&day_data) {
            if crate::db::financial::industry_timeline_upsert(&date, &json_str).is_ok() {
                stored_count += 1;
            }
        }
    }

    eprintln!("[industry_sync] 存储了 {} 天的数据到 SQLite", stored_count);

    // 打印最新 3 条记录用于调试
    if let Ok(rows) = crate::db::financial::industry_timeline_list(3) {
        eprintln!("[industry_sync] === SQLite industry_timeline 最新 {} 条 ===", rows.len());
        for (date, json_str) in &rows {
            if let Ok(day_data) = serde_json::from_str::<ConceptDayData>(json_str) {
                let industries_preview: Vec<String> = day_data.concepts.iter().take(3)
                    .map(|c| format!("{}[+{:.1}% lead={}({}) up={}/{} amount={:.1}亿]",
                        c.name, c.change_percent, c.leading_name, c.leading_code, c.up_count, c.up_count + c.down_count, c.amount))
                    .collect();
                eprintln!("[industry_sync]   {} -> {}", date, industries_preview.join(", "));
            }
        }
    }

    Ok(format!("synced {} days of industry timeline data", stored_count))
}

/// 查询行业板块时序图数据（从 SQLite 读取）
#[tauri::command]
pub async fn industry_timeline_query(
    days: i32,
) -> AppResult<IndustryTimelineResult> {
    let mut result_days = Vec::new();
    let mut updated_at = String::new();

    // 获取更新时间
    if let Ok(Some(ua)) = crate::db::financial::industry_timeline_updated_at() {
        updated_at = ua;
    }

    // 从 SQLite 读取最近 N 天数据
    if let Ok(rows) = crate::db::financial::industry_timeline_list(days) {
        for (date, json_str) in rows {
            if let Ok(day_data) = serde_json::from_str::<ConceptDayData>(&json_str) {
                result_days.push(IndustryDayData {
                    date: day_data.date,
                    industries: day_data.concepts,
                });
            }
        }
    }

    result_days.sort_by(|a, b| a.date.cmp(&b.date));

    Ok(IndustryTimelineResult {
        days: result_days,
        cached: true,
        updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_suggest_basic() {
        let body = r##"var suggestdata_1429775785401="中金岭南,11,000060,sz000060,中金岭南,,中金岭南,99,1,,,;贵州茅台,11,600519,sh600519,贵州茅台,,贵州茅台,99,1,ESG,,;闻泰科技,11,600745,sh600745,*ST闻泰,,*ST闻泰,99,1,ESG,,闻泰科技";"##;

        let results = parse_suggest_body(body);

        assert_eq!(results.len(), 3);

        assert_eq!(results[0].code, "000060");
        assert_eq!(results[0].market, "sz");
        assert_eq!(results[0].full_code, "sz000060");
        assert_eq!(results[0].name, "中金岭南");
        assert_eq!(results[0].item_type, "11");
        assert!(!results[0].has_esg);
        assert!(results[0].alias.is_none());

        assert_eq!(results[1].code, "600519");
        assert_eq!(results[1].market, "sh");
        assert_eq!(results[1].full_code, "sh600519");
        assert_eq!(results[1].name, "贵州茅台");
        assert!(results[1].has_esg);
        assert!(results[1].alias.is_none());

        assert_eq!(results[2].code, "600745");
        assert_eq!(results[2].name, "*ST闻泰");
        assert!(results[2].has_esg);
        assert_eq!(results[2].alias.as_deref(), Some("闻泰科技"));
    }

    #[test]
    fn test_parse_suggest_filters_non_a_stock() {
        let body = r##"var suggestdata_1="香港食品投资,31,00060,00060,香港食品投资,,香港食品投资,99,1,,,;中信证券,31,06030,06030,中信证券,,中信证券,99,1,ESG,,;招商银行,11,600036,sh600036,招商银行,,招商银行,99,1,ESG,,";"##;

        let results = parse_suggest_body(body);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].code, "600036");
        assert_eq!(results[0].name, "招商银行");
    }

    #[test]
    fn test_parse_suggest_empty() {
        let body = r##"var suggestdata_1="";"##;
        let results = parse_suggest_body(body);
        assert!(results.is_empty());

        let body2 = r#"var suggestdata_1=;"#;
        let results2 = parse_suggest_body(body2);
        assert!(results2.is_empty());
    }

    #[test]
    fn test_parse_suggest_max_10() {
        let items: Vec<String> = (0..15)
            .map(|i| format!("股票{},11,6000{},sh6000{},股票{},,股票{},99,1,,,", i, i, i, i, i))
            .collect();
        let body = format!(r##"var suggestdata_1="{}";"##, items.join(";"));

        let results = parse_suggest_body(&body);
        assert_eq!(results.len(), 10);
    }

    #[test]
    fn test_parse_suggest_real_world_data() {
        let body = r##"var suggestdata_1780361549120="中国平安,11,601318,sh601318,中国平安,,中国平安,99,1,ESG,,;苏宁环球,11,000718,sz000718,苏宁环球,,苏宁环球,99,1,,,;招港B,12,201872,sz201872,招港B,,招港B,99,1,,,;张家界,11,000430,sz000430,张家界,,张家界,99,1,,,ST张家界;中光学,11,002189,sz002189,中光学,,中光学,99,1,,,;中红医疗,11,300981,sz300981,中红医疗,,中红医疗,99,1,,,;中小盘,11,399401,sz399401,中小盘,,中小盘,99,1,,,;中关村,11,000931,sz000931,中关村,,中关村,99,1,,,";"##;

        let results = parse_suggest_body(body);

        assert_eq!(results.len(), 7);

        assert_eq!(results[0].code, "601318");
        assert_eq!(results[0].market, "sh");
        assert_eq!(results[0].name, "中国平安");
        assert!(results[0].has_esg);

        assert_eq!(results[1].code, "000718");
        assert_eq!(results[1].market, "sz");
        assert_eq!(results[1].name, "苏宁环球");

        assert_eq!(results[2].code, "000430");
        assert_eq!(results[2].market, "sz");
        assert_eq!(results[2].name, "张家界");
        assert_eq!(results[2].alias.as_deref(), Some("ST张家界"));

        assert_eq!(results[3].code, "002189");
        assert_eq!(results[3].name, "中光学");

        assert_eq!(results[4].code, "300981");
        assert_eq!(results[4].name, "中红医疗");

        assert_eq!(results[5].code, "399401");
        assert_eq!(results[5].name, "中小盘");

        assert_eq!(results[6].code, "000931");
        assert_eq!(results[6].name, "中关村");
    }

    #[test]
    fn test_parse_quote_single_stock() {
        let body = r##"var hq_str_sh600519="贵州茅台,1800.00,1795.00,1812.50,1820.00,1790.00,1812.00,1813.00,32567890,5890123456.00,1500,1812.00,200,1811.00,300,1810.00,500,1809.00,100,1813.00,200,1814.00,300,1815.00,400,1816.00,500,1817.00,600,1818.00,2026-06-02,15:00:00";"##;

        let results = parse_quote_body(body);

        assert_eq!(results.len(), 1);
        let q = &results[0];

        assert_eq!(q.code, "sh600519");
        assert_eq!(q.name, "贵州茅台");
        assert!((q.open - 1800.0).abs() < 0.01);
        assert!((q.yesterday_close - 1795.0).abs() < 0.01);
        assert!((q.current - 1812.5).abs() < 0.01);
        assert!((q.high - 1820.0).abs() < 0.01);
        assert!((q.low - 1790.0).abs() < 0.01);
        assert!((q.buy1 - 1812.0).abs() < 0.01);
        assert!((q.sell1 - 1813.0).abs() < 0.01);
        assert!((q.volume - 32567890.0).abs() < 0.01);
        assert!((q.amount - 5890123456.0).abs() < 0.01);
        assert_eq!(q.date, "2026-06-02");
        assert_eq!(q.time, "15:00:00");

        let expected_change = 1812.5 - 1795.0;
        let expected_pct = (expected_change / 1795.0) * 100.0;
        assert!((q.change - expected_change).abs() < 0.01);
        assert!((q.change_percent - expected_pct).abs() < 0.01);
    }

    #[test]
    fn test_parse_quote_multiple_stocks() {
        let body = r##"var hq_str_sh600519="贵州茅台,1800.00,1795.00,1812.50,1820.00,1790.00,1812.00,1813.00,32567890,5890123456.00,1500,1812.00,200,1811.00,300,1810.00,500,1809.00,100,1813.00,200,1814.00,300,1815.00,400,1816.00,500,1817.00,600,1818.00,2026-06-02,15:00:00";
var hq_str_sz000001="平安银行,12.50,12.30,12.68,12.75,12.28,12.67,12.69,98765432,1234567890.00,500,12.67,600,12.66,700,12.65,800,12.64,900,12.69,100,12.70,200,12.71,300,12.72,400,12.73,500,12.74,2026-06-02,15:00:00";"##;

        let results = parse_quote_body(body);

        assert_eq!(results.len(), 2);

        assert_eq!(results[0].code, "sh600519");
        assert_eq!(results[0].name, "贵州茅台");
        assert!((results[0].current - 1812.5).abs() < 0.01);

        assert_eq!(results[1].code, "sz000001");
        assert_eq!(results[1].name, "平安银行");
        assert!((results[1].current - 12.68).abs() < 0.01);
        assert!((results[1].yesterday_close - 12.30).abs() < 0.01);

        let expected_change = 12.68 - 12.30;
        let expected_pct = (expected_change / 12.30) * 100.0;
        assert!((results[1].change - expected_change).abs() < 0.01);
        assert!((results[1].change_percent - expected_pct).abs() < 0.01);
    }

    #[test]
    fn test_parse_quote_limit_down() {
        let body = r##"var hq_str_sz000060="中金岭南,8.50,9.44,8.50,8.55,8.50,8.49,8.50,54321000,462735000.00,100,8.49,200,8.48,300,8.47,400,8.46,500,8.50,100,8.51,200,8.52,300,8.53,400,8.54,500,8.55,2026-06-02,14:30:00";"##;

        let results = parse_quote_body(body);
        assert_eq!(results.len(), 1);

        let q = &results[0];
        assert_eq!(q.name, "中金岭南");
        assert!((q.current - 8.50).abs() < 0.01);
        assert!((q.yesterday_close - 9.44).abs() < 0.01);

        let expected_change = 8.50 - 9.44;
        assert!(expected_change < 0.0);
        assert!((q.change - expected_change).abs() < 0.01);
        assert!(q.change_percent < 0.0);
    }

    #[test]
    fn test_parse_quote_empty_response() {
        let body = "";
        let results = parse_quote_body(body);
        assert!(results.is_empty());

        let body2 = r##"var hq_str_sh600519="";"##;
        let results2 = parse_quote_body(body2);
        assert!(results2.is_empty());
    }

    #[test]
    fn test_parse_quote_insufficient_fields() {
        let body = r##"var hq_str_sh600519="贵州茅台,1800.00,1795.00";"##;
        let results = parse_quote_body(body);
        assert!(results.is_empty());
    }

    #[test]
    fn test_build_kline_code() {
        assert_eq!(build_kline_code("600519"), "sh600519");
        assert_eq!(build_kline_code("000001"), "sz000001");
        assert_eq!(build_kline_code("300750"), "sz300750");
        assert_eq!(build_kline_code("430047"), "bj430047");
        assert_eq!(build_kline_code("830946"), "bj830946");
        assert_eq!(build_kline_code("sh600519"), "sh600519");
        assert_eq!(build_kline_code("sz000001"), "sz000001");
        assert_eq!(build_kline_code("s_sh000001"), "s_sh000001");
    }

    #[test]
    fn test_build_baostock_code() {
        assert_eq!(build_baostock_code("600519"), "sh.600519");
        assert_eq!(build_baostock_code("000001"), "sz.000001");
        assert_eq!(build_baostock_code("300750"), "sz.300750");
        assert_eq!(build_baostock_code("430047"), "bj.430047");
        assert_eq!(build_baostock_code("sh.600519"), "sh.600519");
        assert_eq!(build_baostock_code("sz.000001"), "sz.000001");
    }

    #[test]
    fn test_kline_image_url() {
        let url = kline_image_url("600519".to_string(), "daily".to_string());
        assert_eq!(url, "https://image.sinajs.cn/newchart/daily/n/sh600519.gif");

        let url2 = kline_image_url("000001".to_string(), "weekly".to_string());
        assert_eq!(url2, "https://image.sinajs.cn/newchart/weekly/n/sz000001.gif");

        let url3 = kline_image_url("sh600519".to_string(), "monthly".to_string());
        assert_eq!(url3, "https://image.sinajs.cn/newchart/monthly/n/sh600519.gif");
    }

    #[test]
    fn test_index_kline_image_url() {
        let url = index_kline_image_url("sh000001".to_string(), "daily".to_string());
        assert_eq!(url, "https://image.sinajs.cn/newchart/daily/n/sh000001.gif");

        let url2 = index_kline_image_url("sz399001".to_string(), "min".to_string());
        assert_eq!(url2, "https://image.sinajs.cn/newchart/min/n/sz399001.gif");
    }

    #[test]
    fn test_suggest_item_serialization() {
        let item = StockSuggestItem {
            code: "600519".to_string(),
            market: "sh".to_string(),
            full_code: "sh600519".to_string(),
            name: "贵州茅台".to_string(),
            item_type: "11".to_string(),
            has_esg: true,
            alias: None,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"fullCode\""));
        assert!(json.contains("\"hasEsg\""));
        assert!(json.contains("\"itemType\""));
        assert!(!json.contains("\"full_code\""));
        assert!(!json.contains("\"has_esg\""));
    }

    #[test]
    fn test_quote_data_serialization() {
        let item = SinaQuoteData {
            code: "sh600519".to_string(),
            name: "贵州茅台".to_string(),
            open: 1800.0,
            yesterday_close: 1795.0,
            current: 1812.5,
            high: 1820.0,
            low: 1790.0,
            buy1_vol: 100.0,
            buy1: 1812.0,
            buy2_vol: 200.0,
            buy2: 1811.0,
            buy3_vol: 300.0,
            buy3: 1810.0,
            buy4_vol: 400.0,
            buy4: 1809.0,
            buy5_vol: 500.0,
            buy5: 1808.0,
            sell1_vol: 150.0,
            sell1: 1813.0,
            sell2_vol: 250.0,
            sell2: 1814.0,
            sell3_vol: 350.0,
            sell3: 1815.0,
            sell4_vol: 450.0,
            sell4: 1816.0,
            sell5_vol: 550.0,
            sell5: 1817.0,
            volume: 32567890.0,
            amount: 5890123456.0,
            date: "2026-06-02".to_string(),
            time: "15:00:00".to_string(),
            change: 17.5,
            change_percent: 0.975,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"yesterdayClose\""));
        assert!(json.contains("\"changePercent\""));
        assert!(json.contains("\"buy1\""));
        assert!(!json.contains("\"yesterday_close\""));
        assert!(!json.contains("\"change_percent\""));
    }

    #[test]
    fn test_kline_data_serialization() {
        let item = BaoStockKLine {
            date: "2026-06-02".to_string(),
            code: "sh.600519".to_string(),
            open: 1800.0,
            high: 1820.0,
            low: 1790.0,
            close: 1812.5,
            preclose: 1795.0,
            volume: 32567.0,
            amount: 5890123456.0,
            adjustflag: "3".to_string(),
            turn: 2.59,
            tradestatus: "1".to_string(),
            pct_chg: 0.975,
            is_st: false,
        };

        let json = serde_json::to_string(&item).unwrap();
        assert!(json.contains("\"pctChg\""));
        assert!(json.contains("\"isSt\""));
        assert!(!json.contains("\"pct_chg\""));
        assert!(!json.contains("\"is_st\""));
    }

    #[test]
    fn test_parse_quote_real_world_multi() {
        let body = r##"var hq_str_sh600519="贵州茅台,1800.00,1795.00,1812.50,1820.00,1790.00,1812.00,1813.00,32567890,5890123456.00,1500,1812.00,200,1811.00,300,1810.00,500,1809.00,100,1813.00,200,1814.00,300,1815.00,400,1816.00,500,1817.00,600,1818.00,2026-06-02,15:00:00";
var hq_str_sz000001="平安银行,12.50,12.30,12.68,12.75,12.28,12.67,12.69,98765432,1234567890.00,500,12.67,600,12.66,700,12.65,800,12.64,900,12.69,100,12.70,200,12.71,300,12.72,400,12.73,500,12.74,2026-06-02,15:00:00";
var hq_str_sh601318="中国平安,48.50,47.80,49.20,49.50,48.00,49.19,49.20,123456789,6012345678.00,800,49.19,900,49.18,1000,49.17,1100,49.16,1200,49.20,100,49.21,200,49.22,300,49.23,400,49.24,500,49.25,2026-06-02,15:00:00";
var hq_str_sh600036="招商银行,35.20,35.00,35.68,35.80,35.10,35.67,35.68,87654321,3123456789.00,600,35.67,700,35.66,800,35.65,900,35.64,1000,35.68,100,35.69,200,35.70,300,35.71,400,35.72,500,35.73,2026-06-02,15:00:00";
var hq_str_sz000858="五粮液,156.80,155.50,158.20,159.00,156.00,158.19,158.20,54321678,8567890123.00,300,158.19,400,158.18,500,158.17,600,158.16,700,158.20,100,158.21,200,158.22,300,158.23,400,158.24,500,158.25,2026-06-02,15:00:00";"##;

        let results = parse_quote_body(body);

        assert_eq!(results.len(), 5);

        assert_eq!(results[0].name, "贵州茅台");
        assert!((results[0].current - 1812.50).abs() < 0.01);

        assert_eq!(results[1].name, "平安银行");
        assert!((results[1].change - 0.38).abs() < 0.01);

        assert_eq!(results[2].name, "中国平安");
        assert!((results[2].change - 1.40).abs() < 0.01);

        assert_eq!(results[3].name, "招商银行");
        assert!((results[3].change_percent - (0.68 / 35.0 * 100.0)).abs() < 0.1);

        assert_eq!(results[4].name, "五粮液");
        assert!((results[4].current - 158.20).abs() < 0.01);
    }

    #[test]
    fn test_parse_suggest_mixed_types() {
        let body = r##"var suggestdata_1="贵州茅台,11,600519,sh600519,贵州茅台,,贵州茅台,99,1,ESG,,;香港食品投资,31,00060,00060,香港食品投资,,香港食品投资,99,1,,,;宁德时代,11,300750,sz300750,宁德时代,,宁德时代,99,1,ESG,,;鸿腾精密,31,06088,06088,鸿腾精密,,鸿腾精密,99,1,,,;平安银行,11,000001,sz000001,平安银行,,平安银行,99,1,,,";"##;

        let results = parse_suggest_body(body);

        assert_eq!(results.len(), 3);

        assert_eq!(results[0].code, "600519");
        assert_eq!(results[0].market, "sh");
        assert_eq!(results[0].name, "贵州茅台");
        assert!(results[0].has_esg);

        assert_eq!(results[1].code, "300750");
        assert_eq!(results[1].market, "sz");
        assert_eq!(results[1].name, "宁德时代");

        assert_eq!(results[2].code, "000001");
        assert_eq!(results[2].market, "sz");
        assert_eq!(results[2].name, "平安银行");
    }
}
