import serviceModule = require("./service");
import type { HmpLibClient } from "../../hmp-lib/types";
import type { NativeClientAudio } from "./internal";

declare const Audio: NativeClientAudio;

const { createAudioClient } = serviceModule;
const Hmp = Imports.get<HmpLibClient>("hmp-lib");
const logger = Hmp.logger.create("hmp-audio");
const audio = createAudioClient({ native: Audio });

for (const name of ["sounds", "catalog", "banks", "status"] as const) Exports.register(name, audio[name]);

Events.on("hmp-audio:catalog", (payload: unknown) => {
    if (!audio.applyCatalog(payload)) logger.warn("Rejected malformed server audio catalog");
});
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-audio") audio.stop();
    else audio.cleanup(name);
});
Events.emitServer("hmp-audio:ready", "{}");

logger.info("Client audio coordinator ready");
