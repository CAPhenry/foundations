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

Events.on("resourceStart", async (name?: string) => {
    if (name && name !== "hmp-shops") return;
    await shops.start();
    logger.info("Shop registry, stock and transaction ledger ready");
    registerClosedTestingVendor();
});

// Closed-testing vendor on the Hogsmeade high street: a stationary Parry Pippin with limited stock,
// placed at a surveyed spot facing yaw 30. Exercises Character + hmp-interact + shop stock end to end.
function registerClosedTestingVendor(): void {
    try {
        shops.shops.register({
            id: "debug.pippins",
            resource: "hmp-shops",
            label: "J. Pippin's Potions",
            description: "Closed-testing potion vendor.",
            requirements: { character: true },
            interaction: {
                position: { x: 387146.8, y: -513882.3, z: -83219.8 },
                areaId: "Overland",
                radius: 300,
                character: { characterId: "PercivalPippin", yaw: 30 },
            },
            offers: [
                { id: "wiggenweld", item: "native:wiggenweld_potion", buyPrice: 25, sellPrice: 8, stock: 12, maxQuantity: 6 },
                { id: "edurus", item: "native:edurus_potion", buyPrice: 40, stock: null, maxQuantity: 3 },
                { id: "horklump", item: "native:horklump_juice", buyPrice: 5, stock: 30, maxQuantity: 10 },
            ],
        });
    } catch (error) {
        logger.error(`Closed-testing vendor not registered: ${messageOf(error)}`);
    }
}
