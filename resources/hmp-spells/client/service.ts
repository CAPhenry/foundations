import type { HmpResolvedSpellPolicy } from "../types";

interface NativeSpellLoadout {
    index: number;
    current: number;
    slots: Array<string | null>;
}

interface NativeSpellCastResult {
    accepted: boolean;
    slot: number;
    spellName: string | null;
    reason: string | null;
}

interface NativeSpells {
    setPolicy(lockIds: string[], bonusLoadouts?: number): void;
    loadout(loadoutIndex?: number): NativeSpellLoadout | null;
    setLoadoutSlot(slot: number, spellName: string | null, loadoutIndex?: number): boolean;
    cast(slot: number): NativeSpellCastResult;
}

interface ClientDependencies {
    spells: NativeSpells;
    events: { emitServer(eventName: string, payload?: unknown): void };
    notify?(message: string): void;
    log?(message: string): void;
}

function parsePayload(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string") {
        try { return JSON.parse(raw) as Record<string, unknown>; }
        catch (_) { return {}; }
    }
    return raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
}

function normalizePolicy(raw: unknown): HmpResolvedSpellPolicy {
    const value = parsePayload(raw);
    const unlockSpells = Array.isArray(value.unlockSpells)
        ? [...new Set(value.unlockSpells.filter((entry): entry is string => typeof entry === "string" && /^Spell_[A-Za-z0-9_]+$/.test(entry)))]
        : [];
    const number = Number(value.bonusLoadouts);
    const bonusLoadouts = value.bonusLoadouts !== null && Number.isSafeInteger(number) && number >= 0 && number <= 3 ? number : null;
    return { unlockSpells, bonusLoadouts };
}

function createSpellClient(dependencies: ClientDependencies) {
    let current = normalizePolicy({});
    let ready = false;
    let stopped = false;

    function apply(raw: unknown): HmpResolvedSpellPolicy {
        if (stopped) return current;
        const next = normalizePolicy(raw);
        dependencies.spells.setPolicy(next.unlockSpells, next.bonusLoadouts === null ? -1 : next.bonusLoadouts);
        current = next;
        ready = true;
        return current;
    }

    function loadout(index?: number): NativeSpellLoadout | null {
        return index === undefined ? dependencies.spells.loadout() : dependencies.spells.loadout(index);
    }

    function setLoadoutSlot(slot: number, spellName: string | null, loadoutIndex?: number): boolean {
        return loadoutIndex === undefined
            ? dependencies.spells.setLoadoutSlot(slot, spellName)
            : dependencies.spells.setLoadoutSlot(slot, spellName, loadoutIndex);
    }

    function cast(slot: number): NativeSpellCastResult {
        return dependencies.spells.cast(slot);
    }

    function diagnostic(raw: unknown): void {
        const value = parsePayload(raw);
        if (String(value.action || "") !== "loadout") return;
        const state = loadout();
        if (!state) { dependencies.notify?.("[spells] spell loadout is not available yet"); return; }
        const labels = state.slots.map((spell, index) => `${index}:${spell || "empty"}`).join(", ");
        dependencies.log?.(`[hmp-spells] loadout ${state.index + 1}/4 (active ${state.current + 1}): ${labels}`);
        dependencies.notify?.(`[spells] active loadout ${state.current + 1}: ${labels}`);
    }

    function reportCast(path: unknown): void {
        const spell = String(path || "").slice(0, 500);
        const name = (spell.match(/\/Spells\/([^/]+)\//) || [])[1] || "";
        dependencies.events.emitServer("hmp-spells:cast", JSON.stringify({ spell, name }));
    }

    function stop(): void {
        if (stopped) return;
        stopped = true;
        dependencies.spells.setPolicy([], -1);
        current = normalizePolicy({});
        ready = false;
    }

    dependencies.events.emitServer("hmp-spells:ready");
    return Object.freeze({ apply, loadout, setLoadoutSlot, cast, diagnostic, reportCast, stop, status: () => ({ ready, stopped, policy: current }) });
}

export = { createSpellClient, normalizePolicy, parsePayload };
