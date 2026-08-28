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

if (!config.enabled) {
    console.info("[hmp-mysql] disabled; set HMP_MYSQL_URL or create data/hmp-mysql.json to enable it");
} else {
    database.api.ready().then((connected) => {
        if (connected) console.info(`[hmp-mysql] connected to ${config.target}`);
        else console.error(`[hmp-mysql] could not connect to ${config.target}; queries will keep retrying through the pool`);
    });
}
// TypeScript source.
