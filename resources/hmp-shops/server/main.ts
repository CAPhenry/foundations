import repositoryModule = require("./repository");
import schemaModule = require("./schema");
import serviceModule = require("./service");
import type { Player } from "./internal";

const { createRepository } = repositoryModule;
const { migrations } = schemaModule;
const { createShopsService } = serviceModule;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

const Hmp = Imports.get("hmp-lib");
const database = Imports.get("hmp-mysql");
const core = Imports.get("hmp-core");
const inventory = Imports.get("hmp-inventory");
const interact = Imports.get("hmp-interact");
const ui = Imports.get("hmp-ui");
const logger = Hmp.logger.create("hmp-shops");
const repository = createRepository(database);
const shops = createShopsService({ repository, core, inventory, interact, ui, events: Events, logger, migrations });

for (const name of ["shops", "currencies", "transactions", "stock", "status"] as const) Exports.register(name, shops[name]);

Events.on("playerDisconnect", (player: Player) => shops.disconnect(player));
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-shops") {
        shops.stop().catch((error) => logger.error(`Shutdown failed: ${messageOf(error)}`));
        return;
    }
    shops.removeForResource(name);
});

shops.start()
    .then(() => logger.info("Shop registry, stock and transaction ledger ready"))
    .catch((error) => logger.error(`Startup failed: ${messageOf(error)}`));
