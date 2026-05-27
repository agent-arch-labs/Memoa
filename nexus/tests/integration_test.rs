#[cfg(test)]
mod tests {
    use nexus::db;
    use std::fs;

    fn init_db() {
        db::init(":memory:").expect("failed to init db");
    }

    #[test]
    fn test_user_registration() {
        init_db();

        db::with_conn(|conn| {
            let hash = nexus::auth::hash_password("testpassword123")?;
            let user = db::user::create_user(conn, "test@memoa.dev", &hash)?;

            assert_eq!(user.email, "test@memoa.dev");
            assert!(!user.id.is_empty());

            let found = db::user::find_by_email(conn, "test@memoa.dev")?;
            assert!(found.is_some());
            assert_eq!(found.unwrap().email, "test@memoa.dev");

            let not_found = db::user::find_by_email(conn, "nobody@memoa.dev")?;
            assert!(not_found.is_none());

            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_password_hashing() {
        let hash = nexus::auth::hash_password("mypassword").unwrap();
        assert!(hash.starts_with("$argon2"));

        let valid = nexus::auth::verify_password("mypassword", &hash).unwrap();
        assert!(valid);

        let invalid = nexus::auth::verify_password("wrongpassword", &hash).unwrap();
        assert!(!invalid);
    }

    #[test]
    fn test_jwt_token() {
        let token = nexus::auth::create_token("user-1", "test@memoa.dev", "secret", 1).unwrap();
        let claims = nexus::auth::verify_token(&token, "secret").unwrap();

        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.email, "test@memoa.dev");
    }

    #[test]
    fn test_jwt_wrong_secret() {
        let token = nexus::auth::create_token("user-1", "test@memoa.dev", "secret-a", 1).unwrap();
        let result = nexus::auth::verify_token(&token, "secret-b");
        assert!(result.is_err());
    }

    #[test]
    fn test_vault_crud() {
        init_db();

        db::with_conn(|conn| {
            let hash = nexus::auth::hash_password("pass")?;
            let user = db::user::create_user(conn, "owner@memoa.dev", &hash)?;

            let vault = db::vault::create_vault(conn, &user.id, "My Knowledge Base")?;
            assert_eq!(vault.name, "My Knowledge Base");
            assert_eq!(vault.owner_id, user.id);
            assert!(db::vault::is_vault_member(conn, &vault.id, &user.id)?);

            let vaults = db::vault::list_vaults_by_user(conn, &user.id)?;
            assert_eq!(vaults.len(), 1);

            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_file_manifest() {
        init_db();

        db::with_conn(|conn| {
            let hash = nexus::auth::hash_password("pass")?;
            let user = db::user::create_user(conn, "uploader@memoa.dev", &hash)?;
            let vault = db::vault::create_vault(conn, &user.id, "Vault")?;

            db::vault::upsert_file_record(
                conn,
                &vault.id,
                "notes/hello.md",
                "abc123",
                1024,
                "2024-01-01T00:00:00Z",
            )?;

            let manifest = db::vault::get_file_manifest(conn, &vault.id)?;
            assert_eq!(manifest.len(), 1);
            assert_eq!(manifest[0].0, "notes/hello.md");
            assert_eq!(manifest[0].1, "abc123");

            let record = db::vault::get_file_record(conn, &vault.id, "notes/hello.md")?;
            assert!(record.is_some());

            db::vault::mark_file_deleted(conn, &vault.id, "notes/hello.md")?;
            let manifest_after = db::vault::get_file_manifest(conn, &vault.id)?;
            assert_eq!(manifest_after.len(), 0);

            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_device_registration() {
        init_db();

        db::with_conn(|conn| {
            let hash = nexus::auth::hash_password("pass")?;
            let user = db::user::create_user(conn, "device@memoa.dev", &hash)?;

            let device = db::device::register_device(conn, &user.id, "MacBook Pro", None)?;
            assert_eq!(device.device_name, "MacBook Pro");
            assert_eq!(device.user_id, user.id);

            let devices = db::device::list_devices_by_user(conn, &user.id)?;
            assert_eq!(devices.len(), 1);

            db::device::update_last_seen(conn, &device.id)?;

            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn test_storage_local() {
        let tmp = std::env::temp_dir().join("nexus-test-storage");
        let _ = fs::remove_dir_all(&tmp);

        let data = b"Hello, Nexus Storage!";
        let hash = nexus::sync::storage::compute_hash(data);
        assert_eq!(hash.len(), 64); // SHA-256 hex

        let test_path = format!("{}/test.txt", tmp.to_string_lossy());

        fs::create_dir_all(tmp.join("vault-a")).unwrap();
        fs::write(&test_path, data).unwrap();

        let read_data = fs::read(&test_path).unwrap();
        assert_eq!(read_data, data);

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_manifest_path_validation() {
        let valid = nexus::sync::manifest::validate_file_path("notes/hello.md").unwrap();
        assert_eq!(valid, "notes/hello.md");

        let valid_root = nexus::sync::manifest::validate_file_path("hello.md").unwrap();
        assert_eq!(valid_root, "hello.md");

        let result = nexus::sync::manifest::validate_file_path("../escape.md");
        assert!(result.is_err());

        let result_empty = nexus::sync::manifest::validate_file_path("");
        assert!(result_empty.is_err());
    }

    #[test]
    fn test_rate_limiter() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let limiter = nexus::gateway::RateLimiter::new(3);

            for _ in 0..3 {
                limiter.check("user-1").await.unwrap();
            }

            let result = limiter.check("user-1").await;
            assert!(result.is_err());

            limiter.check("user-2").await.unwrap();
        });
    }

    #[test]
    fn test_config_from_env() {
        std::env::set_var("NEXUS_PORT", "9999");
        std::env::set_var("NEXUS_JWT_SECRET", "my-secret");
        std::env::set_var("NEXUS_GATEWAY_ENABLED", "true");

        let config = nexus::config::AppConfig::from_env().unwrap();
        assert_eq!(config.server.port, 9999);
        assert_eq!(config.auth.jwt_secret, "my-secret");
        assert!(config.gateway.enabled);

        std::env::remove_var("NEXUS_PORT");
        std::env::remove_var("NEXUS_JWT_SECRET");
        std::env::remove_var("NEXUS_GATEWAY_ENABLED");
    }
}