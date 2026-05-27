-- Nexus Database Migration
-- Version: 001_initial
-- All tables are created programmatically in src/db/*.rs
-- This file serves as documentation of the current schema.

-- users: account management
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- vaults: sync workspaces owned by users
CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- vault_members: many-to-many user-vault relationship
CREATE TABLE IF NOT EXISTS vault_members (
    vault_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (vault_id, user_id),
    FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- vault_files: file manifest for sync (tombstone via is_deleted)
CREATE TABLE IF NOT EXISTS vault_files (
    vault_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    last_modified TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (vault_id, file_path),
    FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

-- devices: registered client devices per user
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    public_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_files_vault ON vault_files(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_files_hash ON vault_files(vault_id, file_hash);