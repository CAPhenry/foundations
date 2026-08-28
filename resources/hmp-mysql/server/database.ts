import crypto = require("node:crypto");
import type {
    HmpMySQL,
    HmpMySQLMetrics,
    HmpMySQLMigration,
    HmpMySQLMigrationResult,
    HmpMySQLMigrationStatement,
    HmpMySQLStatus,
    HmpMySQLTransaction,
    HmpMySQLTransactionStep,
    HmpMySQLValues,
} from "../types";
import type { DatabaseOptions, SqlClient, SqlConnection, SqlPool } from "./internal";

type SqlMethod = "query" | "execute";
interface NormalizedStatement { query: string; values: HmpMySQLValues; prepare: boolean }
interface NormalizedMigration { version: number; name: string; statements: NormalizedStatement[]; checksum: string }
interface MigrationRow { version: unknown; name: unknown; checksum: unknown }

function requireSql(sql: unknown): asserts sql is string {
    if (typeof sql !== "string" || !sql.trim()) throw new TypeError("SQL must be a non-empty string");
}

function requireValues(values: unknown): HmpMySQLValues {
    if (values === undefined) return [];
    if (Array.isArray(values) || (values && typeof values === "object")) return values as HmpMySQLValues;
    throw new TypeError("Query values must be an array or named-parameter object");
}

