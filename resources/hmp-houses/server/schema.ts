const migrations = [
    {
        version: 1,
        name: "create house membership and house cup ledgers",
        statements: [
            `CREATE TABLE IF NOT EXISTS hmp_house_memberships (
                character_id BIGINT UNSIGNED NOT NULL,
                house_id VARCHAR(16) NOT NULL,
                assigned_by_character_id BIGINT UNSIGNED NULL,
                source_resource VARCHAR(64) NOT NULL,
                reason_text VARCHAR(191) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (character_id),
                KEY idx_hmp_house_memberships_house (house_id, character_id),
                CONSTRAINT fk_hmp_house_membership_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE,
                CONSTRAINT fk_hmp_house_membership_actor FOREIGN KEY (assigned_by_character_id) REFERENCES hmp_characters (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_house_membership_audit (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                character_id BIGINT UNSIGNED NOT NULL,
                from_house_id VARCHAR(16) NULL,
                to_house_id VARCHAR(16) NULL,
                actor_character_id BIGINT UNSIGNED NULL,
                source_resource VARCHAR(64) NOT NULL,
                reason_text VARCHAR(191) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_hmp_house_membership_audit_character (character_id, id),
                CONSTRAINT fk_hmp_house_membership_audit_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE,
                CONSTRAINT fk_hmp_house_membership_audit_actor FOREIGN KEY (actor_character_id) REFERENCES hmp_characters (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS hmp_house_standings (
                house_id VARCHAR(16) NOT NULL,
                points BIGINT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (house_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `INSERT IGNORE INTO hmp_house_standings (house_id, points) VALUES
                ('gryffindor', 0), ('hufflepuff', 0), ('ravenclaw', 0), ('slytherin', 0)`,
            `CREATE TABLE IF NOT EXISTS hmp_house_point_transactions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                reference_id VARCHAR(96) NOT NULL,
                house_id VARCHAR(16) NOT NULL,
                amount BIGINT NOT NULL,
                balance_after BIGINT NULL,
                actor_character_id BIGINT UNSIGNED NULL,
                source_resource VARCHAR(64) NOT NULL,
                reason_text VARCHAR(191) NOT NULL DEFAULT '',
                metadata_json LONGTEXT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                error_text VARCHAR(191) NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_hmp_house_points_reference (reference_id),
                KEY idx_hmp_house_points_house (house_id, id),
                KEY idx_hmp_house_points_status (status, id),
                CONSTRAINT fk_hmp_house_points_actor FOREIGN KEY (actor_character_id) REFERENCES hmp_characters (id) ON DELETE SET NULL,
                CONSTRAINT fk_hmp_house_points_standing FOREIGN KEY (house_id) REFERENCES hmp_house_standings (house_id) ON DELETE RESTRICT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        ],
    },
];

export = { migrations };
