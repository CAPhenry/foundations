const migrations = [
    {
        version: 1,
        name: "create bank accounts and auditable ledger",
        statements: [
            `CREATE TABLE IF NOT EXISTS hmp_bank_accounts (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                account_type VARCHAR(16) NOT NULL,
                character_id BIGINT UNSIGNED NULL,
                organization_id VARCHAR(64) NULL,
                label VARCHAR(80) NOT NULL,
                currency_id VARCHAR(64) NOT NULL,
                balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
                status VARCHAR(16) NOT NULL DEFAULT 'active',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_bank_personal (account_type, character_id, currency_id),
                UNIQUE KEY uq_hmp_bank_organization (account_type, organization_id, currency_id),
                KEY idx_hmp_bank_accounts_character (character_id),
                KEY idx_hmp_bank_accounts_organization (organization_id),
                CONSTRAINT fk_hmp_bank_account_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_bank_transactions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                reference_id VARCHAR(96) NOT NULL,
                transaction_type VARCHAR(16) NOT NULL,
                actor_character_id BIGINT UNSIGNED NULL,
                from_account_id BIGINT UNSIGNED NULL,
                to_account_id BIGINT UNSIGNED NULL,
                currency_id VARCHAR(64) NOT NULL,
                amount BIGINT UNSIGNED NOT NULL,
                memo VARCHAR(120) NOT NULL DEFAULT '',
                metadata_json LONGTEXT NULL,
                source_resource VARCHAR(64) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                error_text VARCHAR(191) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                applied_at TIMESTAMP NULL DEFAULT NULL,
                completed_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_bank_transaction_reference (reference_id),
                KEY idx_hmp_bank_transactions_actor (actor_character_id, created_at),
                KEY idx_hmp_bank_transactions_from (from_account_id, created_at),
                KEY idx_hmp_bank_transactions_to (to_account_id, created_at),
                CONSTRAINT fk_hmp_bank_transaction_actor FOREIGN KEY (actor_character_id) REFERENCES hmp_characters (id) ON DELETE SET NULL,
                CONSTRAINT fk_hmp_bank_transaction_from FOREIGN KEY (from_account_id) REFERENCES hmp_bank_accounts (id) ON DELETE RESTRICT,
                CONSTRAINT fk_hmp_bank_transaction_to FOREIGN KEY (to_account_id) REFERENCES hmp_bank_accounts (id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ],
    },
    {
        version: 2,
        name: "rename knuts accounts and ledger rows to galleons",
        statements: [
            `UPDATE hmp_bank_accounts legacy
             JOIN hmp_bank_accounts canonical
               ON canonical.currency_id = 'galleons'
              AND canonical.account_type = legacy.account_type
              AND canonical.character_id <=> legacy.character_id
              AND canonical.organization_id <=> legacy.organization_id
             SET canonical.balance = canonical.balance + legacy.balance
             WHERE legacy.currency_id = 'knuts'`,
            `UPDATE hmp_bank_transactions transaction_row
             JOIN hmp_bank_accounts legacy ON legacy.id = transaction_row.from_account_id
             JOIN hmp_bank_accounts canonical
               ON canonical.currency_id = 'galleons'
              AND canonical.account_type = legacy.account_type
              AND canonical.character_id <=> legacy.character_id
              AND canonical.organization_id <=> legacy.organization_id
             SET transaction_row.from_account_id = canonical.id
             WHERE legacy.currency_id = 'knuts'`,
            `UPDATE hmp_bank_transactions transaction_row
             JOIN hmp_bank_accounts legacy ON legacy.id = transaction_row.to_account_id
             JOIN hmp_bank_accounts canonical
               ON canonical.currency_id = 'galleons'
              AND canonical.account_type = legacy.account_type
              AND canonical.character_id <=> legacy.character_id
              AND canonical.organization_id <=> legacy.organization_id
             SET transaction_row.to_account_id = canonical.id
             WHERE legacy.currency_id = 'knuts'`,
            `DELETE legacy FROM hmp_bank_accounts legacy
             JOIN hmp_bank_accounts canonical
               ON canonical.currency_id = 'galleons'
              AND canonical.account_type = legacy.account_type
              AND canonical.character_id <=> legacy.character_id
              AND canonical.organization_id <=> legacy.organization_id
             WHERE legacy.currency_id = 'knuts'`,
            "UPDATE hmp_bank_accounts SET currency_id = 'galleons' WHERE currency_id = 'knuts'",
            "UPDATE hmp_bank_transactions SET currency_id = 'galleons' WHERE currency_id = 'knuts'",
        ],
    },
];

export = { migrations };
