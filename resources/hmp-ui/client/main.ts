import uiModule = require("./ui");
import type { HmpLibClient } from "../../hmp-lib/types";

const { createUiClient } = uiModule;
const Hmp = Imports.get<HmpLibClient>("hmp-lib");
const ui = createUiClient({ web: Web, events: Events, game: Game, input: Hmp.input });

for (const name of ["notify", "alert", "input", "context", "progress", "close", "status"] as const) Exports.register(name, ui[name]);

Events.on("hmp-ui:request", (payload) => ui.receiveRequest(payload));
Events.on("hmp-ui:notify", (payload) => ui.receiveNotification(payload));
Events.on("hmp-ui:close", (payload) => ui.receiveClose(payload));
Events.on("resourceStop", (name?: string) => {
    if (!name || name === "hmp-ui") ui.stop();
});

console.info("[hmp-ui] client primitives ready");
