use std::sync::LazyLock;
use std::time::Duration;

static SHARED_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(4)
        .user_agent(concat!("Memoa/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("Failed to build shared HTTP client")
});

pub fn get_client() -> &'static reqwest::Client {
    &SHARED_CLIENT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_client_returns_same_instance() {
        let c1 = get_client() as *const reqwest::Client;
        let c2 = get_client() as *const reqwest::Client;
        assert_eq!(c1, c2);
    }

    #[test]
    fn test_client_is_built() {
        let client = get_client();
        let _ = client;
    }
}