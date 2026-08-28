import type { HmpMySQLValues } from "../types";

export interface MySqlConfig {
    enabled: boolean;
    source: string;
    target: string;
    pool: Record<string, unknown> & { ssl?: { rejectUnauthorized: boolean } };
}

export interface SqlClient {
    query(sql: string, values?: HmpMySQLValues): Promise<[unknown, unknown]>;
    execute(sql: string, values?: HmpMySQLValues): Promise<[unknown, unknown]>;
}

export interface SqlConnection extends SqlClient {
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
}

export interface SqlPool extends SqlClient {
    getConnection(): Promise<SqlConnection>;
    end(): Promise<void>;
}

export interface DatabaseOptions {
    createPool: (config: Record<string, unknown>) => SqlPool;
    config: MySqlConfig;
    logger?: { error(...args: unknown[]): unknown };
}
