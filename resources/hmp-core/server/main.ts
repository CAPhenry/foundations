import configModule = require("./config");
import repositoryModule = require("./repository");
import coreModule = require("./core");
import schemaModule = require("./schema");
import type { Player } from "./internal";

const { loadConfig } = configModule;
const { createRepository } = repositoryModule;
const { createCore } = coreModule;
const { migrations } = schemaModule;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

const Hmp = Imports.get("hmp-lib");
const database = Imports.get("hmp-mysql");
const logger = Hmp.logger.create("hmp-core");
const config = loadConfig(Hmp);
const repository = createRepository(database);
const core = createCore({
    repository,
    database,
    migrations,
    events: Events,
    listPlayers: () => PlayerManager.getAll(),
    logger,
    config,
});

for (const name of ["status", "identity", "accounts", "sessions", "characters", "groups", "metadata"] as const) {
    Exports.register(name, core[name]);
}

Events.on("playerConnect", (player: unknown) => {
    const currentPlayer = player as Player;
    core.connect(currentPlayer).catch((error: unknown) => {
        logger.error(`Could not initialize ${Hmp.player.format(currentPlayer)}: ${messageOf(error)}`);
        if (typeof currentPlayer.kick === "function") currentPlayer.kick("Server services are temporarily unavailable. Please try again later.");
    });
});

Events.on("playerDisconnect", (player: unknown) => {
    const currentPlayer = player as Player;
    core.disconnect(currentPlayer).catch((error: unknown) => logger.error(`Could not close ${Hmp.player.format(currentPlayer)}: ${messageOf(error)}`));
});

Events.on("resourceStop", (name: unknown) => {
    if (name === "hmp-core" || !name) {
        core.stop().catch((error: unknown) => logger.error(`Shutdown failed: ${messageOf(error)}`));
        return;
    }
    core.removeIdentityProvidersForResource(name as string);
});

Events.on("resourceStart", async (name: unknown) => {
    if (name && name !== "hmp-core") return;
    await core.start();
    logger.info("Accounts, characters, groups and metadata are ready");
});
// TypeScript source.
