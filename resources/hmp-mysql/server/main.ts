import mysql = require("mysql2/promise");
import configModule = require("./config");
import databaseModule = require("./database");
import type { SqlPool } from "./internal";

const { loadConfig } = configModule;
const { createDatabase } = databaseModule;

const config = loadConfig();
const database = createDatabase({
    createPool: (poolConfig) => mysql.createPool(poolConfig) as unknown as SqlPool,
    config,
    logger: console,
});

for (const [name, value] of Object.entries(database.api)) Exports.register(name, value);

Events.on("resourceStop", (name: unknown) => {
    if (name && name !== "hmp-mysql") return;
    database.close().catch((error: unknown) => console.error(`[hmp-mysql] pool close failed: ${error instanceof Error ? error.message : String(error)}`));
});

Events.on("resourceStart", async (name: unknown) => {
    if (name && name !== "hmp-mysql") return;
    if (!config.enabled) throw new Error("hmp-mysql is not configured; set HMP_MYSQL_URL or create data/hmp-mysql.json");
    if (!await database.api.ready()) throw new Error(`could not connect to ${config.target}`);
    console.info(`[hmp-mysql] connected to ${config.target}`);
});
// TypeScript source.
