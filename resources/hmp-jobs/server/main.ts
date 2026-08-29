import repositoryModule = require("./repository");
import schemaModule = require("./schema");
import serviceModule = require("./service");
import type { Player } from "./internal";

const { createRepository } = repositoryModule;
const { migrations } = schemaModule;
const { createJobsService } = serviceModule;
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

const Hmp = Imports.get("hmp-lib");
const database = Imports.get("hmp-mysql");
const core = Imports.get("hmp-core");
const banking = Imports.get("hmp-banking");
const ui = Imports.get("hmp-ui");
const interact = Imports.get("hmp-interact");
const logger = Hmp.logger.create("hmp-jobs");
const repository = createRepository(database);
const jobs = createJobsService({ repository, core, banking, interact, ui, events: Events, logger, migrations });

for (const name of ["jobs", "employment", "duty", "permissions", "payroll", "ui", "audit", "status"] as const) Exports.register(name, jobs[name]);

Events.on("hmp:character:loaded", (payload: { session?: { player?: Player } }) => payload?.session?.player ? jobs.characterLoaded(payload.session.player) : undefined);
Events.on("hmp:character:may-switch", (request: { player: Player; allow: boolean; reason?: string }) => jobs.maySwitch(request));
Events.on("hmp:character:unloading", (payload: { session?: { player?: Player } }) => payload?.session?.player ? jobs.disconnect(payload.session.player) : undefined);
Events.on("playerDisconnect", (player: Player) => jobs.disconnect(player));
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-jobs") {
        jobs.stop().catch((error) => logger.error(`Shutdown failed: ${messageOf(error)}`));
        return;
    }
    jobs.removeForResource(name);
});

Events.on("resourceStart", async (name?: string) => {
    if (name && name !== "hmp-jobs") return;
    await jobs.start();
    logger.info("Employment, duty, permissions and payroll ready");
});
