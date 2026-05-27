use crate::agent_rag::types::BranchDirection;

pub fn check_answer_complete(answer: &str) -> BranchDirection {
    let lower = answer.to_lowercase();

    let complete_markers = [
        "so the answer is",
        "final answer:",
        "in conclusion",
        "总结",
        "综上",
        "最终答案是",
        "答案是",
    ];

    for marker in &complete_markers {
        if lower.contains(marker) {
            return BranchDirection::Complete;
        }
    }

    if lower.contains("to be filled")
        || lower.contains("待填充")
        || lower.contains("unknown")
        || lower.contains("not found")
    {
        return BranchDirection::Incomplete;
    }

    if answer.len() < 50 {
        return BranchDirection::Incomplete;
    }

    BranchDirection::Complete
}

pub fn check_need_retrieval(query: &str) -> BranchDirection {
    let lower = query.to_lowercase();

    let chat_phrases = [
        "hello", "hi", "hey", "你好", "嗨", "谢谢", "thanks",
        "how are you", "what's up", "good morning", "good afternoon",
        "早上好", "下午好", "晚上好", "再见", "bye",
    ];

    for phrase in &chat_phrases {
        if lower.contains(phrase) && lower.len() < 20 {
            return BranchDirection::DirectAnswer;
        }
    }

    let knowledge_indicators = [
        "what", "how", "why", "explain", "define", "what is",
        "什么", "怎么", "为什么", "如何", "定义", "解释",
        "tell me about", "describe", "list", "compare",
        "介绍", "描述", "列出", "比较", "区别", "关系",
    ];

    for indicator in &knowledge_indicators {
        if lower.contains(indicator) {
            return BranchDirection::NeedRetrieval;
        }
    }

    if lower.ends_with('?') || lower.ends_with('？') {
        return BranchDirection::NeedRetrieval;
    }

    BranchDirection::NeedRetrieval
}

pub fn check_need_deep_research(query: &str) -> BranchDirection {
    let lower = query.to_lowercase();

    let deep_indicators = [
        "research", "analyze", "compare", "versus", "vs",
        "pros and cons", "advantages", "disadvantages",
        "survey", "comprehensive", "in depth",
        "调研", "分析", "对比", "优缺点", "综述",
        "全面", "深入", "详细", "方案", "设计",
    ];

    let mut score = 0;
    for indicator in &deep_indicators {
        if lower.contains(indicator) {
            score += 1;
        }
    }

    if score >= 2 || lower.len() > 100 {
        BranchDirection::NeedRetrieval
    } else {
        BranchDirection::DirectAnswer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_answer_complete() {
        assert!(matches!(
            check_answer_complete("基于以上分析，答案是 Rust 的所有权系统"),
            BranchDirection::Complete
        ));

        assert!(matches!(
            check_answer_complete("so the answer is 42"),
            BranchDirection::Complete
        ));

        assert!(matches!(
            check_answer_complete("to be filled"),
            BranchDirection::Incomplete
        ));

        assert!(matches!(
            check_answer_complete("short"),
            BranchDirection::Incomplete
        ));
    }

    #[test]
    fn test_check_need_retrieval() {
        assert!(matches!(
            check_need_retrieval("你好"),
            BranchDirection::DirectAnswer
        ));

        assert!(matches!(
            check_need_retrieval("Rust 的生命周期是什么"),
            BranchDirection::NeedRetrieval
        ));

        assert!(matches!(
            check_need_retrieval("hello how are you"),
            BranchDirection::DirectAnswer
        ));
    }

    #[test]
    fn test_check_need_deep_research() {
        assert!(matches!(
            check_need_deep_research("分析 Rust 和 Go 的优缺点"),
            BranchDirection::NeedRetrieval
        ));

        assert!(matches!(
            check_need_deep_research("hi"),
            BranchDirection::DirectAnswer
        ));
    }
}