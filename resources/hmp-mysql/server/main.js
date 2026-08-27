const mysql = require("mysql2/promise");
const { loadConfig } = require("./config");
const { createDatabase } = require("./database");

const config = loadConfig();
const database = createDatabase({ createPool: mysql.createPool, config, logger: console });

for (const [name, value] of Object.entries(database.api)) Exports.register(name, value);

Events.on("resourceStop", (name) => {
    if (name && name !== "hmp-mysql") return;
    database.close().catch((error) => console.error(`[hmp-mysql] pool close failed: ${error.message || error}`));
});

if (!config.enabled) {
    console.info("[hmp-mysql] disabled; set HMP_MYSQL_URL or create data/hmp-mysql.json to enable it");
} else {
    database.api.ready().then((connected) => {
        if (connected) console.info(`[hmp-mysql] connected to ${config.target}`);
        else console.error(`[hmp-mysql] could not connect to ${config.target}; queries will keep retrying through the pool`);
    });
}
