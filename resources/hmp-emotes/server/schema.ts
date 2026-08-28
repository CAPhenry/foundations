const migrations = [{
    version: 1,
    name: "create persistent emote alias overrides",
    statements: [
        `CREATE TABLE IF NOT EXISTS hmp_emote_aliases (
            alias_name VARCHAR(24) NOT NULL,
            asset_path VARCHAR(256) NULL,
            emote_kind ENUM('pose', 'ability') NOT NULL DEFAULT 'pose',
            ability_channel ENUM('FullBody', 'PartialBody') NOT NULL DEFAULT 'FullBody',
            hidden BOOLEAN NOT NULL DEFAULT FALSE,
            updated_by_account_id BIGINT UNSIGNED NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (alias_name),
            KEY idx_hmp_emote_alias_path (asset_path)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
}];

export = { migrations };
