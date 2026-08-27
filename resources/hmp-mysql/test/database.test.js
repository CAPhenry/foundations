const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadConfig, parseConnectionUrl } = require("../server/config");
const { createDatabase } = require("../server/database");

function fakeDriver() {
    const calls = [];
    const connection = {
        beginTransaction: async () => calls.push(["begin"]),
        commit: async () => calls.push(["commit"]),
        rollback: async () => calls.push(["rollback"]),
        release: () => calls.push(["release"]),
        query,
        execute,
    };
    const pool = {
        query,
        execute,
        getConnection: async () => { calls.push(["getConnection"]); return connection; },
        end: async () => calls.push(["end"]),
    };

    async function query(sql, values) {
        calls.push(["query", sql, values]);
        if (sql === "FAIL") throw new Error("expected failure");
        if (sql === "SELECT 1") return [[{ one: 1 }], []];
        if (sql === "SELECT rows") return [[{ id: 7, name: "Natsai" }, { id: 8, name: "Poppy" }], []];
        if (sql === "SELECT empty") return [[], []];
        if (sql === "INSERT row") return [{ insertId: 41, affectedRows: 1 }, []];
        if (sql === "UPDATE row") return [{ affectedRows: 3 }, []];
        return [[{ sql }], []];
    }

    async function execute(sql, values) {
        calls.push(["execute", sql, values]);
        return [[{ prepared: true }], []];
    }

    return { calls, pool, createPool: (config) => { calls.push(["createPool", config]); return pool; } };
}

async function databaseContract() {
    const driver = fakeDriver();
    const database = createDatabase({
        createPool: driver.createPool,
        config: {
            enabled: true,
            target: "db.internal:3306/hogwartsmp",
            pool: { host: "db.internal", password: "never-return-this" },
        },
        logger: { error: () => {} },
    });
    const db = database.api;

    assert.strictEqual(await db.ready(), true);
    assert.deepStrictEqual(await db.query("SELECT rows", [7]), [
        { id: 7, name: "Natsai" },
        { id: 8, name: "Poppy" },
    ]);
    assert.deepStrictEqual(await db.single("SELECT rows"), { id: 7, name: "Natsai" });
    assert.strictEqual(await db.single("SELECT empty"), null);
    assert.strictEqual(await db.scalar("SELECT rows"), 7);
    assert.strictEqual(await db.insert("INSERT row"), 41);
    assert.strictEqual(await db.update("UPDATE row"), 3);
    assert.deepStrictEqual(await db.prepare("SELECT prepared WHERE id = ?", [7]), [{ prepared: true }]);

    const callbackResult = await db.transaction(async (tx) => {
        assert.strictEqual(await tx.update("UPDATE row", [1]), 3);
        return "committed";
    });
    assert.strictEqual(callbackResult, "committed");

    const batchResult = await db.transaction([
        { query: "UPDATE row", values: [2] },
        { query: "SELECT prepared", values: { id: 7 }, prepare: true },
    ]);
    assert.strictEqual(batchResult.length, 2);
    assert.strictEqual(driver.calls.filter(([name]) => name === "commit").length, 2);
    assert.strictEqual(driver.calls.filter(([name]) => name === "release").length, 2);

    await assert.rejects(db.transaction([{ query: "FAIL" }]), /expected failure/);
    assert.strictEqual(driver.calls.filter(([name]) => name === "rollback").length, 1);
    assert.strictEqual(driver.calls.filter(([name]) => name === "release").length, 3);

    const status = db.status();
    assert.strictEqual(status.configured, true);
    assert.strictEqual(status.state, "degraded");
    assert.strictEqual(status.target, "db.internal:3306/hogwartsmp");
    assert.ok(!JSON.stringify(status).includes("never-return-this"));
    assert.strictEqual(status.metrics.transactions, 3);
    assert.strictEqual(status.metrics.failedTransactions, 1);

    await assert.rejects(db.query("", []), /non-empty string/);
    await assert.rejects(db.query("SELECT rows", "bad"), /array or named-parameter object/);
    await database.close();
    assert.strictEqual(db.status().state, "closed");
    await assert.rejects(db.query("SELECT rows"), (error) => error.code === "HMP_MYSQL_CLOSED");
}

async function disabledContract() {
    const database = createDatabase({
        createPool: () => { throw new Error("must not create a pool"); },
        config: { enabled: false, target: "", pool: {} },
    });
    assert.strictEqual(await database.api.ready(), false);
    assert.strictEqual(database.api.status().state, "disabled");
    await assert.rejects(database.api.query("SELECT 1"), (error) => error.code === "HMP_MYSQL_DISABLED");
}

function configurationContract() {
    assert.deepStrictEqual(parseConnectionUrl("mariadb://user:p%40ss@db.example:3307/game"), {
        host: "db.example",
        port: "3307",
        user: "user",
        password: "p@ss",
        database: "game",
    });
    assert.throws(() => parseConnectionUrl("postgres://db.example/game"), /mysql:\/\/ or mariadb:\/\//);

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hmp-mysql-test-"));
    try {
        fs.writeFileSync(path.join(temp, "database.json"), JSON.stringify({
            host: "maria.internal",
            user: "file-user",
            password: "file-password",
            database: "file-db",
            connectionLimit: 5,
        }));
        const config = loadConfig({
            cwd: temp,
            env: {
                HMP_MYSQL_CONFIG: "database.json",
                HMP_MYSQL_USER: "env-user",
                HMP_MYSQL_CONNECTION_LIMIT: "12",
            },
        });
        assert.strictEqual(config.enabled, true);
        assert.strictEqual(config.pool.host, "maria.internal");
        assert.strictEqual(config.pool.user, "env-user");
        assert.strictEqual(config.pool.password, "file-password");
        assert.strictEqual(config.pool.connectionLimit, 12);
        assert.strictEqual(config.pool.namedPlaceholders, true);
        assert.strictEqual(config.pool.multipleStatements, false);
        assert.strictEqual(config.target, "maria.internal:3306/file-db");

        const granular = loadConfig({ cwd: temp, env: { HMP_MYSQL_HOST: "mysql.internal" } });
        assert.strictEqual(granular.enabled, true);
        assert.strictEqual(granular.pool.database, "hogwartsmp");

        const disabled = loadConfig({ cwd: temp, env: { HMP_MYSQL_ENABLED: "false" } });
        assert.strictEqual(disabled.enabled, false);
        assert.strictEqual(disabled.source, "none");
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

(async () => {
    configurationContract();
    await databaseContract();
    await disabledContract();
    console.log("hmp-mysql source contract passed");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
