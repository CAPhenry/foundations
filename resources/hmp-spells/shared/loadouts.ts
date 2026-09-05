import type { HmpSpellLoadoutAssignments, HmpSpellLoadoutSlots } from "../types";

function isNativeSpellName(value: string): boolean {
    return /^[A-Za-z0-9_]{1,100}$/.test(value);
}

function isModdedSpellPath(value: string): boolean {
    if (value.length < 4 || value.length > 512 || !value.startsWith("/") || value.includes("..")) return false;
    const dot = value.lastIndexOf(".");
    const slash = dot < 0 ? -1 : value.lastIndexOf("/", dot);
    const rootEnd = value.indexOf("/", 1);
    return dot >= 0 && dot + 1 < value.length && slash > 1 && slash + 1 < dot
        && rootEnd > 1 && rootEnd < slash + 1 && value.slice(1, rootEnd) !== "Game"
        && value.slice(slash + 1, dot) === value.slice(dot + 1);
}

// Mirrors shared/modules/spell_records.hpp: native quick-action names stay compact identifiers;
// modded spells use their full plugin-rooted SpellToolRecord asset path.
function normalizeSlotSpellId(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    // v1 compatibility: canonicalize old raw record paths and native names once at the storage
    // boundary. v2 slots always identify their provider explicitly.
    if (value.startsWith("/")) return isModdedSpellPath(value) ? `record:${value}` : null;
    if (value.length > 640) return null;
    const split = value.indexOf(":");
    if (split >= 0) {
        const provider = value.slice(0, split);
        const spell = value.slice(split + 1);
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(provider)) return null;
        if (provider === "record") return isModdedSpellPath(spell) ? value : null;
        if (provider === "native") return isNativeSpellName(spell) ? value : null;
        return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(spell) ? value : null;
    }
    return isNativeSpellName(value) ? `native:${value}` : null;
}

function normalizeLoadoutSlots(raw: unknown): HmpSpellLoadoutSlots | null {
    if (!Array.isArray(raw) || raw.length !== 4) return null;
    const slots: Array<string | null> = [];
    for (const rawSpell of raw) {
        if (rawSpell === null) { slots.push(null); continue; }
        const spell = normalizeSlotSpellId(rawSpell);
        if (!spell) return null;
        slots.push(spell);
    }
    return slots as HmpSpellLoadoutSlots;
}

function normalizeLoadoutAssignments(raw: unknown): HmpSpellLoadoutAssignments | null {
    if (!Array.isArray(raw) || raw.length !== 4) return null;
    const loadouts = raw.map(normalizeLoadoutSlots);
    if (loadouts.some((slots) => slots === null)) return null;
    return loadouts as HmpSpellLoadoutAssignments;
}

function cloneLoadoutAssignments(value: HmpSpellLoadoutAssignments): HmpSpellLoadoutAssignments {
    return value.map((slots) => [...slots]) as HmpSpellLoadoutAssignments;
}

export = { cloneLoadoutAssignments, isModdedSpellPath, isNativeSpellName, normalizeLoadoutAssignments, normalizeLoadoutSlots, normalizeSlotSpellId };
