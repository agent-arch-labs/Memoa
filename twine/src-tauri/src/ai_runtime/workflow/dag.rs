use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDef {
    pub name: String,
    pub description: Option<String>,
    pub nodes: Vec<NodeDef>,
    pub edges: Vec<EdgeDef>,
    #[serde(default)]
    pub config: WorkflowConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDef {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub config: Value,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeDef {
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub condition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowConfig {
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    #[serde(default)]
    pub max_retries: u32,
}

fn default_timeout() -> u64 {
    300
}

pub type NodeMap = HashMap<String, NodeDef>;
pub type AdjacencyMap = HashMap<String, Vec<String>>;

pub fn validate_dag(nodes: &[NodeDef], edges: &[EdgeDef]) -> Result<(), String> {
    let node_ids: HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();

    for edge in edges {
        if !node_ids.contains(edge.source.as_str()) {
            return Err(format!("Edge source '{}' not found in nodes", edge.source));
        }
        if !node_ids.contains(edge.target.as_str()) {
            return Err(format!("Edge target '{}' not found in nodes", edge.target));
        }
    }

    let adj = build_adjacency(nodes, edges);
    let sorted = topological_sort(&adj, &node_ids)?;

    if sorted.len() != node_ids.len() {
        return Err("Cycle detected in DAG".to_string());
    }

    Ok(())
}

pub fn build_adjacency(nodes: &[NodeDef], edges: &[EdgeDef]) -> AdjacencyMap {
    let mut adj: AdjacencyMap = HashMap::new();
    for node in nodes {
        adj.entry(node.id.clone()).or_default();
    }
    for edge in edges {
        adj.entry(edge.source.clone())
            .or_default()
            .push(edge.target.clone());
    }
    adj
}

pub fn topological_sort(
    adj: &AdjacencyMap,
    node_ids: &HashSet<&str>,
) -> Result<Vec<String>, String> {
    let mut in_degree: HashMap<&str, usize> = HashMap::new();

    for id in node_ids.iter() {
        in_degree.entry(id).or_insert(0);
    }

    for (_, targets) in adj.iter() {
        for target in targets {
            *in_degree.get_mut(target.as_str()).unwrap() += 1;
        }
    }

    let mut queue: Vec<&str> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut sorted: Vec<String> = Vec::new();

    while let Some(node) = queue.pop() {
        sorted.push(node.to_string());
        if let Some(targets) = adj.get(node) {
            for target in targets {
                let entry = in_degree.get_mut(target.as_str()).unwrap();
                *entry -= 1;
                if *entry == 0 {
                    queue.push(target);
                }
            }
        }
    }

    for (&id, &deg) in in_degree.iter() {
        if deg > 0 {
            return Err(format!("Cycle detected involving node '{}'", id));
        }
    }

    Ok(sorted)
}

pub fn find_entry_nodes(adj: &AdjacencyMap, nodes: &[NodeDef]) -> Vec<NodeDef> {
    let targets: HashSet<&str> = adj
        .values()
        .flat_map(|v| v.iter().map(|s| s.as_str()))
        .collect();

    nodes
        .iter()
        .filter(|n| !targets.contains(n.id.as_str()))
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_nodes() -> Vec<NodeDef> {
        vec![
            NodeDef {
                id: "retrieve".to_string(),
                node_type: "search".to_string(),
                config: serde_json::json!({"top_k": 10}),
                label: None,
            },
            NodeDef {
                id: "rerank".to_string(),
                node_type: "rerank".to_string(),
                config: serde_json::json!({}),
                label: None,
            },
            NodeDef {
                id: "generate".to_string(),
                node_type: "llm".to_string(),
                config: serde_json::json!({"max_tokens": 1024}),
                label: None,
            },
        ]
    }

    fn sample_edges() -> Vec<EdgeDef> {
        vec![
            EdgeDef {
                source: "retrieve".to_string(),
                target: "rerank".to_string(),
                condition: None,
            },
            EdgeDef {
                source: "rerank".to_string(),
                target: "generate".to_string(),
                condition: None,
            },
        ]
    }

    #[test]
    fn test_validate_valid_dag() {
        let nodes = sample_nodes();
        let edges = sample_edges();
        assert!(validate_dag(&nodes, &edges).is_ok());
    }

    #[test]
    fn test_validate_cycle_detected() {
        let nodes = sample_nodes();
        let edges = vec![
            EdgeDef {
                source: "retrieve".to_string(),
                target: "rerank".to_string(),
                condition: None,
            },
            EdgeDef {
                source: "rerank".to_string(),
                target: "retrieve".to_string(),
                condition: None,
            },
        ];
        assert!(validate_dag(&nodes, &edges).is_err());
    }

    #[test]
    fn test_validate_missing_node() {
        let nodes = sample_nodes();
        let edges = vec![EdgeDef {
            source: "retrieve".to_string(),
            target: "nonexistent".to_string(),
            condition: None,
        }];
        assert!(validate_dag(&nodes, &edges).is_err());
    }

    #[test]
    fn test_find_entry_nodes() {
        let nodes = sample_nodes();
        let edges = sample_edges();
        let adj = build_adjacency(&nodes, &edges);
        let entries = find_entry_nodes(&adj, &nodes);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "retrieve");
    }

    #[test]
    fn test_workflow_serialization() {
        let wf = WorkflowDef {
            name: "test".to_string(),
            description: None,
            nodes: sample_nodes(),
            edges: sample_edges(),
            config: WorkflowConfig {
                timeout_secs: 60,
                max_retries: 1,
            },
        };
        let json = serde_json::to_string(&wf).unwrap();
        let parsed: WorkflowDef = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "test");
        assert_eq!(parsed.nodes.len(), 3);
        assert_eq!(parsed.edges.len(), 2);
        assert_eq!(parsed.config.timeout_secs, 60);
    }

    #[test]
    fn test_topological_sort_simple() {
        let nodes = sample_nodes();
        let edges = sample_edges();
        let adj = build_adjacency(&nodes, &edges);
        let node_ids: HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
        let sorted = topological_sort(&adj, &node_ids).unwrap();
        assert_eq!(sorted.len(), 3);
        let retrieve_idx = sorted.iter().position(|s| s == "retrieve").unwrap();
        let rerank_idx = sorted.iter().position(|s| s == "rerank").unwrap();
        let generate_idx = sorted.iter().position(|s| s == "generate").unwrap();
        assert!(retrieve_idx < rerank_idx);
        assert!(rerank_idx < generate_idx);
    }
}