function createDatabase(options: DatabaseOptions): { api: HmpMySQL; close(): Promise<void> } {
    const { createPool, config } = options;
    const logger = options.logger || console;
    if (typeof createPool !== "function") throw new TypeError("createPool must be a function");
    if (!config || typeof config !== "object") throw new TypeError("config is required");

    let pool: SqlPool | null = null;
    let state: HmpMySQLStatus["state"] = config.enabled ? "configured" : "disabled";
    let lastError = "";
    let readyPromise: Promise<boolean> | null = null;
    const startedAt = Date.now();
    const metrics: HmpMySQLMetrics = {
        queries: 0,
        failedQueries: 0,
        transactions: 0,
        failedTransactions: 0,
        migrations: 0,
        failedMigrations: 0,
    };

    function requireEnabled(): void {
        if (!config.enabled) {
            const error = new Error("hmp-mysql is not configured");
            throw Object.assign(error, { code: "HMP_MYSQL_DISABLED" });
        }
        if (state === "closed") {
            const error = new Error("hmp-mysql is closed");
            throw Object.assign(error, { code: "HMP_MYSQL_CLOSED" });
        }
    }

    function getPool(): SqlPool {
        requireEnabled();
        if (!pool) pool = createPool(config.pool);
        return pool;
    }

    function markReady(): void {
        if (state === "closed") return;
        state = "ready";
        lastError = "";
    }

    function markFailure(error: unknown): void {
        if (state === "closed") return;
        state = "degraded";
        lastError = error instanceof Error ? error.message : String(error);
    }

    async function run<T = unknown>(client: SqlClient, method: SqlMethod, sql: string, values?: HmpMySQLValues): Promise<T> {
        requireSql(sql);
        const parameters = requireValues(values);
        metrics.queries++;
        try {
            const [result] = await client[method](sql, parameters);
            markReady();
            return result as T;
        } catch (error) {
            metrics.failedQueries++;
            markFailure(error);
            throw error;
        }
    }

    function facade(client: SqlClient): HmpMySQLTransaction {
        const query = <T = unknown>(sql: string, values?: HmpMySQLValues) => run<T>(client, "query", sql, values);
        const prepare = <T = unknown>(sql: string, values?: HmpMySQLValues) => run<T>(client, "execute", sql, values);
        return {
            query,
            prepare,
            single: async <T = Record<string, unknown>>(sql: string, values?: HmpMySQLValues): Promise<T | null> => {
                const rows = await query<unknown>(sql, values);
                return Array.isArray(rows) && rows.length ? rows[0] as T : null;
            },
            scalar: async <T = unknown>(sql: string, values?: HmpMySQLValues): Promise<T | null> => {
                const rows = await query<unknown>(sql, values);
                if (!Array.isArray(rows) || !rows.length || !rows[0] || typeof rows[0] !== "object") return null;
                const key = Object.keys(rows[0])[0];
                return key === undefined ? null : (rows[0] as Record<string, unknown>)[key] as T;
            },
            insert: async (sql: string, values?: HmpMySQLValues): Promise<number | string> => {
                const result = await query<unknown>(sql, values);
                return result && typeof result === "object" && "insertId" in result && result.insertId !== undefined ? result.insertId as number | string : 0;
            },
            update: async (sql: string, values?: HmpMySQLValues): Promise<number> => {
                const result = await query<unknown>(sql, values);
                return result && typeof result === "object" && "affectedRows" in result && result.affectedRows !== undefined ? Number(result.affectedRows) : 0;
            },
        };
    }

    const api = facade({
        query: (sql: string, values?: HmpMySQLValues) => getPool().query(sql, values),
        execute: (sql: string, values?: HmpMySQLValues) => getPool().execute(sql, values),
    });

    async function transaction<T>(work: (tx: HmpMySQLTransaction) => T | Promise<T>): Promise<T>;
    async function transaction(work: HmpMySQLTransactionStep[]): Promise<unknown[]>;
    async function transaction<T>(work: ((tx: HmpMySQLTransaction) => T | Promise<T>) | Array<HmpMySQLTransactionStep | string>): Promise<T | unknown[]> {
        requireEnabled();
        if (typeof work !== "function" && !Array.isArray(work)) {
            throw new TypeError("transaction expects a callback or an array of query steps");
        }

        metrics.transactions++;
        let connection: SqlConnection | null = null;
        try {
            connection = await getPool().getConnection();
            await connection.beginTransaction();
            const tx = facade(connection);
            let result: T | unknown[];
            if (typeof work === "function") {
                result = await work(tx);
            } else {
                const results: unknown[] = [];
                for (const step of work) {
                    if (typeof step === "string") {
                        results.push(await tx.query(step));
                        continue;
                    }
                    if (!step || typeof step !== "object") throw new TypeError("Invalid transaction step");
                    results.push(await (step.prepare ? tx.prepare : tx.query)(step.query, step.values));
                }
                result = results;
            }
            await connection.commit();
            markReady();
            return result;
        } catch (error) {
            metrics.failedTransactions++;
            markFailure(error);
            if (connection) {
                try { await connection.rollback(); }
                catch (rollbackError) { logger.error(`[hmp-mysql] rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`); }
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    function normalizeMigrations(resource: string, migrations: unknown): NormalizedMigration[] {
        if (typeof resource !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(resource)) {
            throw new TypeError("migration resource must match [a-z0-9_-] and contain at most 64 characters");
        }
        if (!Array.isArray(migrations)) throw new TypeError("migrations must be an array");
        const versions = new Set<number>();
        return migrations.map((migration) => {
            if (!migration || typeof migration !== "object") throw new TypeError("migration must be an object");
            const value = migration as Record<string, unknown>;
            const version = Number(value.version);
            if (!Number.isSafeInteger(version) || version <= 0) throw new TypeError("migration version must be a positive integer");
            if (versions.has(version)) throw new TypeError(`duplicate migration version ${version}`);
            versions.add(version);
            const name = typeof value.name === "string" ? value.name.trim() : "";
            if (!name || name.length > 128) throw new TypeError(`migration ${version} needs a name of at most 128 characters`);
            const rawSteps = value.statements ?? value.up;
            const statements = (Array.isArray(rawSteps) ? rawSteps : [rawSteps]).map((step) => {
                if (typeof step === "string") {
                    requireSql(step);
                    return { query: step, values: [], prepare: false };
                }
                if (!step || typeof step !== "object") throw new TypeError(`migration ${version} contains an invalid statement`);
                const statement = step as Record<string, unknown>;
                requireSql(statement.query);
                return { query: statement.query, values: requireValues(statement.values), prepare: statement.prepare === true };
            });
            if (!statements.length) throw new TypeError(`migration ${version} has no statements`);
            const checksum = crypto.createHash("sha256").update(JSON.stringify({ version, name, statements })).digest("hex");
            return { version, name, statements, checksum };
        }).sort((left, right) => left.version - right.version);
    }

    async function migrate(resource: string, migrations: HmpMySQLMigration[], options: { lockTimeoutSeconds?: number } = {}): Promise<HmpMySQLMigrationResult> {
        requireEnabled();
        const plan = normalizeMigrations(resource, migrations);
        const requestedTimeout = options.lockTimeoutSeconds;
        const timeoutSeconds = typeof requestedTimeout === "number" && Number.isSafeInteger(requestedTimeout) && requestedTimeout >= 0
            ? requestedTimeout
            : 30;
        const lockName = `hmp:migrate:${resource}`;
        const connection = await getPool().getConnection();
        let locked = false;
        metrics.migrations++;
        try {
            const [lockRows] = await connection.query("SELECT GET_LOCK(?, ?) AS acquired", [lockName, timeoutSeconds]);
            const lockRow = Array.isArray(lockRows) && lockRows[0] && typeof lockRows[0] === "object" ? lockRows[0] as Record<string, unknown> : null;
            locked = Boolean(lockRow && Number(lockRow.acquired) === 1);
            if (!locked) {
                const error = new Error(`timed out waiting for migration lock '${lockName}'`);
                throw Object.assign(error, { code: "HMP_MYSQL_MIGRATION_LOCK_TIMEOUT" });
            }

            await connection.query(`
                CREATE TABLE IF NOT EXISTS hmp_schema_migrations (
                    resource VARCHAR(64) NOT NULL,
                    version INT UNSIGNED NOT NULL,
                    name VARCHAR(128) NOT NULL,
                    checksum CHAR(64) NOT NULL,
                    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (resource, version)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);
            const [rows] = await connection.query(
                "SELECT version, name, checksum FROM hmp_schema_migrations WHERE resource = ? ORDER BY version",
                [resource],
            );
            const applied = new Map<number, MigrationRow>((Array.isArray(rows) ? rows : []).filter((row): row is MigrationRow => Boolean(row && typeof row === "object")).map((row) => [Number(row.version), row]));
            const result: HmpMySQLMigrationResult = { resource, applied: [], skipped: [], currentVersion: 0 };

            for (const migration of plan) {
                const existing = applied.get(migration.version);
                if (existing) {
                    if (existing.checksum !== migration.checksum) {
                        const error = new Error(`migration ${resource}:${migration.version} was modified after it was applied`);
                        throw Object.assign(error, { code: "HMP_MYSQL_MIGRATION_CHANGED" });
                    }
                    result.skipped.push(migration.version);
                    result.currentVersion = Math.max(result.currentVersion, migration.version);
                    continue;
                }

                await connection.beginTransaction();
                try {
                    for (const statement of migration.statements) {
                        await connection[statement.prepare ? "execute" : "query"](statement.query, statement.values);
                    }
                    await connection.query(
                        "INSERT INTO hmp_schema_migrations (resource, version, name, checksum) VALUES (?, ?, ?, ?)",
                        [resource, migration.version, migration.name, migration.checksum],
                    );
                    await connection.commit();
                } catch (error) {
                    try { await connection.rollback(); }
                    catch (rollbackError) { logger.error(`[hmp-mysql] migration rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`); }
                    throw error;
                }
                result.applied.push(migration.version);
                result.currentVersion = Math.max(result.currentVersion, migration.version);
            }
            markReady();
            return result;
        } catch (error) {
            metrics.failedMigrations++;
            markFailure(error);
            throw error;
        } finally {
            if (locked) {
                try { await connection.query("SELECT RELEASE_LOCK(?) AS released", [lockName]); }
                catch (error) { logger.error(`[hmp-mysql] migration lock release failed: ${error instanceof Error ? error.message : String(error)}`); }
            }
            connection.release();
        }
    }

    async function ping(): Promise<boolean> {
        if (!config.enabled || state === "closed") return false;
        try {
            await run(getPool(), "query", "SELECT 1", []);
            return state === "ready";
        } catch (_) {
            return false;
        }
    }

    function ready(): Promise<boolean> {
        if (state === "ready") return Promise.resolve(true);
        if (!readyPromise) readyPromise = ping().finally(() => { readyPromise = null; });
        return readyPromise;
    }

    function status(): HmpMySQLStatus {
        return {
            configured: Boolean(config.enabled),
            state,
            target: config.enabled ? config.target : "",
            lastError,
            uptimeMs: Date.now() - startedAt,
            metrics: { ...metrics },
        };
    }

    async function close(): Promise<void> {
        if (state === "closed") return;
        const activePool = pool;
        pool = null;
        state = "closed";
        if (activePool) await activePool.end();
    }

    return {
        api: { ...api, transaction, migrate, ready, status },
        close,
    };
}

export = { createDatabase };
// TypeScript source.
