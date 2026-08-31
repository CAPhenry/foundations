import type { HmpNpcCatalogEntry } from "../types";

const ENEMIES: readonly HmpNpcCatalogEntry[] = Object.freeze([
    { id: "Goblin_Grunt", label: "Goblin grunt (melee)" },
    { id: "Goblin_Assassin", label: "Goblin assassin" },
    { id: "Goblin_Sniper", label: "Goblin sniper (crossbow)" },
    { id: "Goblin_Mage", label: "Goblin mage" },
    { id: "Goblin_Chieftain", label: "Goblin chieftain (heavy)" },
    { id: "Poacher_Grunt", label: "Poacher grunt" },
    { id: "Poacher_Captain", label: "Poacher captain" },
    { id: "Poacher_Mage", label: "Poacher mage" },
    { id: "Poacher_Sniper", label: "Poacher sniper" },
    { id: "Poacher_Soldier", label: "Poacher soldier" },
    { id: "Poacher_Tank", label: "Poacher tank" },
    { id: "Extortionist_Grunt", label: "Rookwood extortionist grunt" },
    { id: "Extortionist_Mage", label: "Rookwood extortionist mage" },
    { id: "Extortionist_Soldier", label: "Rookwood extortionist soldier" },
    { id: "Thief_Grunt", label: "Rookwood thief grunt" },
    { id: "Thief_Soldier", label: "Rookwood thief soldier" },
    { id: "Wolf", label: "Wolf" },
    { id: "Troll_Forest", label: "Forest troll (heavy, ~1100 hp)" },
    { id: "Spider_Venomous", label: "Venomous spider" },
    { id: "Dugbog_Marsh", label: "Marsh dugbog" },
    { id: "Inferius", label: "Inferius (undead)" },
    { id: "Mannequin", label: "Animated mannequin" },
    { id: "TombProtector_Grunt", label: "Tomb protector grunt (melee)" },
    { id: "Dragon_GreenWelsh", label: "Dragon — Green Welsh (boss, ~2600 hp)" },
    { id: "Death", label: "Death (endgame boss, ~103k hp)" },
    { id: "DeathMinion", label: "Death minion" },
    { id: "DeathlyDreamer", label: "Deathly dreamer (team=Player by default — spawn hostile)" },
    { id: "ChompingCabbage", label: "Chomping cabbage (passive plant)" },
    { id: "VenomousTentacula", label: "Venomous tentacula (passive plant)" },
    { id: "LeapingToadstool", label: "Leaping toadstool (passive plant)" },
    { id: "Ranrak", label: "Ranrak (goblin boss, ~8700 hp; A-poses outside encounter)" },
    { id: "Boss_Rookwood", label: "Victor Rookwood (boss)" },
    { id: "Boss_Harlow", label: "Theophilus Harlow (boss)" },
    { id: "Boss_Cassandra", label: "Cassandra Mason (boss)" },
    { id: "Boss_Solomon", label: "Solomon Sallow (boss)" },
    { id: "IslaMacFusty", label: "Isla MacFusty (passive story NPC)" },
    { id: "DeathlyNightmare", label: "Deathly nightmare (untested — path-inferred from Death family)" },
    { id: "Mandrake", label: "Mandrake (inert — no AI controller, static prop only)" },
    { id: "Flitterbloom", label: "Flitterbloom (inert — no AI controller, static prop only)" },
]);

const BY_ID = new Map(ENEMIES.map((entry) => [entry.id, entry]));

export function getCatalogEntry(id: string): HmpNpcCatalogEntry | null {
    const entry = BY_ID.get(id);
    return entry ? { ...entry } : null;
}

export function hasCatalogEntry(id: string): boolean {
    return BY_ID.has(id);
}

export function listCatalogEntries(): HmpNpcCatalogEntry[] {
    return ENEMIES.map((entry) => ({ ...entry }));
}
