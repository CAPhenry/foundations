function requireSql(sql) {
    if (typeof sql !== "string" || !sql.trim()) throw new TypeError("SQL must be a non-empty string");
}

function requireValues(values) {
    if (values === undefined) return [];
    if (Array.isArray(values) || (values && typeof values === "object")) return values;
    throw new TypeError("Query values must be an array or named-parameter object");
}

function createDatabase(options) {
    const { createPool, config } = options;
    const logger = options.logger || console;
    if (typeof createPool !== "function") throw new TypeError("createPool must be a function");
    if (!config || typeof config !== "object") throw new TypeError("config is required");

    let pool = null;
    let state = config.enabled ? "configured" : "disabled";
    let lastError = "";
    let readyPromise = null;
    const startedAt = Date.now();
    const metrics = { queries: 0, failedQueries: 0, transactions: 0, failedTransactions: 0 };

    function requireEnabled() {
        if (!config.enabled) {
            const error = new Error("hmp-mysql is not configured");
            error.code = "HMP_MYSQL_DISABLED";
            throw error;
        }
        if (state === "closed") {
            const error = new Error("hmp-mysql is closed");
            error.code = "HMP_MYSQL_CLOSED";
            throw error;
        }
    }

    function getPool() {
        requireEnabled();
        if (!pool) pool = createPool(config.pool);
        return pool;
    }

    function markReady() {
        if (state === "closed") return;
        state = "ready";
        lastError = "";
    }

    function markFailure(error) {
        if (state === "closed") return;
        state = "degraded";
        lastError = error && error.message ? error.message : String(error);
    }

    async function run(client, method, sql, values) {
        requireSql(sql);
        const parameters = requireValues(values);
        metrics.queries++;
        try {
            const [result] = await client[method](sql, parameters);
            markReady();
            return result;
        } catch (error) {
            metrics.failedQueries++;
            markFailure(error);
            throw error;
        }
    }

    function facade(client) {
        const query = (sql, values) => run(client, "query", sql, values);
        const prepare = (sql, values) => run(client, "execute", sql, values);
        return {
            query,
            prepare,
            single: async (sql, values) => {
                const rows = await query(sql, values);
                return Array.isArray(rows) && rows.length ? rows[0] : null;
            },
            scalar: async (sql, values) => {
                const rows = await query(sql, values);
                if (!Array.isArray(rows) || !rows.length || !rows[0] || typeof rows[0] !== "object") return null;
                const key = Object.keys(rows[0])[0];
                return key === undefined ? null : rows[0][key];
            },
            insert: async (sql, values) => {
                const result = await query(sql, values);
                return result && result.insertId !== undefined ? result.insertId : 0;
            },
            update: async (sql, values) => {
                const result = await query(sql, values);
                return result && result.affectedRows !== undefined ? result.affectedRows : 0;
            },
        };
    }

    const api = facade({
        query: (sql, values) => getPool().query(sql, values),
        execute: (sql, values) => getPool().execute(sql, values),
    });

    async function transaction(work) {
        requireEnabled();
        if (typeof work !== "function" && !Array.isArray(work)) {
            throw new TypeError("transaction expects a callback or an array of query steps");
        }

        metrics.transactions++;
        let connection = null;
        try {
            connection = await getPool().getConnection();
            await connection.beginTransaction();
            const tx = facade(connection);
            let result;
            if (typeof work === "function") {
                result = await work(tx);
            } else {
                result = [];
                for (const step of work) {
                    if (typeof step === "string") {
                        result.push(await tx.query(step));
                        continue;
                    }
                    if (!step || typeof step !== "object") throw new TypeError("Invalid transaction step");
                    result.push(await (step.prepare ? tx.prepare : tx.query)(step.query, step.values));
                }
            }
            await connection.commit();
            markReady();
            return result;
        } catch (error) {
            metrics.failedTransactions++;
            markFailure(error);
            if (connection) {
                try { await connection.rollback(); }
                catch (rollbackError) { logger.error(`[hmp-mysql] rollback failed: ${rollbackError.message || rollbackError}`); }
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async function ping() {
        if (!config.enabled || state === "closed") return false;
        try {
            await run(getPool(), "query", "SELECT 1", []);
            return state === "ready";
        } catch (_) {
            return false;
        }
    }

    function ready() {
        if (state === "ready") return Promise.resolve(true);
        if (!readyPromise) readyPromise = ping().finally(() => { readyPromise = null; });
        return readyPromise;
    }

    function status() {
        return {
            configured: Boolean(config.enabled),
            state,
            target: config.enabled ? config.target : "",
            lastError,
            uptimeMs: Date.now() - startedAt,
            metrics: { ...metrics },
        };
    }

    async function close() {
        if (state === "closed") return;
        const activePool = pool;
        pool = null;
        state = "closed";
        if (activePool) await activePool.end();
    }

    return {
        api: { ...api, transaction, ready, status },
        close,
    };
}

module.exports = { createDatabase };
