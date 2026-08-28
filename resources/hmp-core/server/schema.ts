const migrations = [
    {
        version: 1,
        name: "create core accounts, identities, characters, groups and metadata",
        statements: [
            `CREATE TABLE IF NOT EXISTS hmp_accounts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                display_name VARCHAR(80) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_account_identities (
                provider VARCHAR(64) NOT NULL,
                subject VARCHAR(191) NOT NULL,
                account_id BIGINT UNSIGNED NOT NULL,
                trust_level VARCHAR(16) NOT NULL DEFAULT 'asserted',
                first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (provider, subject),
                KEY idx_hmp_identities_account (account_id),
                CONSTRAINT fk_hmp_identities_account FOREIGN KEY (account_id) REFERENCES hmp_accounts (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_characters (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                account_id BIGINT UNSIGNED NOT NULL,
                slot SMALLINT UNSIGNED NOT NULL,
                name VARCHAR(80) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'active',
                active_slot SMALLINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN slot ELSE NULL END) STORED,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_characters_active_slot (account_id, active_slot),
                KEY idx_hmp_characters_account_status (account_id, status),
                CONSTRAINT fk_hmp_characters_account FOREIGN KEY (account_id) REFERENCES hmp_accounts (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_account_groups (
                account_id BIGINT UNSIGNED NOT NULL,
                group_key VARCHAR(64) NOT NULL,
                grade INT NOT NULL DEFAULT 0,
                metadata_json LONGTEXT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (account_id, group_key),
                CONSTRAINT fk_hmp_account_groups_account FOREIGN KEY (account_id) REFERENCES hmp_accounts (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_character_groups (
                character_id BIGINT UNSIGNED NOT NULL,
                group_key VARCHAR(64) NOT NULL,
                grade INT NOT NULL DEFAULT 0,
                metadata_json LONGTEXT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (character_id, group_key),
                CONSTRAINT fk_hmp_character_groups_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_account_metadata (
                account_id BIGINT UNSIGNED NOT NULL,
                meta_key VARCHAR(64) NOT NULL,
                value_json LONGTEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (account_id, meta_key),
                CONSTRAINT fk_hmp_account_metadata_account FOREIGN KEY (account_id) REFERENCES hmp_accounts (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_character_metadata (
                character_id BIGINT UNSIGNED NOT NULL,
                meta_key VARCHAR(64) NOT NULL,
                value_json LONGTEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (character_id, meta_key),
                CONSTRAINT fk_hmp_character_metadata_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ],
    },
];

export = { migrations };
// TypeScript source.
