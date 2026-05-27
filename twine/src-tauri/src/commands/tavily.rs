use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct TavilySearchRequest {
    pub api_key: String,
    pub query: String,
    pub search_depth: String,
    pub max_results: u32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TavilyResult {
    pub title: String,
    pub url: String,
    pub content: String,
    #[serde(default)]
    pub score: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TavilySearchResponse {
    pub results: Vec<TavilyResult>,
    #[serde(default)]
    pub answer: Option<String>,
}

#[tauri::command]
pub async fn tavily_search(query: String, api_key: String) -> AppResult<TavilySearchResponse> {
    let client = reqwest::Client::new();
    let body = TavilySearchRequest {
        api_key,
        query,
        search_depth: "basic".to_string(),
        max_results: 20,
    };

    let response = client
        .post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await?;

    let search_result: TavilySearchResponse = response.json().await?;
    Ok(search_result)
}