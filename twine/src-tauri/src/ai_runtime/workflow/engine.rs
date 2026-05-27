use crate::ai_runtime::workflow::dag::{NodeDef, WorkflowDef};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeResult {
    pub node_id: String,
    pub status: NodeStatus,
    pub output: Option<Value>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum NodeStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub workflow_name: String,
    pub status: WorkflowStatus,
    pub node_results: Vec<NodeResult>,
    pub final_output: Option<Value>,
    pub total_duration_ms: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WorkflowStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

pub struct WorkflowExecutor {
    pub definition: WorkflowDef,
    results: HashMap<String, NodeResult>,
    context: Value,
}

impl WorkflowExecutor {
    pub fn new(definition: WorkflowDef) -> Self {
        Self {
            results: HashMap::new(),
            context: serde_json::json!({}),
            definition,
        }
    }

    pub fn set_context(&mut self, context: Value) {
        self.context = context;
    }

    pub fn execute_pending(
        &mut self,
        node_id: &str,
        output: Value,
    ) -> Result<(), String> {
        let node = match self.definition.nodes.iter().find(|n| n.id == node_id) {
            Some(n) => n.clone(),
            None => return Err(format!("Node '{}' not found", node_id)),
        };

        let start = std::time::Instant::now();

        match self.execute_node(&node, &output) {
            Ok(result) => {
                let duration = start.elapsed().as_millis() as u64;
                self.results.insert(
                    node_id.to_string(),
                    NodeResult {
                        node_id: node_id.to_string(),
                        status: NodeStatus::Completed,
                        output: Some(result),
                        error: None,
                        duration_ms: duration,
                    },
                );
                Ok(())
            }
            Err(e) => {
                let duration = start.elapsed().as_millis() as u64;
                self.results.insert(
                    node_id.to_string(),
                    NodeResult {
                        node_id: node_id.to_string(),
                        status: NodeStatus::Failed,
                        output: None,
                        error: Some(e.clone()),
                        duration_ms: duration,
                    },
                );
                Err(e)
            }
        }
    }

    pub fn execute_all(&mut self) -> WorkflowResult {
        let start = std::time::Instant::now();

        let adj = crate::ai_runtime::workflow::dag::build_adjacency(
            &self.definition.nodes,
            &self.definition.edges,
        );

        let sorted = match crate::ai_runtime::workflow::dag::topological_sort(
            &adj,
            &self.definition
                .nodes
                .iter()
                .map(|n| n.id.as_str())
                .collect(),
        ) {
            Ok(s) => s,
            Err(e) => {
                return WorkflowResult {
                    workflow_name: self.definition.name.clone(),
                    status: WorkflowStatus::Failed,
                    node_results: vec![],
                    final_output: None,
                    total_duration_ms: start.elapsed().as_millis() as u64,
                    error: Some(e),
                };
            }
        };

        let mut last_output: Option<Value> = None;

        for node_id in sorted.iter() {
            let node = self
                .definition
                .nodes
                .iter()
                .find(|n| &n.id == node_id)
                .cloned();

            match node {
                Some(n) => {
                    let input = self.collect_inputs(&adj, &n);
                    match self.execute_node(&n, &input) {
                        Ok(output) => {
                            self.results.insert(
                                node_id.clone(),
                                NodeResult {
                                    node_id: node_id.clone(),
                                    status: NodeStatus::Completed,
                                    output: Some(output.clone()),
                                    error: None,
                                    duration_ms: 0,
                                },
                            );
                            last_output = Some(output);
                        }
                        Err(e) => {
                            self.results.insert(
                                node_id.clone(),
                                NodeResult {
                                    node_id: node_id.clone(),
                                    status: NodeStatus::Failed,
                                    output: None,
                                    error: Some(e.clone()),
                                    duration_ms: 0,
                                },
                            );
                            return WorkflowResult {
                                workflow_name: self.definition.name.clone(),
                                status: WorkflowStatus::Failed,
                                node_results: self.results.values().cloned().collect(),
                                final_output: None,
                                total_duration_ms: start.elapsed().as_millis() as u64,
                                error: Some(e),
                            };
                        }
                    }
                }
                None => {}
            }
        }

        WorkflowResult {
            workflow_name: self.definition.name.clone(),
            status: WorkflowStatus::Completed,
            node_results: self.results.values().cloned().collect(),
            final_output: last_output,
            total_duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        }
    }

    fn execute_node(&self, node: &NodeDef, input: &Value) -> Result<Value, String> {
        match node.node_type.as_str() {
            "search" | "retrieve" => {
                let query = input["query"].as_str().unwrap_or("");
                Ok(serde_json::json!({
                    "status": "ok",
                    "node": node.id,
                    "query": query,
                    "results": [],
                    "message": format!("Search node '{}' executed", node.id)
                }))
            }
            "rerank" => Ok(serde_json::json!({
                "status": "ok",
                "node": node.id,
                "message": format!("Rerank node '{}' executed", node.id)
            })),
            "llm" | "generate" => {
                let context = input["context"].as_str().unwrap_or("");
                Ok(serde_json::json!({
                    "status": "ok",
                    "node": node.id,
                    "context": context,
                    "message": format!("LLM node '{}' executed", node.id)
                }))
            }
            "condition" => {
                let cond = node.config["condition"].as_str().unwrap_or("true");
                Ok(serde_json::json!({
                    "status": "ok",
                    "node": node.id,
                    "condition": cond,
                    "result": true
                }))
            }
            "branch" => {
                let selected = node.config["default"].as_str().unwrap_or("");
                Ok(serde_json::json!({
                    "status": "ok",
                    "node": node.id,
                    "branch": selected
                }))
            }
            _ => Err(format!("Unknown node type: {}", node.node_type)),
        }
    }

    fn collect_inputs(&self, adj: &crate::ai_runtime::workflow::dag::AdjacencyMap, node: &NodeDef) -> Value {
        let predecessors: Vec<&str> = adj
            .iter()
            .filter(|(_, targets)| targets.contains(&node.id))
            .map(|(src, _)| src.as_str())
            .collect();

        if predecessors.is_empty() {
            return self.context.clone();
        }

        let mut combined = serde_json::json!({});
        for pred in predecessors {
            if let Some(result) = self.results.get(pred) {
                if let Some(ref output) = result.output {
                    match output {
                        Value::Object(map) => {
                            if let Value::Object(ref mut cm) = combined {
                                for (k, v) in map {
                                    cm.insert(k.clone(), v.clone());
                                }
                            }
                        }
                        Value::String(s) => {
                            if let Value::Object(ref mut cm) = combined {
                                cm.insert("content".to_string(), Value::String(s.clone()));
                            }
                        }
                        v => {
                            if let Value::Object(ref mut cm) = combined {
                                cm.insert("value".to_string(), v.clone());
                            }
                        }
                    }
                }
            }
        }

        combined
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_runtime::workflow::dag::{EdgeDef, NodeDef, WorkflowConfig, WorkflowDef};

    fn test_workflow() -> WorkflowDef {
        WorkflowDef {
            name: "test_rag".to_string(),
            description: Some("Test RAG workflow".to_string()),
            nodes: vec![
                NodeDef {
                    id: "search".to_string(),
                    node_type: "retrieve".to_string(),
                    config: serde_json::json!({"top_k": 5}),
                    label: Some("Search".to_string()),
                },
                NodeDef {
                    id: "llm".to_string(),
                    node_type: "generate".to_string(),
                    config: serde_json::json!({"max_tokens": 1024}),
                    label: Some("Generate".to_string()),
                },
            ],
            edges: vec![EdgeDef {
                source: "search".to_string(),
                target: "llm".to_string(),
                condition: None,
            }],
            config: WorkflowConfig {
                timeout_secs: 60,
                max_retries: 1,
            },
        }
    }

    #[test]
    fn test_executor_basic() {
        let wf = test_workflow();
        let mut executor = WorkflowExecutor::new(wf);
        executor.set_context(serde_json::json!({"query": "test query"}));

        let result = executor.execute_all();
        assert_eq!(result.status, WorkflowStatus::Completed);
        assert_eq!(result.node_results.len(), 2);
        assert!(result.error.is_none());
        assert!(result.final_output.is_some());
    }

    #[test]
    fn test_executor_node_types() {
        let wf = WorkflowDef {
            name: "node_types".to_string(),
            description: None,
            nodes: vec![
                NodeDef {
                    id: "cond".to_string(),
                    node_type: "condition".to_string(),
                    config: serde_json::json!({"condition": "true"}),
                    label: None,
                },
                NodeDef {
                    id: "branch".to_string(),
                    node_type: "branch".to_string(),
                    config: serde_json::json!({"default": "path_a"}),
                    label: None,
                },
            ],
            edges: vec![EdgeDef {
                source: "cond".to_string(),
                target: "branch".to_string(),
                condition: None,
            }],
            config: WorkflowConfig {
                timeout_secs: 30,
                max_retries: 0,
            },
        };

        let mut executor = WorkflowExecutor::new(wf);
        let result = executor.execute_all();
        assert!(result.error.is_none());
        assert_eq!(result.status, WorkflowStatus::Completed);
    }

    #[test]
    fn test_executor_unknown_node_type() {
        let wf = WorkflowDef {
            name: "unknown_type".to_string(),
            description: None,
            nodes: vec![NodeDef {
                id: "bad".to_string(),
                node_type: "unknown_magic".to_string(),
                config: serde_json::json!({}),
                label: None,
            }],
            edges: vec![],
            config: WorkflowConfig {
                timeout_secs: 30,
                max_retries: 0,
            },
        };

        let mut executor = WorkflowExecutor::new(wf);
        let result = executor.execute_all();
        assert_eq!(result.status, WorkflowStatus::Failed);
        assert!(result.error.is_some());
    }
}