import clientModule = require("./service");
import type { HmpLibClient } from "../../hmp-lib/types";
import type { NativeClientBlips } from "./internal";

declare const Blips: NativeClientBlips;

const { createBlipsClient } = clientModule;
const Hmp = Imports.get<HmpLibClient>("hmp-lib");
const logger = Hmp.logger.create("hmp-blips");
const client = createBlipsClient({ native: Blips, logger });

Exports.register("status", client.status);
Events.on("hmp-blips:set", client.set);
Events.on("hmp-blips:remove", client.remove);
Events.on("hmp-blips:replay", client.replay);
Events.on("hmp-blips:clear", client.clear);
Events.on("hmp-blips:pulse", client.pulse);
Events.on("hmp-blips:players", client.setPlayers);
Events.on("resourceStop", (name?: string) => { if (!name || name === "hmp-blips") client.stop(); });
Events.emitServer("hmp-blips:ready", "{}");

logger.info("Client marker coordinator ready");
