import repositoryModule = require("./repository");
import schemaModule = require("./schema");
import serviceModule = require("./service");
import type { Player } from "./internal";

const { createRepository } = repositoryModule;
const { migrations } = schemaModule;
const { createBankingService } = serviceModule;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

const Hmp = Imports.get("hmp-lib");
const database = Imports.get("hmp-mysql");
const core = Imports.get("hmp-core");
const inventory = Imports.get("hmp-inventory");
const ui = Imports.get("hmp-ui");
const logger = Hmp.logger.create("hmp-banking");
const repository = createRepository(database);
const banking = createBankingService({ repository, core, inventory, ui, events: Events, logger, migrations });

for (const name of ["accounts", "organizations", "currencies", "transactions", "cash", "providers", "ui", "status"] as const) Exports.register(name, banking[name]);

Events.on("playerDisconnect", (player: Player) => banking.disconnect(player));
Events.on("hmp:character:may-switch", (request: { player: Player; allow: boolean; reason?: string }) => banking.maySwitch(request));
Events.on("hmp:character:unloading", (payload: { session?: { player?: Player } }) => {
    if (payload?.session?.player) banking.disconnect(payload.session.player);
});
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-banking") {
        banking.stop().catch((error) => logger.error(`Shutdown failed: ${messageOf(error)}`));
        return;
    }
    banking.removeForResource(name);
});

Events.on("resourceStart", async (name?: string) => {
    if (name && name !== "hmp-banking") return;
    await banking.start();
    logger.info("Bank accounts, cash bridge and transaction ledger ready");
});
