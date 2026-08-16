// 混合检索融合排序
//
// Reciprocal Rank Fusion (RRF):
//   将 BM25 关键词检索和向量语义检索的结果合并去重排序
//
// 算法:
//   RRF_score = w_bm25 * sum(1 / (k_bm25 + rank_i)) + w_vector * sum(1 / (k_vector + rank_i))
//   其中 k=60 (经典超参数), rank_i 从 0 开始
//   默认权重: BM25=0.55, Vector=0.45 (BM25 精确匹配略高)
//
// 优势:
//   - 无需归一化分数 (关键词和向量的 score 尺度不同)
//   - 同一文档出现在两个结果集中时分数加权
//   - 不依赖模型训练，简单有效
//   - 权重可调，支持偏好精确匹配或语义匹配

use crate::commands::ai::VectorSearchResult;

const DEFAULT_K_BM25: f64 = 60.0;
const DEFAULT_K_VECTOR: f64 = 60.0;
const DEFAULT_BM25_WEIGHT: f64 = 0.55;
const DEFAULT_VECTOR_WEIGHT: f64 = 0.45;

#[derive(Debug, Clone)]
pub struct FusionHit {
    pub note_id: String,
    pub note_title: String,
    pub chunk_index: u32,
    pub text: String,
    pub score: f64,
    pub source: FusionSource,
    pub chunk_offset: u64,
    pub chunk_length: u64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FusionSource {
    Vector,
    Bm25,
    Both,
}

pub struct FusionConfig {
    pub k_bm25: f64,
    pub k_vector: f64,
    pub bm25_weight: f64,
    pub vector_weight: f64,
}

impl Default for FusionConfig {
    fn default() -> Self {
        Self {
            k_bm25: DEFAULT_K_BM25,
            k_vector: DEFAULT_K_VECTOR,
            bm25_weight: DEFAULT_BM25_WEIGHT,
            vector_weight: DEFAULT_VECTOR_WEIGHT,
        }
    }
}

impl FusionConfig {
    pub fn keyword_focused() -> Self {
        Self {
            bm25_weight: 0.70,
            vector_weight: 0.30,
            ..Default::default()
        }
    }

    pub fn semantic_focused() -> Self {
        Self {
            bm25_weight: 0.30,
            vector_weight: 0.70,
            ..Default::default()
        }
    }
}

pub fn reciprocal_rank_fusion(
    bm25_results: &[FusionInput],
    vector_results: &[FusionInput],
    k: f64,
    top_k: usize,
) -> Vec<FusionHit> {
    weighted_reciprocal_rank_fusion(bm25_results, vector_results, &FusionConfig::default(), top_k)
}

pub fn weighted_reciprocal_rank_fusion(
    bm25_results: &[FusionInput],
    vector_results: &[FusionInput],
    config: &FusionConfig,
    top_k: usize,
) -> Vec<FusionHit> {
    let mut fused: std::collections::HashMap<String, (FusionHit, f64)> = std::collections::HashMap::new();

    for (rank, item) in bm25_results.iter().enumerate() {
        let rrf = config.bm25_weight / (config.k_bm25 + rank as f64 + 1.0);
        let key = format!("{}::{}", item.source_id, item.chunk_index);
        fused
            .entry(key)
            .and_modify(|(hit, s)| {
                *s += rrf;
                hit.score = *s;
                hit.source = FusionSource::Both;
                if item.note_title.len() > hit.note_title.len() {
                    hit.note_title = item.note_title.clone();
                }
            })
            .or_insert_with(|| {
                (
                    FusionHit {
                        note_id: item.source_id.clone(),
                        note_title: item.note_title.clone(),
                        chunk_index: item.chunk_index,
                        text: item.text.clone(),
                        score: rrf,
                        source: FusionSource::Bm25,
                        chunk_offset: item.chunk_offset,
                        chunk_length: item.chunk_length,
                    },
                    rrf,
                )
            });
    }

    for (rank, item) in vector_results.iter().enumerate() {
        let rrf = config.vector_weight / (config.k_vector + rank as f64 + 1.0);
        let key = format!("{}::{}", item.source_id, item.chunk_index);
        fused
            .entry(key)
            .and_modify(|(hit, s)| {
                *s += rrf;
                hit.score = *s;
                hit.source = FusionSource::Both;
                if item.note_title.len() > hit.note_title.len() {
                    hit.note_title = item.note_title.clone();
                }
            })
            .or_insert_with(|| {
                (
                    FusionHit {
                        note_id: item.source_id.clone(),
                        note_title: item.note_title.clone(),
                        chunk_index: item.chunk_index,
                        text: item.text.clone(),
                        score: rrf,
                        source: FusionSource::Vector,
                        chunk_offset: item.chunk_offset,
                        chunk_length: item.chunk_length,
                    },
                    rrf,
                )
            });
    }

    let mut sorted: Vec<_> = fused.into_values().collect();
    sorted.sort_by(|(_, a), (_, b)| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
    sorted.truncate(top_k);

    sorted.into_iter().map(|(hit, _)| hit).collect()
}

pub fn fusion_hits_to_vector_results(hits: Vec<FusionHit>) -> Vec<VectorSearchResult> {
    hits.into_iter()
        .map(|h| VectorSearchResult {
            note_id: h.note_id,
            note_title: h.note_title,
            chunk_index: h.chunk_index,
            text: h.text,
            score: h.score,
            chunk_offset: h.chunk_offset,
            chunk_length: h.chunk_length,
        })
        .collect()
}

#[derive(Debug, Clone)]
pub struct FusionInput {
    pub source_id: String,
    pub note_title: String,
    pub chunk_index: u32,
    pub text: String,
    pub score: f64,
    pub chunk_offset: u64,
    pub chunk_length: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rrf_dedup() {
        let bm25 = vec![FusionInput {
            source_id: "a.md".into(),
            note_title: "A".into(),
            chunk_index: 0,
            text: "bm25 hit".into(),
            score: 1.0,
            chunk_offset: 0,
            chunk_length: 0,
        }];
        let vec = vec![FusionInput {
            source_id: "a.md".into(),
            note_title: "A better".into(),
            chunk_index: 0,
            text: "vector hit".into(),
            score: 1.0,
            chunk_offset: 0,
            chunk_length: 0,
        }];
        let fused = reciprocal_rank_fusion(&bm25, &vec, 60.0, 5);
        assert_eq!(fused.len(), 1);
        assert!(fused[0].score > 0.0);
    }
}