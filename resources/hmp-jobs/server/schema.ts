const migrations = [{
    version: 1,
    name: "create persistent employment and job audit ledger",
    statements: [
        `CREATE TABLE IF NOT EXISTS hmp_job_employments (
            character_id BIGINT UNSIGNED NOT NULL,
            job_id VARCHAR(64) NOT NULL,
            grade INT UNSIGNED NOT NULL DEFAULT 0,
            status VARCHAR(16) NOT NULL DEFAULT 'employed',
            is_active TINYINT(1) NOT NULL DEFAULT 0,
            active_character_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'employed' AND is_active = 1 THEN character_id ELSE NULL END) STORED,
            hired_by BIGINT UNSIGNED NULL,
            hired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            terminated_at TIMESTAMP NULL DEFAULT NULL,
            last_paid_at TIMESTAMP NULL DEFAULT NULL,
            PRIMARY KEY (character_id, job_id),
            UNIQUE KEY uq_hmp_job_active_character (active_character_id),
            KEY idx_hmp_job_employees (job_id, status, grade),
            CONSTRAINT fk_hmp_job_employment_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE RESTRICT,
            CONSTRAINT fk_hmp_job_employment_hirer FOREIGN KEY (hired_by) REFERENCES hmp_characters (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        `CREATE TABLE IF NOT EXISTS hmp_job_audit (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            character_id BIGINT UNSIGNED NOT NULL,
            job_id VARCHAR(64) NOT NULL,
            action VARCHAR(32) NOT NULL,
            actor_character_id BIGINT UNSIGNED NULL,
            from_grade INT UNSIGNED NULL,
            to_grade INT UNSIGNED NULL,
            source_resource VARCHAR(64) NOT NULL,
            reason_text VARCHAR(191) NOT NULL DEFAULT '',
            metadata_json LONGTEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_hmp_job_audit_character (character_id, created_at),
            KEY idx_hmp_job_audit_job (job_id, created_at),
            CONSTRAINT fk_hmp_job_audit_character FOREIGN KEY (character_id) REFERENCES hmp_characters (id) ON DELETE CASCADE,
            CONSTRAINT fk_hmp_job_audit_actor FOREIGN KEY (actor_character_id) REFERENCES hmp_characters (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ],
}];

export = { migrations };
