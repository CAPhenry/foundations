const migrations = [
    {
        version: 1,
        name: "create shop stock and transaction ledger",
        statements: [
            `CREATE TABLE IF NOT EXISTS hmp_shop_stock (
                shop_id VARCHAR(64) NOT NULL,
                offer_id VARCHAR(64) NOT NULL,
                quantity BIGINT UNSIGNED NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (shop_id, offer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_shop_transactions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                reference_id VARCHAR(96) NOT NULL,
                character_id BIGINT UNSIGNED NOT NULL,
                shop_id VARCHAR(64) NOT NULL,
                offer_id VARCHAR(64) NOT NULL,
                item_name VARCHAR(64) NOT NULL,
                direction VARCHAR(8) NOT NULL,
                quantity INT UNSIGNED NOT NULL,
                unit_price INT UNSIGNED NOT NULL,
                total_price BIGINT UNSIGNED NOT NULL,
                currency_id VARCHAR(64) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                error_text VARCHAR(191) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_shop_transaction_reference (reference_id),
                KEY idx_hmp_shop_transactions_character (character_id, created_at),
                KEY idx_hmp_shop_transactions_shop (shop_id, created_at),
                CONSTRAINT fk_hmp_shop_transactions_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ],
    },
    {
        version: 2,
        name: "rename the player-facing currency to galleons",
        statements: [
            "UPDATE hmp_shop_transactions SET currency_id = 'galleons' WHERE currency_id = 'knuts'",
        ],
    },
];

export = { migrations };
