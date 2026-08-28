const migrations = [
    {
        version: 1,
        name: "create character inventories and native snapshots",
        statements: [
            `CREATE TABLE IF NOT EXISTS hmp_inventory_containers (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                container_key VARCHAR(191) NOT NULL,
                owner_character_id BIGINT UNSIGNED NULL,
                label VARCHAR(80) NOT NULL,
                slots SMALLINT UNSIGNED NOT NULL,
                max_weight DECIMAL(12,3) NOT NULL,
                metadata_json LONGTEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_inventory_container_key (container_key),
                KEY idx_hmp_inventory_character (owner_character_id),
                CONSTRAINT fk_hmp_inventory_character FOREIGN KEY (owner_character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_inventory_items (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                container_id BIGINT UNSIGNED NOT NULL,
                slot SMALLINT UNSIGNED NOT NULL,
                item_name VARCHAR(64) NOT NULL,
                amount INT UNSIGNED NOT NULL,
                metadata_json LONGTEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_inventory_slot (container_id, slot),
                KEY idx_hmp_inventory_item (container_id, item_name),
                CONSTRAINT fk_hmp_inventory_item_container FOREIGN KEY (container_id) REFERENCES hmp_inventory_containers (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_inventory_native (
                character_id BIGINT UNSIGNED NOT NULL,
                items_json LONGTEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (character_id),
                CONSTRAINT fk_hmp_inventory_native_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ],
    },
];

export = { migrations };
// TypeScript source.
