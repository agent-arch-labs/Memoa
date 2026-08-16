use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

static REGISTRY: std::sync::LazyLock<Mutex<HashMap<String, CancellationToken>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn register(request_id: &str) -> CancellationToken {
    let token = CancellationToken::new();
    let mut registry = REGISTRY.lock().unwrap();
    registry.insert(request_id.to_string(), token.clone());
    token
}

pub fn cancel(request_id: &str) -> bool {
    let mut registry = REGISTRY.lock().unwrap();
    if let Some(token) = registry.remove(request_id) {
        token.cancel();
        true
    } else {
        false
    }
}

pub fn remove(request_id: &str) {
    let mut registry = REGISTRY.lock().unwrap();
    registry.remove(request_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_cancel() {
        let token = register("req-1");
        assert!(!token.is_cancelled());
        assert!(cancel("req-1"));
        assert!(token.is_cancelled());
    }

    #[test]
    fn test_cancel_nonexistent() {
        assert!(!cancel("no-such-request"));
    }

    #[test]
    fn test_cancel_already_removed() {
        register("req-2");
        assert!(cancel("req-2"));
        assert!(!cancel("req-2"));
    }

    #[test]
    fn test_remove() {
        let token = register("req-3");
        remove("req-3");
        assert!(!cancel("req-3"));
        assert!(!token.is_cancelled());
    }

    #[test]
    fn test_multiple_tokens() {
        let t1 = register("req-a");
        let t2 = register("req-b");

        assert!(cancel("req-a"));
        assert!(t1.is_cancelled());
        assert!(!t2.is_cancelled());

        assert!(cancel("req-b"));
        assert!(t2.is_cancelled());
    }

    #[test]
    fn test_cancel_before_register_checked() {
        let token = CancellationToken::new();
        token.cancel();
        assert!(token.is_cancelled());
    }
}