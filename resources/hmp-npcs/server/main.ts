import { loadConfig } from "./config";
import { createNpcsService } from "./service";
import type { HmpLibServer } from "../../hmp-lib/types";
import type { NativeNpcs } from "./internal";

declare const NPC: NativeNpcs;

const RESOURCE = "hmp-npcs";
const Hmp = Imports.get<HmpLibServer>("hmp-lib");
const logger = Hmp.logger.create(RESOURCE);
const service = createNpcsService({ config: loadConfig(Hmp), native: NPC });

Exports.register("catalog", service.catalog);
Exports.register("spawn", service.spawn);
Exports.register("destroy", service.destroy);
Exports.register("clear", service.clear);
Exports.register("get", service.get);
Exports.register("list", service.list);
Exports.register("status", service.status);

Events.on("npcDied", (id: number) => service.died(id));
Events.on("resourceStop", (name?: string) => {
    if (!name || name === RESOURCE) service.stop();
    else service.clear(name);
});

logger.info(`NPC service ready: ${service.status().catalogSize} verified enemy definitions`);
