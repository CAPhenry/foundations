import clientModule = require("./service");
import type { HmpLibClient } from "../../hmp-lib/types";

declare const Spells: {
    setPolicy(lockIds: string[], bonusLoadouts?: number): void;
    currentLoadout(): number | null;
    loadout(loadoutIndex?: number): { index: number; current: number; slots: Array<string | null> } | null;
    setLoadoutSlot(slot: number, spellName: string | null, loadoutIndex?: number, emitAssignmentEvent?: boolean): boolean;
    cast(slot: number): { accepted: boolean; slot: number; spellName: string | null; reason: string | null };
    castRecord(recordPath: string, aimMode?: number): { accepted: boolean; slot: number; spellName: string | null; reason: string | null };
};

const { createSpellClient } = clientModule;
const Hmp = Imports.get<HmpLibClient>("hmp-lib");
const logger = Hmp.logger.create("hmp-spells");
const client = createSpellClient({
    spells: Spells,
    events: Events,
    notify: (message: string) => Game.notify(message),
    log: (message: string) => console.info(message),
    debug: (message: string) => logger.debug(message),
});

Exports.register("clientStatus", client.status);
Exports.register("loadout", client.loadout);
Exports.register("setLoadoutSlot", client.setLoadoutSlot);
Exports.register("cast", client.cast);
Exports.register("importNativeAssignments", client.importNativeAssignments);

Events.on("hmp-spells:policy", client.apply);
Events.on("hmp-spells:assignments-saved", client.acknowledgeAssignments);
Events.on("hmp-spells:diagnostic", client.diagnostic);
Events.on("spellAssignment", client.importNativeAssignments);
Events.on("spellCast", client.reportCast);
Events.on("resourceStop", (name?: string) => { if (!name || name === "hmp-spells") client.stop(); });

console.info("[hmp-spells] client spell policy coordinator ready");
