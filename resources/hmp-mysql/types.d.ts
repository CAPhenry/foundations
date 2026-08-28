export type HmpMySQLValues = unknown[] | Record<string, unknown>;

export interface HmpMySQLTransactionStep {
    query: string;
    values?: HmpMySQLValues;
    /** Use a server-side prepared statement instead of escaped query placeholders. */
    prepare?: boolean;
}

export interface HmpMySQLMetrics {
    queries: number;
    failedQueries: number;
    transactions: number;
    failedTransactions: number;
    migrations: number;
    failedMigrations: number;
}

export interface HmpMySQLMigrationStatement {
    query: string;
    values?: HmpMySQLValues;
    prepare?: boolean;
}

export interface HmpMySQLMigration {
    version: number;
    name: string;
    statements?: Array<string | HmpMySQLMigrationStatement>;
    /** Alias for statements. */
    up?: string | Array<string | HmpMySQLMigrationStatement>;
}

export interface HmpMySQLMigrationResult {
    resource: string;
    applied: number[];
    skipped: number[];
    currentVersion: number;
}

export interface HmpMySQLStatus {
    configured: boolean;
    state: "disabled" | "configured" | "ready" | "degraded" | "closed";
    /** Host, port and database only; credentials are never returned. */
    target: string;
    lastError: string;
    uptimeMs: number;
    metrics: HmpMySQLMetrics;
}

export interface HmpMySQLTransaction {
    query<T = unknown>(sql: string, values?: HmpMySQLValues): Promise<T>;
    prepare<T = unknown>(sql: string, values?: HmpMySQLValues): Promise<T>;
    single<T = Record<string, unknown>>(sql: string, values?: HmpMySQLValues): Promise<T | null>;
    scalar<T = unknown>(sql: string, values?: HmpMySQLValues): Promise<T | null>;
    insert(sql: string, values?: HmpMySQLValues): Promise<number | string>;
    update(sql: string, values?: HmpMySQLValues): Promise<number>;
}

export interface HmpMySQL extends HmpMySQLTransaction {
    transaction<T>(work: (tx: HmpMySQLTransaction) => T | Promise<T>): Promise<T>;
    transaction(steps: HmpMySQLTransactionStep[]): Promise<unknown[]>;
    migrate(resource: string, migrations: HmpMySQLMigration[], options?: { lockTimeoutSeconds?: number }): Promise<HmpMySQLMigrationResult>;
    /** Resolves false while disabled or unreachable; it does not throw for availability failures. */
    ready(): Promise<boolean>;
    status(): HmpMySQLStatus;
}
