import clientModule = require("./service");

declare const Spells: {
    setPolicy(lockIds: string[], bonusLoadouts?: number): void;
    loadout(loadoutIndex?: number): { index: number; current: number; slots: Array<string | null> } | null;
    setLoadoutSlot(slot: number, spellName: string | null, loadoutIndex?: number): boolean;
    cast(slot: number): { accepted: boolean; slot: number; spellName: string | null; reason: string | null };
};

const { createSpellClient } = clientModule;
const client = createSpellClient({
    spells: Spells,
    events: Events,
    notify: (message: string) => Game.notify(message),
    log: (message: string) => console.info(message),
});

Exports.register("clientStatus", client.status);
Exports.register("loadout", client.loadout);
Exports.register("setLoadoutSlot", client.setLoadoutSlot);
Exports.register("cast", client.cast);

Events.on("hmp-spells:policy", client.apply);
Events.on("hmp-spells:diagnostic", client.diagnostic);
Events.on("spellCast", client.reportCast);
Events.on("resourceStop", (name?: string) => { if (!name || name === "hmp-spells") client.stop(); });

console.info("[hmp-spells] client spell policy coordinator ready");
