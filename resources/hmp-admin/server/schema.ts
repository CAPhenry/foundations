const migrations = [
    {
        version: 1,
        name: "create admin audit warnings and bans",
        statements: [
            `CREATE TABLE IF NOT EXISTS hmp_admin_audit (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                actor_account_id BIGINT UNSIGNED NULL,
                actor_character_id BIGINT UNSIGNED NULL,
                actor_player_id BIGINT NULL,
                action VARCHAR(64) NOT NULL,
                target_account_id BIGINT UNSIGNED NULL,
                target_character_id BIGINT UNSIGNED NULL,
                target_player_id BIGINT NULL,
                reason VARCHAR(500) NOT NULL,
                metadata_json LONGTEXT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                error VARCHAR(500) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                PRIMARY KEY (id),
                KEY idx_hmp_admin_audit_target (target_account_id, created_at),
                KEY idx_hmp_admin_audit_actor (actor_account_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_admin_warnings (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                account_id BIGINT UNSIGNED NOT NULL,
                actor_account_id BIGINT UNSIGNED NULL,
                reason VARCHAR(500) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_hmp_admin_warning_account (account_id, created_at),
                CONSTRAINT fk_hmp_admin_warning_account FOREIGN KEY (account_id) REFERENCES hmp_accounts (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_admin_bans (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                account_id BIGINT UNSIGNED NOT NULL,
                provider VARCHAR(64) NOT NULL,
                subject VARCHAR(191) NOT NULL,
                trust VARCHAR(32) NOT NULL,
                actor_account_id BIGINT UNSIGNED NULL,
                reason VARCHAR(500) NOT NULL,
                expires_at TIMESTAMP NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                revoked_at TIMESTAMP NULL,
                revoked_by_account_id BIGINT UNSIGNED NULL,
                revoke_reason VARCHAR(500) NOT NULL DEFAULT '',
                PRIMARY KEY (id),
                KEY idx_hmp_admin_ban_account (account_id, revoked_at, expires_at),
                KEY idx_hmp_admin_ban_principal (provider, subject, revoked_at, expires_at),
                CONSTRAINT fk_hmp_admin_ban_account FOREIGN KEY (account_id) REFERENCES hmp_accounts (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ],
    },
];

export = { migrations };
